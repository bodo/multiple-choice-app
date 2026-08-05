"""Background render tasks (preview compositing) — keep MuPDF/PIL off the UI thread where possible."""

from __future__ import annotations

from typing import Any, Callable

from PySide6.QtCore import QRunnable, QTimer
from PySide6.QtGui import QImage

from pdf_render import pil_rgb_to_qimage, render_with_boxes


class PreviewRunnable(QRunnable):
    def __init__(
        self,
        req_id: int,
        pdf_path: str,
        page_num: int,
        boxes_snapshot: list[dict],
        exercises_snapshot: dict[str, Any],
        scale: float,
        on_done: Callable[[int, QImage], None],
    ) -> None:
        super().__init__()
        self._req_id = req_id
        self._pdf_path = pdf_path
        self._page_num = page_num
        self._boxes = boxes_snapshot
        self._exercises = exercises_snapshot
        self._scale = scale
        self._on_done = on_done

    def run(self) -> None:
        ann = {"exercises": self._exercises, "boxes": []}
        img = render_with_boxes(
            self._pdf_path,
            self._page_num,
            self._boxes,
            ann,
            scale=self._scale,
        )
        q = pil_rgb_to_qimage(img)
        rid = self._req_id
        QTimer.singleShot(0, lambda: self._on_done(rid, q))
