"""
Exercise editor — step 2 of the content pipeline.

List view:
  - Exercise has no sub-exercises (subs == ["Main"]): shown directly as a clickable item.
  - Exercise has sub-exercises: shown as a non-clickable label; only its sub-exercises
    (Sub-Exercise 1, Sub-Exercise 2, …) are listed and clickable. "Main" is never shown
    as a list item — it is context, not a standalone exercise.

Detail view:
  - No sub-exercises: show all screenshots for the exercise (Main).
  - Sub-exercise selected: show screenshots for Main (shared context) + screenshots for
    the selected sub-exercise. Screenshots from other sub-exercises are excluded.

Usage (from cms/):
    uv run python -m streamlit run exercise_editor.py
"""

import json
from pathlib import Path

import streamlit as st

FLAT_PDFS = Path(__file__).parent / "processed_data" / "flat_pdfs"

st.set_page_config(layout="wide", page_title="Exercise Editor")

# ---------------------------------------------------------------------------
# Data helpers
# ---------------------------------------------------------------------------

def load_annotations(exam: str) -> dict:
    p = FLAT_PDFS / exam / "annotations.json"
    return json.loads(p.read_text(encoding="utf-8")) if p.exists() else {}

def screenshots_for_sub(exam: str, ex: str, sub_idx: int) -> list[Path]:
    shots_dir = FLAT_PDFS / exam / "screenshots"
    if not shots_dir.exists():
        return []
    return sorted(shots_dir.glob(f"ex{ex}_sub{sub_idx}__*.png"))

def annotated_exams() -> list[tuple[str, dict]]:
    exams = []
    for folder in sorted(d for d in FLAT_PDFS.iterdir() if d.is_dir()):
        ann = load_annotations(folder.name)
        if ann.get("exercises"):
            exams.append((folder.name, ann))
    return exams

def real_sub_exercises(subs: list[str]) -> list[tuple[int, str]]:
    """Return [(idx, name)] for subs that are actual sub-exercises (Sub-Exercise N).
    Everything else (Main, Answer Key, Answer Options, …) is context, not a sub-exercise."""
    return [(i, s) for i, s in enumerate(subs) if s.startswith("Sub-Exercise")]

def context_sub_indices(subs: list[str]) -> list[int]:
    """Indices of context subs — all subs that are NOT Sub-Exercise N."""
    return [i for i, s in enumerate(subs) if not s.startswith("Sub-Exercise")]

def _open(exam: str, ex: str, sub_idx: int) -> None:
    st.session_state.sel_exam    = exam
    st.session_state.sel_ex      = ex
    st.session_state.sel_sub_idx = sub_idx
    st.rerun()

# ---------------------------------------------------------------------------
# Session state
# ---------------------------------------------------------------------------

for key, default in [("sel_exam", None), ("sel_ex", None), ("sel_sub_idx", None)]:
    if key not in st.session_state:
        st.session_state[key] = default

# ---------------------------------------------------------------------------
# List view
# ---------------------------------------------------------------------------

def list_view() -> None:
    st.title("Exercise Editor")

    exams = annotated_exams()
    if not exams:
        st.info("No annotated exams found. Run the annotation tool first.")
        return

    for exam, ann in exams:
        exercises = ann.get("exercises", {})
        with st.expander(f"**{exam}**", expanded=False):
            for ex, meta in exercises.items():
                subs: list[str] = meta.get("subs", [])

                real_subs = real_sub_exercises(subs)

                if not real_subs:
                    # No sub-exercises: exercise itself is the editable unit
                    if st.button(f"Exercise {ex}", key=f"open_{exam}_{ex}"):
                        _open(exam, ex, -1)  # -1 = whole exercise (all context subs)
                else:
                    for sub_idx, _ in real_subs:
                        if st.button(f"Exercise {ex}.{sub_idx}", key=f"open_{exam}_{ex}_{sub_idx}"):
                            _open(exam, ex, sub_idx)

# ---------------------------------------------------------------------------
# Detail view
# ---------------------------------------------------------------------------

def detail_view() -> None:
    exam     = st.session_state.sel_exam
    ex       = st.session_state.sel_ex
    sub_idx  = st.session_state.sel_sub_idx
    ann      = load_annotations(exam)
    subs    = ann.get("exercises", {}).get(ex, {}).get("subs", [])
    is_sub  = sub_idx >= 0  # -1 means whole exercise

    if st.button("← Back"):
        st.session_state.sel_exam    = None
        st.session_state.sel_ex      = None
        st.session_state.sel_sub_idx = None
        st.rerun()

    title = f"{exam}  —  Exercise {ex}"
    if is_sub:
        title += f"  /  {subs[sub_idx]}"
    st.title(title)
    st.divider()

    if is_sub:
        # Context subs (Main, Answer Key, etc.) + this sub's screenshots
        context_files = [
            f for i in context_sub_indices(subs)
            for f in screenshots_for_sub(exam, ex, i)
        ]
        sub_files = screenshots_for_sub(exam, ex, sub_idx)
        files = context_files + sub_files
    else:
        # All context subs (no Sub-Exercise N entries exist)
        files = [
            f for i in context_sub_indices(subs)
            for f in screenshots_for_sub(exam, ex, i)
        ]

    if not files:
        st.warning("No screenshots found. Make sure annotations have been saved.")
        return

    cols = st.columns(2)
    for i, path in enumerate(files):
        cols[i % 2].image(str(path), use_container_width=True)

# ---------------------------------------------------------------------------
# Router
# ---------------------------------------------------------------------------

if st.session_state.sel_exam is not None:
    detail_view()
else:
    list_view()
