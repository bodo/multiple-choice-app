"""Per-page grid cell with direct, inline annotation."""

from __future__ import annotations

import copy
from collections.abc import Callable

from PIL import Image
from PySide6.QtCore import QPointF, QRectF, QTimer, Qt, Signal
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
    PREVIEW_RENDER_SCALE,
    RENDER_SCALE,
    estimate_page_height_for_width,
    pil_rgb_to_qimage,
    render_pdf_page_qimage,
    render_with_boxes,
)
from render_tasks import PreviewRunnable

GRID_CANVAS_W = 880


def _pil_to_qpixmap(img: Image.Image) -> QPixmap:
    return QPixmap.fromImage(pil_rgb_to_qimage(img))


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


class StaticBoxItem(QGraphicsRectItem):
    """Non-interactive box overlay (other exercises / subs on same page)."""

    def __init__(
        self, box: dict, scene_w: int, scene_h: int, ann: dict
    ) -> None:
        super().__init__()
        self._box = box
        self._scene_w = scene_w
        self._scene_h = scene_h
        ex, sub = box["exercise"], box["sub"]
        red, green, blue = ex_sub_rgb(ann, ex, sub)
        self._label_color = QColor(red, green, blue)
        self._caption = box_caption(ann, ex, sub)
        self._font_px = max(11, int(round(scene_h * 0.022)))
        rn = box["rect"]
        x0, y0 = rn[0] * scene_w, rn[1] * scene_h
        x1, y1 = rn[2] * scene_w, rn[3] * scene_h
        self.setRect(QRectF(x0, y0, x1 - x0, y1 - y0).normalized())
        self.setPen(QPen(self._label_color, 2))
        self.setBrush(QColor(red, green, blue, 50))

    def paint(self, painter: QPainter, option, widget=None) -> None:
        super().paint(painter, option, widget)
        painter.save()
        f = QFont()
        f.setPixelSize(self._font_px)
        painter.setFont(f)
        rect = self.rect()
        fm = painter.fontMetrics()
        pad = max(2, self._font_px // 5)
        tx = float(rect.left() + pad)
        ty = float(rect.top() + fm.ascent() + pad)
        tw = float(fm.horizontalAdvance(self._caption))
        th = float(fm.height())
        ascent = float(fm.ascent())
        bg = QRectF(tx - pad, ty - ascent - pad, tw + 2 * pad, th + 2 * pad)
        painter.fillRect(bg, QColor(255, 255, 255, 128))
        painter.setPen(self._label_color)
        painter.drawText(int(tx), int(ty), self._caption)
        painter.restore()


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
        self._notify_timer = QTimer()
        self._notify_timer.setSingleShot(True)
        self._notify_timer.setInterval(180)
        self._notify_timer.timeout.connect(self._flush_notify)
        ex, sub = box["exercise"], box["sub"]
        red, green, blue = ex_sub_rgb(ann, ex, sub)
        self._label_color = QColor(red, green, blue)
        self._caption = box_caption(ann, ex, sub)
        self._font_px = max(11, int(round(scene_h * 0.022)))
        rn = box["rect"]
        x0, y0 = rn[0] * scene_w, rn[1] * scene_h
        x1, y1 = rn[2] * scene_w, rn[3] * scene_h
        self.setRect(QRectF(x0, y0, x1 - x0, y1 - y0).normalized())
        self.setPen(QPen(self._label_color, 2))
        self.setBrush(QColor(0, 0, 0, 0))
        self.setFlag(QGraphicsItem.GraphicsItemFlag.ItemIsMovable, True)
        self.setFlag(QGraphicsItem.GraphicsItemFlag.ItemIsSelectable, True)
        self.setFlag(QGraphicsItem.GraphicsItemFlag.ItemSendsGeometryChanges, True)

    def _schedule_notify(self) -> None:
        self._notify_timer.start()

    def _flush_notify(self) -> None:
        self._on_changed()

    def flush_notify_pending(self) -> None:
        if self._notify_timer.isActive():
            self._notify_timer.stop()
        self._on_changed()

    def paint(self, painter: QPainter, option, widget=None) -> None:
        super().paint(painter, option, widget)
        painter.save()
        f = QFont()
        f.setPixelSize(self._font_px)
        painter.setFont(f)
        rect = self.rect()
        fm = painter.fontMetrics()
        pad = max(2, self._font_px // 5)
        tx = float(rect.left() + pad)
        ty = float(rect.top() + fm.ascent() + pad)
        tw = float(fm.horizontalAdvance(self._caption))
        th = float(fm.height())
        ascent = float(fm.ascent())
        bg = QRectF(tx - pad, ty - ascent - pad, tw + 2 * pad, th + 2 * pad)
        painter.fillRect(bg, QColor(255, 255, 255, 128))
        painter.setPen(self._label_color)
        painter.drawText(int(tx), int(ty), self._caption)
        painter.restore()

    def itemChange(self, change, value):
        if change == QGraphicsItem.GraphicsItemChange.ItemPositionHasChanged:
            self._sync_from_scene()
            self._schedule_notify()
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
        self._resize_timer = QTimer(self)
        self._resize_timer.setSingleShot(True)
        self._resize_timer.setInterval(120)
        self._resize_timer.timeout.connect(self._on_resize_debounce)
        self._pending_resize_width: int | None = None
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

    def set_ex_sub(self, ex: str, sub: str) -> None:
        self._ex = ex
        self._sub = sub
        r0, g0, b0 = ex_sub_rgb(self._ann, ex, sub)
        self._draw_color = QColor(r0, g0, b0)
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
            self._pending_resize_width = nw
            self._resize_timer.start()

    def _on_resize_debounce(self) -> None:
        self.rebuild_scene()

    def _remove_overlay_items(self) -> None:
        for it in list(self._scene.items()):
            if isinstance(it, QGraphicsPixmapItem):
                continue
            self._scene.removeItem(it)

    def _rebuild_pdf_layer(self, cw: int) -> None:
        q = render_pdf_page_qimage(self._pdf_path, self._page_num, cw)
        self._scene_w = cw
        self._scene_h = q.height()
        self._scene.setSceneRect(0, 0, self._scene_w, self._scene_h)
        if self._bg_item is not None:
            self._scene.removeItem(self._bg_item)
            self._bg_item = None
        pm = QPixmap.fromImage(q)
        self._bg_item = self._scene.addPixmap(pm)
        self._bg_item.setZValue(0)

    def _rebuild_overlay_items(self) -> None:
        self._remove_overlay_items()
        page_boxes = [
            b
            for b in self._ann["boxes"]
            if b["pdf"] == self._pdf_name and b["page"] == self._page_num
        ]
        cur = [
            b
            for b in page_boxes
            if b["exercise"] == self._ex and b["sub"] == self._sub
        ]
        others = [
            b
            for b in page_boxes
            if not (b["exercise"] == self._ex and b["sub"] == self._sub)
        ]
        for box in others:
            it = StaticBoxItem(box, self._scene_w, self._scene_h, self._ann)
            it.setZValue(1)
            self._scene.addItem(it)
        for box in cur:
            item = EditableBoxItem(
                box, self._scene_w, self._scene_h, self._ann, self._emit_changed
            )
            item.setZValue(2)
            self._scene.addItem(item)
        r0, g0, b0 = ex_sub_rgb(self._ann, self._ex, self._sub)
        self._draw_color = QColor(r0, g0, b0)
        self.setFixedSize(self._scene_w, self._scene_h)

    def rebuild_scene(self) -> None:
        cw = self._effective_canvas_width()
        self._rebuild_pdf_layer(cw)
        self._rebuild_overlay_items()

    def sync_overlay_items(self) -> None:
        """Update box items only (no PDF reraster)."""
        self._rebuild_overlay_items()

    def _flush_editable_notifications(self) -> None:
        for it in self._scene.items():
            if isinstance(it, EditableBoxItem):
                it.flush_notify_pending()

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
            self._rubber.setZValue(3)
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
            self.sync_overlay_items()
            return
        self._flush_editable_notifications()
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
                self._flush_editable_notifications()
                self._emit_changed()
                self.sync_overlay_items()
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
        preview_pool=None,
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
        self._cap: QLabel | None = None
        self._interactive = False
        self._preview_seq = 0
        self._preview_pool = preview_pool

        lay = QVBoxLayout(self)
        lay.setContentsMargins(4, 4, 4, 4)

        can = bool(sel_ex and sel_sub)

        if can:
            assert sel_ex is not None and sel_sub is not None
            self._cap = QLabel(
                f"✏ {pdf_name}  p.{page_num + 1}  —  Exercise {sel_ex} / {sel_sub}"
            )
            lay.addWidget(self._cap)

            self._body = QWidget()
            self._body_layout = QVBoxLayout(self._body)
            self._body_layout.setContentsMargins(0, 0, 0, 0)
            self._preview = ScaledPageLabel()
            ph = estimate_page_height_for_width(pdf_path, page_num, GRID_CANVAS_W)
            self._preview.setMinimumHeight(min(max(ph, 120), 3600))
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

    def is_interactive(self) -> bool:
        return self._interactive

    def set_selection(self, sel_ex: str | None, sel_sub: str | None) -> None:
        self._sel_ex = sel_ex
        self._sel_sub = sel_sub
        if self._cap and sel_ex and sel_sub:
            self._cap.setText(
                f"✏ {self._pdf_name}  p.{self._page_num + 1}  —  Exercise {sel_ex} / {sel_sub}"
            )
        if self._canvas is not None and sel_ex and sel_sub:
            self._canvas.set_ex_sub(sel_ex, sel_sub)
        self.schedule_preview(self._preview_pool)

    def schedule_preview(self, pool) -> None:
        """Request async preview; pool may be None to run sync (fallback)."""
        if self._preview is None:
            return
        self._preview_seq += 1
        rid = self._preview_seq
        page_boxes = [
            b
            for b in self._ann["boxes"]
            if b["pdf"] == self._pdf_name and b["page"] == self._page_num
        ]
        if pool is None:
            self._apply_preview_sync(page_boxes)
            return
        task = PreviewRunnable(
            rid,
            self._pdf_path,
            self._page_num,
            copy.deepcopy(page_boxes),
            copy.deepcopy(self._ann.get("exercises", {})),
            PREVIEW_RENDER_SCALE,
            self._on_preview_ready,
        )
        pool.start(task)

    def _on_preview_ready(self, rid: int, qim: QImage) -> None:
        if rid != self._preview_seq or self._preview is None:
            return
        self._preview.set_source_pixmap(QPixmap.fromImage(qim))

    def _apply_preview_sync(self, page_boxes: list[dict]) -> None:
        if self._preview is None:
            return
        img = render_with_boxes(
            self._pdf_path,
            self._page_num,
            page_boxes,
            self._ann,
            scale=PREVIEW_RENDER_SCALE,
        )
        self._preview.set_source_pixmap(_pil_to_qpixmap(img))

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
            self.schedule_preview(self._preview_pool)
            if self._hint:
                self._hint.setText(
                    "Preview — scroll this page into view to draw."
                )
        self._rebuild_remove_buttons()

    def _on_local_changed(self) -> None:
        if not self._interactive and self._preview is not None:
            self.schedule_preview(self._preview_pool)
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
                    self._canvas.sync_overlay_items()
                else:
                    self.schedule_preview(self._preview_pool)
                self._on_local_changed()

            rm.clicked.connect(lambda checked=False, fn=remove_one: fn())
            self._remove_layout.addWidget(rm)
