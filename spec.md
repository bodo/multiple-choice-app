ok. now extend the streamlit so that we can draw bounding boxes to denote exercises. At the top of the exam view page, show buttons for the exercises that exist, like "1", "2" and the last
  button is always a plus (to add an exercise). Having selected an exercise, we can draw bounding boxes in the pdfs, which belong to the exercise. We need actually 2 levels of select on top        
  actually: First level exercises, and then per exercise we can draw "Main", "Sub-Exercise 1", "Sub-Exercise 2", "Sub-Exercise 3" again with a "+" button. Persist the screenshot locations and    
  actual screenshots on disk, so they are correctly reloaded when reopening streamlit. For a given exam, per default show just the + button for exercise, and for every exercise start only with     
  "Main" and "add sub exercise" button. Show the bounding boxes as overlayed rectangles in the correct location, with a marker for which exercise nr this corresponds to like "3.3" and a button to  
  remove the bounding box. Use a form paradigm with save buttons above and below the pdfs, no auto-save on blur.

# Plan: Streamlit Bounding Box Annotation

## Context
Extend `cms/app.py` so that in the exam detail view, users can draw bounding boxes on PDF pages to mark exercise regions. Two-level selection (exercise → sub-exercise), all boxes visible in the grid with labels, form-style save to disk.

## New dependency
`streamlit-drawable-canvas` — add to `pyproject.toml`. This is the standard Streamlit drawing component; it renders a React canvas with a background image and returns drawn shapes as JSON.

---

## Data model

**`processed_data/flat_pdfs/<exam>/annotations.json`**
```json
{
  "exercises": {
    "1": { "subs": ["Main"] },
    "2": { "subs": ["Main", "Sub-Exercise 1"] }
  },
  "boxes": [
    {
      "exercise": "1",
      "sub": "Main",
      "pdf": "WiSo.pdf",
      "page": 0,
      "rect": [x0_norm, y0_norm, x1_norm, y1_norm]
    }
  ]
}
```
`rect` values are **normalised [0, 1]** relative to the PDF page dimensions, so they are resolution-independent.

**Screenshots:** `<exam_folder>/screenshots/ex{N}_sub{M}__{pdf_stem}_p{page}.png`
Extracted on Save via PyMuPDF page crop at 150 DPI.

---

## Session state
| Key | Type | Meaning |
|-----|------|---------|
| `exam` | str \| None | Selected exam folder |
| `sel_ex` | str \| None | Selected exercise ("1", "2", …) |
| `sel_sub` | str \| None | Selected sub-exercise ("Main", "Sub-Exercise 1", …) |
| `annotations` | dict | In-memory form state (loaded from disk, not yet saved) |
| `annotating` | (pdf, page) \| None | If set → show annotation canvas instead of grid |

---

## UX flow

### Detail view layout (top to bottom)

1. **← Back** button
2. **Exercise bar** — horizontal `st.columns` row:
   - Buttons "1", "2", … for each defined exercise (highlighted if selected)
   - "+" button → appends new exercise to `annotations["exercises"]`
3. **Sub-exercise bar** (shown once an exercise is selected):
   - Buttons "Main", "Sub-Exercise 1", … (highlighted if selected)
   - "+" button → appends next sub-exercise
4. **Save** button (above PDFs)
5. **PDF grid** (3-wide) — see below
6. **Save** button (below PDFs)

Both Save buttons call the same `save()` function: write `annotations.json` to disk, extract / overwrite all screenshots.

### PDF grid (normal mode)
Each cell: static image rendered by `render_page_with_boxes()` (PyMuPDF draws all boxes from all exercises as coloured semi-transparent rectangles with labels like "3.2") + small **"✏ annotate"** button below the image.

Clicking "✏ annotate" sets `st.session_state.annotating = (pdf_name, page_num)` and `st.rerun()`.

### Annotation canvas mode
Replaces the grid when `st.session_state.annotating` is set.

- **Back to grid** button (clears `annotating`, re-runs)
- **Save** button
- Single large `st_canvas` (full width):
  - `background_image` = page rendered by pymupdf with OTHER exercises' boxes baked in (so they are visually present but not editable)
  - `initial_drawing` = existing boxes for `(sel_ex, sel_sub)` on this page, expressed as Fabric.js rect objects
  - `drawing_mode = "rect"`
  - `stroke_color` = colour for the current exercise
- On canvas return: shapes list replaces the stored boxes for `(sel_ex, sel_sub, this_page)` in session state
- **Remove button** per box: shown as a list below the canvas ("3.1 — WiSo.pdf p.1 [remove]")

---

## Rendering helpers (new functions in app.py)

```python
def render_page_with_boxes(pdf_path, page_num, boxes, render_scale=1.5) -> bytes:
    """Render page, draw all boxes as labelled coloured rects, return PNG bytes."""

def boxes_for_page(annotations, pdf_name, page_num) -> list[dict]:
    """Filter annotation boxes for a specific page."""

def canvas_initial_drawing(boxes, page_w_px, page_h_px) -> dict:
    """Convert normalised rects → Fabric.js JSON for initial_drawing."""

def norm_rect_from_canvas(shape, page_w_px, page_h_px) -> list[float]:
    """Convert canvas pixel rect → normalised [0,1] rect."""

def extract_screenshots(exam_folder, annotations) -> None:
    """Crop all boxes from PDFs at 150 DPI and save to screenshots/."""

def load_annotations(exam_folder) -> dict:
def save_annotations(exam_folder, annotations) -> None:
```

---

## Label scheme
- Exercise N, sub-index M (Main=0, Sub-Exercise 1=1, …) → label **"N.M"**
- Colour: one fixed colour per exercise index (cycle through a palette)

---

## Files to change
- `cms/app.py` — full rewrite of `detail_view()`, new helper functions
- `cms/pyproject.toml` — add `streamlit-drawable-canvas`

---

## Verification
1. `uv sync` installs new dependency
2. `uv run streamlit run app.py`
3. Navigate to any exam → exercise bar shows "+" only
4. Click "+" → exercise "1" appears and is selected; sub-bar shows "Main" + "+"
5. Click "✏ annotate" on a page → canvas opens
6. Draw a rect → appears in canvas; click Save → `annotations.json` written, screenshot saved
7. Go back to grid → box visible as overlay with label "1.0"
8. Reload Streamlit → boxes still present (loaded from disk)
9. Add exercise 2, sub-exercise 1 → label "2.1" renders in different colour
