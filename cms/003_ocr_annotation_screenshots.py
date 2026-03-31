"""
003 — generate screenshots + OCR annotation crops

For every annotated exam in processed_data/flat_pdfs/:

  1. SCREENSHOTS — Regenerates the screenshots/ folder from scratch by cropping
     every bounding box in annotations.json at 150 DPI.  Multiple boxes that
     share the same (exercise, sub, pdf, page) get a _b{n} suffix so no crop
     overwrites another:

       ex3_sub0__WiSo_p1_b0.png
       ex3_sub0__WiSo_p1_b1.png

  2. OCR — Runs Tesseract on every screenshot that is not already in the
     annotations.json "ocr" dict, and removes stale entries whose files no
     longer exist.  Results are stored as:

       { "exercises": {...}, "ocr": { "ex3_sub0__WiSo_p1_b0.png": "…", … } }

Requires: Tesseract installed (already needed for step 001).

Run from cms/:
    uv run python 003_ocr_annotation_screenshots.py
"""

import json
import subprocess
import sys
from collections import defaultdict
from pathlib import Path

import fitz  # PyMuPDF

FLAT_PDFS = Path(__file__).parent / "processed_data" / "flat_pdfs"


# ---------------------------------------------------------------------------
# Screenshot generation
# ---------------------------------------------------------------------------

def _sub_idx(subs: list[str], sub: str) -> int:
    return subs.index(sub) if sub in subs else 0


def generate_screenshots(exam_dir: Path, ann: dict) -> list[Path]:
    """Regenerate all crops; return sorted list of written PNG paths."""
    shots_dir = exam_dir / "screenshots"
    shots_dir.mkdir(parents=True, exist_ok=True)

    # Clear existing screenshots
    for old in shots_dir.glob("*.png"):
        old.unlink()

    # Count how many boxes share the same (ex, sub_idx, stem, page) so we know
    # whether to add a _b{n} suffix (always add it to keep naming deterministic).
    boxes = ann.get("boxes", [])
    written: list[Path] = []

    # Track per-key counter for the suffix
    key_count: dict[str, int] = defaultdict(int)

    for box in boxes:
        pdf_path = exam_dir / box["pdf"]
        if not pdf_path.exists():
            continue
        ex   = box["exercise"]
        sub  = box["sub"]
        page = box["page"]
        subs = ann["exercises"].get(ex, {}).get("subs", ["Main"])
        si   = _sub_idx(subs, sub)
        stem = Path(box["pdf"]).stem
        base_key = f"ex{ex}_sub{si}__{stem}_p{page}"
        n = key_count[base_key]
        key_count[base_key] += 1
        out = shots_dir / f"{base_key}_b{n}.png"

        try:
            with fitz.open(str(pdf_path)) as doc:
                page_obj = doc[page]
                pw, ph = page_obj.rect.width, page_obj.rect.height
                r = box["rect"]
                clip = fitz.Rect(r[0] * pw, r[1] * ph, r[2] * pw, r[3] * ph)
                pix = page_obj.get_pixmap(
                    matrix=fitz.Matrix(150 / 72, 150 / 72), clip=clip
                )
                out.write_bytes(pix.tobytes("png"))
            written.append(out)
        except Exception as exc:
            print(f"  WARNING: could not crop {out.name}: {exc}")

    return sorted(written)


# ---------------------------------------------------------------------------
# OCR
# ---------------------------------------------------------------------------

def ocr_image(path: Path) -> str:
    result = subprocess.run(
        ["tesseract", str(path), "stdout", "-l", "deu+eng"],
        capture_output=True,
        text=True,
        check=True,
    )
    return result.stdout.strip()


def run_ocr(ann_path: Path, ann: dict, screenshots: list[Path]) -> int:
    """Add OCR for new screenshots, remove stale entries. Returns count of new entries."""
    ocr: dict[str, str] = ann.setdefault("ocr", {})
    existing_names = {f.name for f in screenshots}

    # Remove stale entries
    stale = [name for name in list(ocr) if name not in existing_names]
    for name in stale:
        del ocr[name]
    if stale:
        print(f"  removed {len(stale)} stale OCR entries")

    new_count = 0
    for shot in screenshots:
        if shot.name in ocr:
            continue
        print(f"  OCR: {shot.name}", end=" ... ", flush=True)
        try:
            ocr[shot.name] = ocr_image(shot)
            new_count += 1
            print("ok")
        except subprocess.CalledProcessError as exc:
            print(f"FAILED\n    {exc.stderr.strip()}")

    return new_count


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def process_exam(exam_dir: Path) -> None:
    ann_file = exam_dir / "annotations.json"
    if not ann_file.exists():
        return
    ann = json.loads(ann_file.read_text(encoding="utf-8"))
    if not ann.get("exercises") or not ann.get("boxes"):
        return

    print(f"\n{exam_dir.name}")

    screenshots = generate_screenshots(exam_dir, ann)
    print(f"  {len(screenshots)} screenshot(s) written")

    new_ocr = run_ocr(ann_file, ann, screenshots)
    if new_ocr or True:  # always write back to persist stale-cleanup
        ann_file.write_text(
            json.dumps(ann, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        print(f"  → {new_ocr} new OCR entries written")


def main() -> None:
    if not FLAT_PDFS.exists():
        print(f"Directory not found: {FLAT_PDFS}", file=sys.stderr)
        sys.exit(1)

    exam_dirs = sorted(d for d in FLAT_PDFS.iterdir() if d.is_dir())
    if not exam_dirs:
        print("No exam folders found.")
        return

    for exam_dir in exam_dirs:
        process_exam(exam_dir)

    print("\nDone.")


if __name__ == "__main__":
    main()
