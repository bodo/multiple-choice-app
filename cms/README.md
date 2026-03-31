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

### 000 — flatten-pdfs

Flattens `input_data/` into `processed_data/flat_pdfs/` keeping the first folder level. Output filenames encode the inner path using `_` as separator:

```
input_data/1999_Sommer/WiSo.pdf
→ processed_data/flat_pdfs/1999_Sommer/WiSo.pdf

input_data/1999_Sommer/subfolder/file.pdf
→ processed_data/flat_pdfs/1999_Sommer/subfolder_file.pdf
```

- `.pdf` files are copied directly
- `.doc`, `.docx`, `.rtf`, `.xls`, `.xlsx`, `.odt`, `.ods` are converted via LibreOffice
- `.jpg`, `.jpeg`, `.png` are converted via `img2pdf`
- All other files (`.txt`, etc.) are skipped

**Requires LibreOffice** installed on the system (`soffice` in `PATH`).

```bash
uv run python 000_flatten_pdfs.py
```

### 001 — add-ocr-layer

Adds an invisible Tesseract OCR text layer to every PDF in `processed_data/flat_pdfs/`, in-place. Pages that already contain selectable text are skipped automatically.

**Requires** Tesseract and Ghostscript installed on the system.

```bash
uv run python 001_add_ocr_layer_to_flat_pdfs.py
```

### 002 — group-pdfs-by-exam

Agentic script (Ollama / qwen3:4b) that groups all PDFs in `processed_data/flat_pdfs/` into exam sessions by filename (with optional PDF text disambiguation). Terminates by calling `save_groupings()`.

Output: `processed_data/exam_groups.json`

**Requires** Ollama running locally with `qwen3:4b` pulled.

```bash
uv run python 002_group_pdfs_by_exam.py
```

### 003 — generate-screenshots + OCR

Two-step script that operates on every annotated exam in `processed_data/flat_pdfs/`:

1. **Screenshots** — regenerates `screenshots/` from scratch by cropping every bounding box in `annotations.json` at 150 DPI. Multiple boxes sharing the same page get a `_b{n}` suffix so no crop overwrites another:
   ```
   ex3_sub0__WiSo_p1_b0.png
   ex3_sub0__WiSo_p1_b1.png
   ```

2. **OCR** — runs Tesseract on every screenshot not yet in the `annotations.json` `"ocr"` dict, and removes stale entries. Results are stored inline:
   ```json
   { "exercises": {…}, "ocr": { "ex3_sub0__WiSo_p1_b0.png": "…" } }
   ```

Run this after finishing annotations in the desktop app, and again whenever boxes are changed.

**Requires** Tesseract installed on the system (already needed for step 001).

```bash
uv run python 003_ocr_annotation_screenshots.py
```

## Apps

### Annotation tool (`app.py`) — PySide6 desktop app

Browse exams, draw bounding boxes to mark exercise regions, save annotations. Screenshots are **not** generated here — run script 003 after annotating.

```bash
uv run python app.py
```

### Exercise editor (`exercise_editor.py`) — Streamlit

Browse annotated exercises, view their screenshots, and create/edit exercise JSON files for `public/data/exercises/`. The list view shows a completion % per exercise based on how many key text fields are filled.

Features:
- SINGLE_CHOICE, MULTIPLE_CHOICE, and MATCH input modes
- Dynamic answer options and match items
- Per-option explanations
- Screenshot selection (copies to `public/data/img/`)
- Save / Save and Next navigation
- OCR reference panel (screenshot crops + full source PDF pages) for copy-pasting content
- "Annotation invalid, delete" button to wipe bad annotations

Use `python -m streamlit` — direct `uv run streamlit` does not work without a build backend.

```bash
uv run python -m streamlit run exercise_editor.py
```
