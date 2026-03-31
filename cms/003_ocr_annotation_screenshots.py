"""
003 — OCR annotation screenshots

For every annotated exam in processed_data/flat_pdfs/, runs Tesseract on each
screenshot and stores the result in annotations.json under a top-level "ocr"
key:

    { "exercises": {...}, "ocr": { "ex1_sub0__foo_p1.png": "text...", ... } }

Already-processed screenshots are skipped. Run from cms/:

    uv run python 003_ocr_annotation_screenshots.py
"""

import json
import subprocess
import sys
from pathlib import Path

FLAT_PDFS = Path(__file__).parent / "processed_data" / "flat_pdfs"


def ocr_image(path: Path) -> str:
    result = subprocess.run(
        ["tesseract", str(path), "stdout", "-l", "deu+eng"],
        capture_output=True,
        text=True,
        check=True,
    )
    return result.stdout.strip()


def process_exam(exam_dir: Path) -> None:
    ann_path = exam_dir / "annotations.json"
    if not ann_path.exists():
        return

    ann = json.loads(ann_path.read_text(encoding="utf-8"))
    exercises = ann.get("exercises", {})
    if not exercises:
        return

    shots_dir = exam_dir / "screenshots"
    if not shots_dir.exists():
        return

    # Collect all screenshots that belong to annotated exercises
    screenshots: list[Path] = []
    for ex, meta in exercises.items():
        n_subs = len(meta.get("subs", []))
        for sub_idx in range(n_subs):
            screenshots.extend(sorted(shots_dir.glob(f"ex{ex}_sub{sub_idx}__*.png")))

    if not screenshots:
        return

    ocr: dict[str, str] = ann.setdefault("ocr", {})
    new_count = 0

    for shot in screenshots:
        if shot.name in ocr:
            continue
        print(f"  OCR: {shot.name}", end=" ... ", flush=True)
        try:
            text = ocr_image(shot)
            ocr[shot.name] = text
            new_count += 1
            print("ok")
        except subprocess.CalledProcessError as exc:
            print(f"FAILED\n    {exc.stderr.strip()}")

    if new_count:
        ann_path.write_text(json.dumps(ann, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"  → {new_count} new entries written to annotations.json")
    else:
        print("  → all screenshots already processed, nothing to do")


def main() -> None:
    if not FLAT_PDFS.exists():
        print(f"Directory not found: {FLAT_PDFS}", file=sys.stderr)
        sys.exit(1)

    exam_dirs = sorted(d for d in FLAT_PDFS.iterdir() if d.is_dir())
    if not exam_dirs:
        print("No exam folders found.")
        return

    for exam_dir in exam_dirs:
        ann_path = exam_dir / "annotations.json"
        if not ann_path.exists():
            continue
        print(f"\n{exam_dir.name}")
        process_exam(exam_dir)

    print("\nDone.")


if __name__ == "__main__":
    main()
