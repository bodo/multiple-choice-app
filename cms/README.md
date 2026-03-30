# CMS

Content management scripts for the exercise data in `public/data/exercises/`.

## Setup

Requires [uv](https://docs.astral.sh/uv/getting-started/installation/).

## Scripts

### generate-index

Scans `public/data/exercises/` for `*.json` files and regenerates `index.json`.

Run after adding, removing, or renaming exercise files (from `cms/`):

```bash
uv run python generate_index.py
```

### flatten-pdfs

Flattens `input_data/` into `processed_data/` as a flat list of PDFs. Output filenames encode the full folder path using `_` as separator:

```
input_data/2012_13 Winter/AP W2012 IT WiSo.pdf
→ processed_data/2012_13 Winter_AP W2012 IT WiSo.pdf
```

- `.pdf` files are copied directly
- `.doc`, `.docx`, `.rtf`, `.xls`, `.xlsx`, `.odt`, `.ods` are converted via LibreOffice
- `.jpg`, `.jpeg`, `.png` are converted via `img2pdf`
- All other files (`.txt`, etc.) are skipped

**Requires LibreOffice** installed on the system (`soffice` in `PATH`).

```bash
uv run python flatten_pdfs.py
```

### 001 — add-ocr-layer

Adds an invisible Tesseract OCR text layer to every PDF in `processed_data/`, in-place. Pages that already contain selectable text are skipped automatically, so already-digital PDFs are not re-processed.

**Requires** Tesseract and Ghostscript installed on the system.

```bash
uv run python 001_add_ocr_layer_to_flat_pdfs.py
```

### 002 — group-pdfs-by-exam

Agentic script (Ollama / qwen3.5:4b) that groups all PDFs in `processed_data/flat_pdfs/` into exam sessions. The agent receives all filenames upfront and can call `read_pdf_text()` for disambiguation. It terminates by calling `save_groupings()`.

Output: `processed_data/exam_groups.json`

**Requires** Ollama running locally with `qwen3.5:4b` pulled.

```bash
uv run python 002_group_pdfs_by_exam.py
```
