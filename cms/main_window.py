"""Main window: exam list, exercise/sub bars, grid, autosave, screenshots."""

from __future__ import annotations

import copy
from typing import Any

from PySide6.QtCore import QRunnable, QRect, QThreadPool, QTimer, Qt
from PySide6.QtWidgets import (
    QGridLayout,
    QHBoxLayout,
    QLabel,
    QListWidget,
    QListWidgetItem,
    QMainWindow,
    QMessageBox,
    QPushButton,
    QScrollArea,
    QStackedWidget,
    QVBoxLayout,
    QWidget,
)

from annotation_store import FLAT_PDFS, extract_screenshots, load_annotations, save_json
from pdf_render import get_page_list, page_raster_cache_clear
from page_cell import PageCellWidget

DEBOUNCE_MS = 500
IDLE_SCREENSHOT_MS = 5000
# Reserved subs after Main (separate screenshot categories via sub index).
ANSWER_KEY_SUB = "Answer Key"
ANSWER_OPTIONS_SUB = "Answer Options"
LEGACY_ANSWER_SUB = "Answer"


class MainWindow(QMainWindow):
    def __init__(self) -> None:
        super().__init__()
        self.setWindowTitle("Exam annotator")
        self.resize(1840, 980)

        self._exam: str | None = None
        self._ann: dict[str, Any] = {"exercises": {}, "boxes": []}
        self._sel_ex: str | None = None
        self._sel_sub: str | None = None
        self._pending_screenshots = False
        self._screenshot_busy = False
        self._page_cells: list[PageCellWidget] = []
        self._grid_sig: tuple[str, tuple[tuple[str, int], ...]] | None = None
        self._preview_pool = QThreadPool(self)
        self._preview_pool.setMaxThreadCount(3)

        self._debounce = QTimer(self)
        self._debounce.setSingleShot(True)
        self._debounce.setInterval(DEBOUNCE_MS)
        self._debounce.timeout.connect(self._flush_json)

        self._idle = QTimer(self)
        self._idle.setInterval(IDLE_SCREENSHOT_MS)
        self._idle.timeout.connect(self._maybe_idle_screenshots)

        root = QWidget()
        self.setCentralWidget(root)
        self._root_layout = QVBoxLayout(root)

        self._stack = QStackedWidget()
        self._root_layout.addWidget(self._stack)

        self._list_panel = QWidget()
        list_lay = QVBoxLayout(self._list_panel)
        self._list_widget = QListWidget()
        self._list_widget.itemDoubleClicked.connect(self._on_exam_chosen)
        list_lay.addWidget(self._list_widget)
        open_btn = QPushButton("Open")
        open_btn.clicked.connect(self._open_selected_exam)
        list_lay.addWidget(open_btn)
        self._stack.addWidget(self._list_panel)

        self._detail = QWidget()
        self._detail_layout = QVBoxLayout(self._detail)
        self._stack.addWidget(self._detail)

        self._status = QLabel("")
        self._root_layout.addWidget(self._status)

        self._build_detail_shell()
        self._refresh_exam_list()

    def _build_detail_shell(self) -> None:
        row_back = QHBoxLayout()
        self._btn_back = QPushButton("← Back")
        self._btn_back.clicked.connect(self._back_to_list)
        row_back.addWidget(self._btn_back)
        row_back.addStretch()
        self._detail_layout.addLayout(row_back)

        self._title = QLabel("")
        self._detail_layout.addWidget(self._title)

        self._exercise_label = QLabel("Exercise:")
        self._detail_layout.addWidget(self._exercise_label)
        self._exercise_row = QHBoxLayout()
        self._exercise_container = QWidget()
        self._exercise_container.setLayout(self._exercise_row)
        self._detail_layout.addWidget(self._exercise_container)

        self._sub_label = QLabel("Sub-exercise:")
        self._detail_layout.addWidget(self._sub_label)
        self._sub_row = QHBoxLayout()
        self._sub_container = QWidget()
        self._sub_container.setLayout(self._sub_row)
        self._detail_layout.addWidget(self._sub_container)

        self._save_top = QPushButton("💾 Save")
        self._save_top.clicked.connect(self._save_now)
        self._detail_layout.addWidget(self._save_top)

        self._scroll = QScrollArea()
        self._scroll.setWidgetResizable(True)
        self._grid_host = QWidget()
        self._grid_layout = QGridLayout(self._grid_host)
        self._grid_layout.setSpacing(8)
        for c in range(2):
            self._grid_layout.setColumnStretch(c, 1)
        self._scroll.setWidget(self._grid_host)
        sb_v = self._scroll.verticalScrollBar()
        sb_h = self._scroll.horizontalScrollBar()
        sb_v.valueChanged.connect(self._update_lazy_cells)
        sb_h.valueChanged.connect(self._update_lazy_cells)
        self._detail_layout.addWidget(self._scroll, stretch=1)

        self._save_bot = QPushButton("💾 Save")
        self._save_bot.clicked.connect(self._save_now)
        self._detail_layout.addWidget(self._save_bot)

    def _refresh_exam_list(self) -> None:
        self._list_widget.clear()
        if not FLAT_PDFS.is_dir():
            FLAT_PDFS.mkdir(parents=True, exist_ok=True)
        folders = sorted(d for d in FLAT_PDFS.iterdir() if d.is_dir())
        for folder in folders:
            n = len(list(folder.glob("*.pdf")))
            item = QListWidgetItem(f"{folder.name}  —  {n} PDF{'s' if n != 1 else ''}")
            item.setData(Qt.ItemDataRole.UserRole, folder.name)
            self._list_widget.addItem(item)

    def _on_exam_chosen(self, item: QListWidgetItem) -> None:
        exam = item.data(Qt.ItemDataRole.UserRole)
        if exam:
            self._open_exam(str(exam))

    def _open_selected_exam(self) -> None:
        item = self._list_widget.currentItem()
        if item:
            self._on_exam_chosen(item)

    def _open_exam(self, exam: str) -> None:
        self._exam = exam
        self._ann = load_annotations(exam)
        if not self._ann["exercises"]:
            self._ann["exercises"]["1"] = {
                "subs": ["Main", ANSWER_KEY_SUB, ANSWER_OPTIONS_SUB],
            }
        self._sel_ex = sorted(self._ann["exercises"].keys(), key=lambda x: int(x))[0]
        subs = self._ann["exercises"][self._sel_ex].get("subs", [])
        if not subs:
            subs = ["Main", ANSWER_KEY_SUB, ANSWER_OPTIONS_SUB]
            self._ann["exercises"][self._sel_ex]["subs"] = subs
        if self._normalize_all_reserved_subs():
            self._on_annotation_changed()
        self._sel_sub = self._ann["exercises"][self._sel_ex]["subs"][0]
        self._pending_screenshots = False
        self._stack.setCurrentWidget(self._detail)
        self._title.setText(exam)
        self._idle.start()
        self._rebuild_exercise_bar()
        self._rebuild_sub_bar()
        self._refresh_grid()

    def _back_to_list(self) -> None:
        self._debounce.stop()
        if self._exam:
            try:
                save_json(self._exam, self._ann)
            except OSError as e:
                QMessageBox.warning(self, "Save", str(e))
            if self._pending_screenshots:
                try:
                    extract_screenshots(self._exam, self._ann)
                except Exception as e:
                    QMessageBox.warning(self, "Screenshots", str(e))
                self._pending_screenshots = False
        self._exam = None
        self._idle.stop()
        page_raster_cache_clear()
        self._stack.setCurrentWidget(self._list_panel)
        self._refresh_exam_list()
        self._status.setText("")

    def _rebuild_exercise_bar(self) -> None:
        while self._exercise_row.count():
            w = self._exercise_row.takeAt(0).widget()
            if w:
                w.deleteLater()
        ann = self._ann
        exercises = list(ann["exercises"].keys())
        for ex in exercises:
            active = self._sel_ex == ex
            b = QPushButton(ex)
            if active:
                b.setStyleSheet("font-weight: bold;")
            b.clicked.connect(lambda checked=False, e=ex: self._select_exercise(e))
            self._exercise_row.addWidget(b)
        add = QPushButton("➕")
        add.clicked.connect(self._add_exercise)
        self._exercise_row.addWidget(add)
        self._exercise_row.addStretch()

    def _select_exercise(self, ex: str) -> None:
        self._sel_ex = ex
        subs = self._ann["exercises"][ex]["subs"]
        self._sel_sub = subs[0] if subs else None
        self._rebuild_exercise_bar()
        self._rebuild_sub_bar()
        self._refresh_grid()

    def _add_exercise(self) -> None:
        n = len(self._ann["exercises"])
        new_ex = str(n + 1)
        self._ann["exercises"][new_ex] = {
            "subs": ["Main", ANSWER_KEY_SUB, ANSWER_OPTIONS_SUB],
        }
        self._sel_ex = new_ex
        self._sel_sub = "Main"
        self._on_annotation_changed()
        self._rebuild_exercise_bar()
        self._rebuild_sub_bar()
        self._refresh_grid()

    def _migrate_legacy_answer_in_boxes(self) -> bool:
        changed = False
        for b in self._ann.get("boxes", []):
            if b.get("sub") == LEGACY_ANSWER_SUB:
                b["sub"] = ANSWER_KEY_SUB
                changed = True
        return changed

    def _normalize_all_reserved_subs(self) -> bool:
        changed = self._migrate_legacy_answer_in_boxes()
        for ex in self._ann["exercises"]:
            if self._ensure_reserved_subs_for_ex(ex):
                changed = True
        return changed

    def _ensure_reserved_subs_for_ex(self, ex: str) -> bool:
        """Main, Answer Key, Answer Options, then custom subs. Migrates legacy Answer."""
        entry = self._ann["exercises"].setdefault(ex, {})
        subs = entry.get("subs")
        if subs is None:
            subs = []
        changed = False
        for i, s in enumerate(subs):
            if s == LEGACY_ANSWER_SUB:
                subs[i] = ANSWER_KEY_SUB
                changed = True
        if not subs:
            entry["subs"] = ["Main", ANSWER_KEY_SUB, ANSWER_OPTIONS_SUB]
            return True
        tail = [
            s
            for s in subs
            if s not in ("Main", ANSWER_KEY_SUB, ANSWER_OPTIONS_SUB)
        ]
        new_subs = ["Main", ANSWER_KEY_SUB, ANSWER_OPTIONS_SUB] + tail
        if new_subs != subs:
            entry["subs"] = new_subs
            return True
        return changed

    def _sub_bar_button_order(self, subs: list[str]) -> list[str]:
        """Main, Answer Key, Answer Options, then remaining subs."""
        rest = [
            s
            for s in subs
            if s not in ("Main", ANSWER_KEY_SUB, ANSWER_OPTIONS_SUB)
        ]
        out: list[str] = []
        if "Main" in subs:
            out.append("Main")
        if ANSWER_KEY_SUB in subs:
            out.append(ANSWER_KEY_SUB)
        if ANSWER_OPTIONS_SUB in subs:
            out.append(ANSWER_OPTIONS_SUB)
        out.extend(rest)
        if not out and subs:
            out = list(subs)
        return out

    def _rebuild_sub_bar(self) -> None:
        while self._sub_row.count():
            w = self._sub_row.takeAt(0).widget()
            if w:
                w.deleteLater()
        ex = self._sel_ex
        if not ex:
            self._sub_container.hide()
            return
        self._sub_container.show()
        if self._ensure_reserved_subs_for_ex(ex):
            self._on_annotation_changed()
        subs = self._ann["exercises"].get(ex, {}).get("subs", [])
        for sub in self._sub_bar_button_order(subs):
            active = self._sel_sub == sub
            b = QPushButton(sub)
            if active:
                b.setStyleSheet("font-weight: bold;")
            b.clicked.connect(lambda checked=False, s=sub: self._select_sub(s))
            self._sub_row.addWidget(b)
        n = len(subs)
        label = "Main" if n == 0 else f"Sub-Exercise {n}"
        add = QPushButton(f"➕ {label}")
        add.clicked.connect(self._add_sub)
        self._sub_row.addWidget(add)
        self._sub_row.addStretch()

    def _select_sub(self, sub: str) -> None:
        self._sel_sub = sub
        self._rebuild_sub_bar()
        self._rebuild_exercise_bar()
        self._refresh_grid()

    def _add_sub(self) -> None:
        ex = self._sel_ex
        if not ex:
            return
        subs = self._ann["exercises"][ex]["subs"]
        n = len(subs)
        label = "Main" if n == 0 else f"Sub-Exercise {n}"
        self._ann["exercises"][ex]["subs"].append(label)
        self._sel_sub = label
        self._on_annotation_changed()
        self._rebuild_sub_bar()
        self._rebuild_exercise_bar()
        self._refresh_grid()

    def _clear_grid(self) -> None:
        self._page_cells.clear()
        self._grid_sig = None
        while self._grid_layout.count():
            item = self._grid_layout.takeAt(0)
            w = item.widget()
            if w:
                w.deleteLater()

    def _refresh_grid(self) -> None:
        if not self._exam:
            self._clear_grid()
            return
        exam_dir = FLAT_PDFS / self._exam
        pages = get_page_list(exam_dir)
        sig: tuple[str, tuple[tuple[str, int], ...]] = (
            self._exam,
            tuple((name, num) for _path, name, num in pages),
        )
        if (
            sig == self._grid_sig
            and len(self._page_cells) == len(pages)
            and self._page_cells
        ):
            for cell, _tri in zip(self._page_cells, pages):
                cell.set_selection(self._sel_ex, self._sel_sub)
            QTimer.singleShot(0, self._after_grid_layout)
            return

        self._clear_grid()
        self._grid_sig = sig
        for i, (path, pdf_name, page_num) in enumerate(pages):
            row, col = divmod(i, 2)
            cell = PageCellWidget(
                path,
                pdf_name,
                page_num,
                self._ann,
                self._sel_ex,
                self._sel_sub,
                preview_pool=self._preview_pool,
            )
            cell.annotation_changed.connect(self._on_annotation_changed)
            self._page_cells.append(cell)
            self._grid_layout.addWidget(cell, row, col)
        QTimer.singleShot(0, self._after_grid_layout)

    def _after_grid_layout(self) -> None:
        self._update_lazy_cells()
        for cell in self._page_cells:
            if cell.ann_eligible() and not cell.is_interactive():
                cell.schedule_preview(self._preview_pool)

    def _update_lazy_cells(self) -> None:
        """Only pages near the scroll viewport keep a full QGraphicsView; others use a light preview."""
        if not self._exam or not self._page_cells:
            return
        x = self._scroll.horizontalScrollBar().value()
        y = self._scroll.verticalScrollBar().value()
        w = self._scroll.viewport().width()
        h = self._scroll.viewport().height()
        margin = 500
        vis = QRect(x - margin, y - margin, w + 2 * margin, h + 2 * margin)
        for cell in self._page_cells:
            if not cell.ann_eligible():
                continue
            cell.set_interactive(vis.intersects(cell.geometry()))

    def resizeEvent(self, event) -> None:
        super().resizeEvent(event)
        if self._exam:
            QTimer.singleShot(0, self._update_lazy_cells)

    def _on_annotation_changed(self) -> None:
        self._pending_screenshots = True
        self._status.setText("Unsaved changes…")
        self._debounce.start()

    def _flush_json(self) -> None:
        if not self._exam:
            return
        self._status.setText("Saving…")
        try:
            save_json(self._exam, self._ann)
        except OSError as e:
            self._status.setText(f"Error: {e}")
            return
        self._status.setText("Saved (annotations)")

    def _save_now(self) -> None:
        self._debounce.stop()
        if not self._exam:
            return
        self._status.setText("Saving…")
        try:
            save_json(self._exam, self._ann)
            extract_screenshots(self._exam, self._ann)
        except Exception as e:
            self._status.setText(f"Error: {e}")
            QMessageBox.warning(self, "Save", str(e))
            return
        self._pending_screenshots = False
        self._status.setText("Saved")

    def _maybe_idle_screenshots(self) -> None:
        if not self._exam or not self._pending_screenshots or self._screenshot_busy:
            return
        self._screenshot_busy = True
        self._status.setText("Saving screenshots…")
        exam = self._exam
        snapshot = copy.deepcopy(self._ann)

        def done() -> None:
            self._screenshot_busy = False
            if snapshot == self._ann:
                self._pending_screenshots = False
                self._status.setText("Saved (screenshots)")
            else:
                self._pending_screenshots = True
                self._status.setText("Unsaved changes…")

        def err(msg: str) -> None:
            self._screenshot_busy = False
            self._status.setText(f"Screenshot error: {msg}")

        class Task(QRunnable):
            def __init__(self, e: str, a: dict, on_ok, on_err):
                super().__init__()
                self.e = e
                self.a = a
                self.on_ok = on_ok
                self.on_err = on_err

            def run(self) -> None:
                try:
                    extract_screenshots(self.e, self.a)
                except Exception as ex:
                    msg = str(ex)
                    QTimer.singleShot(0, lambda m=msg: self.on_err(m))
                else:
                    QTimer.singleShot(0, self.on_ok)

        QThreadPool.globalInstance().start(Task(exam, snapshot, done, err))

    def closeEvent(self, event) -> None:
        self._debounce.stop()
        self._idle.stop()
        page_raster_cache_clear()
        if self._exam:
            try:
                save_json(self._exam, self._ann)
            except OSError:
                pass
            if self._pending_screenshots:
                try:
                    extract_screenshots(self._exam, copy.deepcopy(self._ann))
                except Exception:
                    pass
                self._pending_screenshots = False
        event.accept()
