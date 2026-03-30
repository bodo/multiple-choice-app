"""Per-page grid cell with direct, inline annotation."""

from __future__ import annotations

import io
from collections.abc import Callable

from PIL import Image
from PySide6.QtCore import QPointF, QRectF, Qt, Signal
from PySide6.QtGui import QColor, QFont, QImage, QMouseEvent, QPainter, QPen, QPixmap
from PySide6.QtWidgets import (
    QFrame,
    QGraphicsItem,
    QGraphicsPixmapItem,
    QGraphicsRectItem,
    QGraphicsScene,
    QGraphicsView,
    QLabel,
    QPushButton,
    QSizePolicy,
    QVBoxLayout,
    QWidget,
)

from colors import box_caption, box_label, ex_sub_rgb
from pdf_render import (
    ANNOTATE_BG_SCALE,
    PREVIEW_RENDER_SCALE,
    RENDER_SCALE,
    render_with_boxes,
)

# Fallback width before layout knows viewport size; after show, actual column width is used.
GRID_CANVAS_W = 880


def _pil_to_qpixmap(img: Image.Image) -> QPixmap:
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return QPixmap.fromImage(QImage.fromData(buf.getvalue()))


class ScaledPageLabel(QLabel):
    def __init__(self, parent: QWidget | None = None) -> None:
        super().__init__(parent)
        self._source: QPixmap | None = None
        self.setAlignment(Qt.AlignmentFlag.AlignCenter)
        pol = QSizePolicy(QSizePolicy.Policy.Expanding, QSizePolicy.Policy.Minimum)
        pol.setHeightForWidth(True)
        self.setSizePolicy(pol)

    def set_source_pixmap(self, pm: QPixmap) -> None:
        self._source = pm
        self._apply_scale()

    def resizeEvent(self, event) -> None:
        super().resizeEvent(event)
        self._apply_scale()

    def showEvent(self, event) -> None:
        super().showEvent(event)
        self._apply_scale()

    def _apply_scale(self) -> None:
        if not self._source or self._source.isNull() or self.width() <= 1:
            return
        scaled = self._source.scaledToWidth(
            max(1, self.width() - 4),
            Qt.TransformationMode.SmoothTransformation,
        )
        super().setPixmap(scaled)


