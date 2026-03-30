"""Load/save annotations.json and extract PNG screenshots (PyMuPDF)."""

from __future__ import annotations

import json
import os
import tempfile
from pathlib import Path

import fitz

from colors import sub_idx

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


def extract_screenshots(exam: str, ann: dict) -> None:
    """Crop all boxes at 150 DPI; clear screenshots dir first for deterministic output."""
    shots_dir = FLAT_PDFS / exam / "screenshots"
    shots_dir.mkdir(parents=True, exist_ok=True)
    for old in shots_dir.glob("*.png"):
        old.unlink()
    for box in ann.get("boxes", []):
        pdf_path = FLAT_PDFS / exam / box["pdf"]
        if not pdf_path.exists():
            continue
        ex, sub, page_num = box["exercise"], box["sub"], box["page"]
        subs = ann["exercises"].get(ex, {}).get("subs", ["Main"])
        si = sub_idx(subs, sub)
        stem = Path(box["pdf"]).stem
        out = shots_dir / f"ex{ex}_sub{si}__{stem}_p{page_num}.png"
        with fitz.open(str(pdf_path)) as doc:
            page = doc[page_num]
            pw, ph = page.rect.width, page.rect.height
            r = box["rect"]
            clip = fitz.Rect(r[0] * pw, r[1] * ph, r[2] * pw, r[3] * ph)
            pix = page.get_pixmap(matrix=fitz.Matrix(150 / 72, 150 / 72), clip=clip)
            out.write_bytes(pix.tobytes("png"))


def save_json_and_screenshots(exam: str, ann: dict) -> None:
    save_json(exam, ann)
    extract_screenshots(exam, ann)
