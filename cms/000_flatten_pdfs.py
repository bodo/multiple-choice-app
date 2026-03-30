"""
Flatten input_data/ into processed_data/ as a flat list of PDFs.

Output filenames encode the full folder path:
    input_data/2012_13 Winter/AP W2012 IT WiSo.pdf
    → processed_data/2012_13 Winter_AP W2012 IT WiSo.pdf

Conversions:
- .pdf              → copied directly
- .doc .docx .rtf
  .xls .xlsx .ods
  .odt              → converted via LibreOffice (must be installed)
- .jpg .jpeg .png   → converted via img2pdf

All other files (e.g. .txt, .gitignore) are skipped.

Usage (from cms/):
    uv run python flatten_pdfs.py
"""

import shutil
import subprocess
import tempfile
from pathlib import Path

import img2pdf

INPUT = Path(__file__).parent / "input_data"
OUTPUT = Path(__file__).parent / "processed_data/flat_pdfs"

LIBREOFFICE_EXTS = {".doc", ".docx", ".rtf", ".xls", ".xlsx", ".odt", ".ods"}
IMAGE_EXTS = {".jpg", ".jpeg", ".png"}
ALL_HANDLED = {".pdf"} | LIBREOFFICE_EXTS | IMAGE_EXTS


def output_name(rel: Path) -> str:
    """Join all path parts with '_', replacing the original extension with .pdf."""
    parts = list(rel.parts)
    parts[-1] = rel.stem  # drop extension from filename part
    return "_".join(parts) + ".pdf"


def convert_with_libreoffice(src: Path, dest: Path) -> None:
    with tempfile.TemporaryDirectory() as tmp:
        result = subprocess.run(
            ["soffice", "--headless", "--convert-to", "pdf", "--outdir", tmp, str(src)],
            capture_output=True,
            text=True,
        )
        if result.returncode != 0:
            raise RuntimeError(result.stderr.strip() or result.stdout.strip())
        converted = Path(tmp) / (src.stem + ".pdf")
        shutil.move(str(converted), dest)


def convert_image(src: Path, dest: Path) -> None:
    dest.write_bytes(img2pdf.convert(str(src)))


def main() -> None:
    OUTPUT.mkdir(exist_ok=True)

    skipped: list[str] = []
    ok = failed = 0

    for src in sorted(INPUT.rglob("*")):
        if not src.is_file():
            continue

        rel = src.relative_to(INPUT)
        ext = src.suffix.lower()

        if ext not in ALL_HANDLED:
            skipped.append(str(rel))
            continue

        dest = OUTPUT / output_name(rel)
        print(f"  {rel} → {dest.name}", end=" ... ", flush=True)

        try:
            if ext == ".pdf":
                shutil.copy2(src, dest)
            elif ext in LIBREOFFICE_EXTS:
                convert_with_libreoffice(src, dest)
            else:
                convert_image(src, dest)
            print("ok")
            ok += 1
        except Exception as e:
            print(f"FAILED: {e}")
            failed += 1

    print(f"\nDone: {ok} ok, {failed} failed, {len(skipped)} skipped")
    if skipped:
        print("Skipped:")
        for s in skipped:
            print(f"  {s}")


if __name__ == "__main__":
    main()