class EditableBoxItem(QGraphicsRectItem):
    """Movable rectangle synced to box['rect'] in normalized coordinates."""

    def __init__(
        self,
        box: dict,
        scene_w: int,
        scene_h: int,
        ann: dict,
        on_changed: Callable[[], None],
    ):
        super().__init__()
        self._box = box
        self._scene_w = scene_w
        self._scene_h = scene_h
        self._ann = ann
        self._on_changed = on_changed
        ex, sub = box["exercise"], box["sub"]
        r, g, b = ex_sub_rgb(ann, ex, sub)
        self._label_color = QColor(r, g, b)
        self._caption = box_caption(ann, ex, sub)
        self._font_px = max(11, int(round(scene_h * 0.022)))
        r = box["rect"]
        x0, y0 = r[0] * scene_w, r[1] * scene_h
        x1, y1 = r[2] * scene_w, r[3] * scene_h
        self.setRect(QRectF(x0, y0, x1 - x0, y1 - y0).normalized())
        self.setPen(QPen(self._label_color, 2))
        self.setBrush(QColor(0, 0, 0, 0))
        self.setFlag(QGraphicsItem.GraphicsItemFlag.ItemIsMovable, True)
        self.setFlag(QGraphicsItem.GraphicsItemFlag.ItemIsSelectable, True)
        self.setFlag(QGraphicsItem.GraphicsItemFlag.ItemSendsGeometryChanges, True)

    def paint(self, painter: QPainter, option, widget=None) -> None:
        super().paint(painter, option, widget)
        painter.save()
        f = QFont()
        f.setPixelSize(self._font_px)
        painter.setFont(f)
        rect = self.rect()
        fm = painter.fontMetrics()
        pad = max(2, self._font_px // 5)
        tx = rect.left() + pad
        ty = rect.top() + fm.ascent() + pad
        for dx, dy in ((-1, 0), (1, 0), (0, -1), (0, 1)):
            painter.setPen(QColor(255, 255, 255, 220))
            painter.drawText(int(tx + dx), int(ty + dy), self._caption)
        painter.setPen(self._label_color)
        painter.drawText(int(tx), int(ty), self._caption)
        painter.restore()

    def itemChange(self, change, value):
        if change == QGraphicsItem.GraphicsItemChange.ItemPositionHasChanged:
            self._sync_from_scene()
            self._on_changed()
        return super().itemChange(change, value)

    def _sync_from_scene(self) -> None:
        sr = self.sceneBoundingRect()
        w, h = self._scene_w, self._scene_h
        if w <= 0 or h <= 0:
            return
        x0 = max(0.0, min(1.0, sr.left() / w))
        y0 = max(0.0, min(1.0, sr.top() / h))
        x1 = max(0.0, min(1.0, sr.right() / w))
        y1 = max(0.0, min(1.0, sr.bottom() / h))
        self._box["rect"] = [min(x0, x1), min(y0, y1), max(x0, x1), max(y0, y1)]


class AnnotationCanvas(QGraphicsView):
    """Always-on drawing canvas for one PDF page."""

    changed = Signal()

    def __init__(
        self,
        pdf_path: str,
        pdf_name: str,
        page_num: int,
        ann: dict,
        ex: str,
        sub: str,
        parent: QWidget | None = None,
    ):
        super().__init__(parent)
        self._pdf_path = pdf_path
        self._pdf_name = pdf_name
        self._page_num = page_num
        self._ann = ann
        self._ex = ex
        self._sub = sub
        self._scene_w = 1
        self._scene_h = 1
        self._rubber: QGraphicsRectItem | None = None
        self._origin: QPointF | None = None
        self._bg_item: QGraphicsPixmapItem | None = None
        r0, g0, b0 = ex_sub_rgb(ann, ex, sub)
        self._draw_color = QColor(r0, g0, b0)

        self._scene = QGraphicsScene(self)
        self.setScene(self._scene)
        self.setRenderHint(QPainter.RenderHint.Antialiasing)
        self.setDragMode(QGraphicsView.DragMode.NoDrag)
        self.setHorizontalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAlwaysOff)
        self.setVerticalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAlwaysOff)
        self.setFocusPolicy(Qt.FocusPolicy.StrongFocus)
        pol = QSizePolicy(QSizePolicy.Policy.Expanding, QSizePolicy.Policy.Fixed)
        self.setSizePolicy(pol)

        self.rebuild_scene()

    def _effective_canvas_width(self) -> int:
        vw = self.viewport().width()
        if vw > 320:
            return vw
        return GRID_CANVAS_W

    def resizeEvent(self, event) -> None:
        super().resizeEvent(event)
        nw = self._effective_canvas_width()
        if self._scene_w > 1 and abs(nw - self._scene_w) > 32:
            self.rebuild_scene()

    def rebuild_scene(self) -> None:
        self._scene.clear()
        self._bg_item = None
        cw = self._effective_canvas_width()
        page_boxes = [
            b
            for b in self._ann["boxes"]
            if b["pdf"] == self._pdf_name and b["page"] == self._page_num
        ]
        # Show every box on the page in the pixmap except the active (ex, sub),
        # which are drawn as interactive EditableBoxItem on top (avoids double-draw).
        cur = [
            b
            for b in page_boxes
            if b["exercise"] == self._ex and b["sub"] == self._sub
        ]
        bg_boxes = [
            b
            for b in page_boxes
            if not (b["exercise"] == self._ex and b["sub"] == self._sub)
        ]
        bg_img = render_with_boxes(
            self._pdf_path, self._page_num, bg_boxes, self._ann, scale=ANNOTATE_BG_SCALE
        )
        ow, oh = bg_img.size
        canvas_h = int(oh * cw / ow)
        bg_img = bg_img.resize((cw, canvas_h), Image.Resampling.LANCZOS)
        self._scene_w = cw
        self._scene_h = canvas_h
        self._scene.setSceneRect(0, 0, self._scene_w, self._scene_h)
        r0, g0, b0 = ex_sub_rgb(self._ann, self._ex, self._sub)
        self._draw_color = QColor(r0, g0, b0)

        pm = _pil_to_qpixmap(bg_img)
        self._bg_item = self._scene.addPixmap(pm)
        self._bg_item.setZValue(0)

        for box in cur:
            item = EditableBoxItem(
                box, self._scene_w, self._scene_h, self._ann, self._emit_changed
            )
            item.setZValue(1)
            self._scene.addItem(item)

        self.setFixedSize(self._scene_w, self._scene_h)

    def _emit_changed(self) -> None:
        self.changed.emit()

    def mousePressEvent(self, event: QMouseEvent) -> None:
        self.setFocus(Qt.FocusReason.MouseFocusReason)
        if event.button() == Qt.MouseButton.LeftButton:
            sp = self.mapToScene(event.pos())
            it = self.itemAt(event.pos())
            if isinstance(it, EditableBoxItem):
                super().mousePressEvent(event)
                return
            self._scene.clearSelection()
            self._origin = sp
            self._rubber = QGraphicsRectItem()
            self._rubber.setPen(QPen(self._draw_color, 2, Qt.PenStyle.DashLine))
            self._rubber.setBrush(QColor(0, 0, 0, 0))
            self._rubber.setZValue(2)
            self._scene.addItem(self._rubber)
            self._rubber.setRect(QRectF(sp, sp))
            return
        super().mousePressEvent(event)

    def mouseMoveEvent(self, event: QMouseEvent) -> None:
        if self._rubber is not None and self._origin is not None:
            sp = self.mapToScene(event.pos())
            self._rubber.setRect(QRectF(self._origin, sp).normalized())
            return
        super().mouseMoveEvent(event)

    def mouseReleaseEvent(self, event: QMouseEvent) -> None:
        if (
            event.button() == Qt.MouseButton.LeftButton
            and self._rubber is not None
            and self._origin is not None
        ):
            r = self._rubber.rect()
            self._scene.removeItem(self._rubber)
            self._rubber = None
            self._origin = None
            w, h = self._scene_w, self._scene_h
            if r.width() < 4 or r.height() < 4:
                return
            norm = [
                max(0.0, min(1.0, r.left() / w)),
                max(0.0, min(1.0, r.top() / h)),
                max(0.0, min(1.0, r.right() / w)),
                max(0.0, min(1.0, r.bottom() / h)),
            ]
            self._ann["boxes"].append(
                {
                    "exercise": self._ex,
                    "sub": self._sub,
                    "pdf": self._pdf_name,
                    "page": self._page_num,
                    "rect": norm,
                }
            )
            self._emit_changed()
            self.rebuild_scene()
            return
        super().mouseReleaseEvent(event)

    def keyPressEvent(self, event) -> None:
        if event.key() in (Qt.Key.Key_Delete, Qt.Key.Key_Backspace):
            to_remove: list[EditableBoxItem] = []
            for it in self._scene.selectedItems():
                if isinstance(it, EditableBoxItem):
                    to_remove.append(it)
            for it in to_remove:
                b = it._box
                try:
                    self._ann["boxes"].remove(b)
                except ValueError:
                    pass
            if to_remove:
                self._emit_changed()
                self.rebuild_scene()
            return
        super().keyPressEvent(event)


