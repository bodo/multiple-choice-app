"""
Add an invisible OCR text layer to every PDF in processed_data/, in-place.

- Pages that already contain selectable text are skipped (--skip-text),
  so already-digital PDFs are left untouched.
- Language: German + English (covers all exam content).
- Requires Tesseract and Ghostscript installed on the system.

Usage (from cms/):
    uv run python 001_add_ocr_layer_to_flat_pdfs.py
"""

import ocrmypdf
from pathlib import Path

PROCESSED = Path(__file__).parent / "processed_data/flat_pdfs"


def main() -> None:
    pdfs = sorted(PROCESSED.rglob("*.pdf"))
    if not pdfs:
        print("No PDFs found in processed_data/flat_pdfs/")
        return

    ok = failed = 0

    for pdf in pdfs:
        print(f"  {pdf.name}", end=" ... ", flush=True)
        try:
            ocrmypdf.ocr(
                pdf,
                pdf,
                language=["deu", "eng"],
                skip_text=True,
                progress_bar=False,
            )
            print("ok")
            ok += 1
        except ocrmypdf.exceptions.PriorOcrFoundError:
            print("skipped (already has OCR)")
            ok += 1
        except Exception as e:
            print(f"FAILED: {e}")
            failed += 1

    print(f"\nDone: {ok} ok, {failed} failed")


if __name__ == "__main__":
    main()
