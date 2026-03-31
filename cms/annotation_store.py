"""Load/save annotations.json."""

from __future__ import annotations

import json
import os
import tempfile
from pathlib import Path

FLAT_PDFS = Path(__file__).resolve().parent / "processed_data" / "flat_pdfs"


def ann_path(exam: str) -> Path:
    return FLAT_PDFS / exam / "annotations.json"


def load_annotations(exam: str) -> dict:
    p = ann_path(exam)
    if p.exists():
        return json.loads(p.read_text(encoding="utf-8"))
    return {"exercises": {}, "boxes": []}


def save_json(exam: str, ann: dict) -> None:
    """Write annotations.json atomically (temp + replace)."""
    p = ann_path(exam)
    p.parent.mkdir(parents=True, exist_ok=True)
    data = json.dumps(ann, ensure_ascii=False, indent=2)
    fd, tmp = tempfile.mkstemp(
        dir=p.parent, prefix=".annotations_", suffix=".tmp"
    )
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            f.write(data)
        os.replace(tmp, p)
    except Exception:
        try:
            os.unlink(tmp)
        except OSError:
            pass
        raise