class PageCellWidget(QFrame):
    """Grid cell: lightweight preview when off-screen; full canvas when near viewport."""

    annotation_changed = Signal()

    def __init__(
        self,
        pdf_path: str,
        pdf_name: str,
        page_num: int,
        ann: dict,
        sel_ex: str | None,
        sel_sub: str | None,
        parent: QWidget | None = None,
    ):
        super().__init__(parent)
        self._pdf_path = pdf_path
        self._pdf_name = pdf_name
        self._page_num = page_num
        self._ann = ann
        self._sel_ex = sel_ex
        self._sel_sub = sel_sub
        self._canvas: AnnotationCanvas | None = None
        self._preview: ScaledPageLabel | None = None
        self._remove_layout: QVBoxLayout | None = None
        self._body: QWidget | None = None
        self._body_layout: QVBoxLayout | None = None
        self._hint: QLabel | None = None
        self._interactive = False

        lay = QVBoxLayout(self)
        lay.setContentsMargins(4, 4, 4, 4)

        can = bool(sel_ex and sel_sub)

        if can:
            assert sel_ex is not None and sel_sub is not None
            cap = QLabel(
                f"✏ {pdf_name}  p.{page_num + 1}  —  Exercise {sel_ex} / {sel_sub}"
            )
            lay.addWidget(cap)

            self._body = QWidget()
            self._body_layout = QVBoxLayout(self._body)
            self._body_layout.setContentsMargins(0, 0, 0, 0)
            self._preview = ScaledPageLabel()
            self._body_layout.addWidget(self._preview)
            lay.addWidget(self._body)

            self._hint = QLabel(
                "Preview — scroll this page into view to draw."
            )
            lay.addWidget(self._hint)

            rm_wrap = QWidget()
            self._remove_layout = QVBoxLayout(rm_wrap)
            self._remove_layout.setContentsMargins(0, 0, 0, 0)
            lay.addWidget(rm_wrap)
            self._refresh_preview()
            self._rebuild_remove_buttons()
        else:
            page_boxes = [
                b
                for b in ann["boxes"]
                if b["pdf"] == pdf_name and b["page"] == page_num
            ]
            img = render_with_boxes(
                pdf_path, page_num, page_boxes, ann, scale=RENDER_SCALE
            )
            pm = _pil_to_qpixmap(img)
            lab = ScaledPageLabel()
            lab.set_source_pixmap(pm)
            lay.addWidget(lab)
            cap = QLabel(f"{pdf_name}  p.{page_num + 1}")
            lay.addWidget(cap)

    def ann_eligible(self) -> bool:
        return bool(self._sel_ex and self._sel_sub)

    def set_interactive(self, on: bool) -> None:
        if not self.ann_eligible() or self._body_layout is None or self._preview is None:
            return
        if on == self._interactive:
            return
        self._interactive = on
        if on:
            self._body_layout.removeWidget(self._preview)
            self._preview.hide()
            assert self._sel_ex is not None and self._sel_sub is not None
            assert self._body is not None
            self._canvas = AnnotationCanvas(
                self._pdf_path,
                self._pdf_name,
                self._page_num,
                self._ann,
                self._sel_ex,
                self._sel_sub,
                self._body,
            )
            self._body_layout.addWidget(self._canvas)
            self._canvas.changed.connect(self._on_local_changed)
            if self._hint:
                self._hint.setText(
                    "Drag to draw. Drag a box to move. Select + Delete to remove."
                )
        else:
            if self._canvas is not None:
                try:
                    self._canvas.changed.disconnect(self._on_local_changed)
                except TypeError:
                    pass
                self._body_layout.removeWidget(self._canvas)
                self._canvas.deleteLater()
                self._canvas = None
            self._body_layout.addWidget(self._preview)
            self._preview.show()
            self._refresh_preview()
            if self._hint:
                self._hint.setText(
                    "Preview — scroll this page into view to draw."
                )
        self._rebuild_remove_buttons()

    def _refresh_preview(self) -> None:
        if self._preview is None:
            return
        page_boxes = [
            b
            for b in self._ann["boxes"]
            if b["pdf"] == self._pdf_name and b["page"] == self._page_num
        ]
        img = render_with_boxes(
            self._pdf_path,
            self._page_num,
            page_boxes,
            self._ann,
            scale=PREVIEW_RENDER_SCALE,
        )
        self._preview.set_source_pixmap(_pil_to_qpixmap(img))

    def _on_local_changed(self) -> None:
        if not self._interactive and self._preview is not None:
            self._refresh_preview()
        self._rebuild_remove_buttons()
        self.annotation_changed.emit()

    def _rebuild_remove_buttons(self) -> None:
        if not self._remove_layout or not self._sel_ex or not self._sel_sub:
            return
        while self._remove_layout.count():
            item = self._remove_layout.takeAt(0)
            w = item.widget()
            if w:
                w.deleteLater()
        page_boxes = [
            b
            for b in self._ann["boxes"]
            if b["pdf"] == self._pdf_name
            and b["page"] == self._page_num
            and b["exercise"] == self._sel_ex
            and b["sub"] == self._sel_sub
        ]
        for idx, box in enumerate(page_boxes):
            lbl = box_label(self._ann, self._sel_ex, self._sel_sub)
            rm = QPushButton(f"Remove {lbl}.{idx + 1}")

            def remove_one(b: dict = box) -> None:
                try:
                    self._ann["boxes"].remove(b)
                except ValueError:
                    pass
                if self._canvas:
                    self._canvas.rebuild_scene()
                else:
                    self._refresh_preview()
                self._on_local_changed()

            rm.clicked.connect(lambda checked=False, fn=remove_one: fn())
            self._remove_layout.addWidget(rm)
