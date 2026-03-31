"""
Exercise editor — step 2 of the content pipeline.

List view : all exams that have annotations, with their exercises nested below.
Detail view: all annotation screenshots for the selected exercise, grouped by sub-exercise.

Usage (from cms/):
    uv run streamlit run exercise_editor.py
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

def screenshots_for_exercise(exam: str, ex: str, ann: dict) -> dict[str, list[Path]]:
    """
    Returns {sub_name: [screenshot_path, ...]} for the given exercise.
    Screenshots are sorted by sub index then filename.
    """
    shots_dir = FLAT_PDFS / exam / "screenshots"
    if not shots_dir.exists():
        return {}

    subs: list[str] = ann.get("exercises", {}).get(ex, {}).get("subs", [])
    result: dict[str, list[Path]] = {}

    for sub_idx, sub_name in enumerate(subs):
        prefix = f"ex{ex}_sub{sub_idx}__"
        files = sorted(shots_dir.glob(f"{prefix}*.png"))
        if files:
            result[sub_name] = files

    return result

def annotated_exams() -> list[tuple[str, dict]]:
    """All exam folders that have a non-empty annotations.json with at least one exercise."""
    exams = []
    for folder in sorted(d for d in FLAT_PDFS.iterdir() if d.is_dir()):
        ann = load_annotations(folder.name)
        if ann.get("exercises"):
            exams.append((folder.name, ann))
    return exams

# ---------------------------------------------------------------------------
# Session state init
# ---------------------------------------------------------------------------

for key, default in [("sel_exam", None), ("sel_ex", None)]:
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
        with st.expander(f"**{exam}**  —  {len(exercises)} exercise(s)", expanded=False):
            for ex, meta in exercises.items():
                subs = meta.get("subs", [])
                label = f"Exercise {ex}  ({len(subs)} sub-exercise{'s' if len(subs) != 1 else ''})"
                if st.button(label, key=f"open_{exam}_{ex}"):
                    st.session_state.sel_exam = exam
                    st.session_state.sel_ex = ex
                    st.rerun()

# ---------------------------------------------------------------------------
# Exercise detail view
# ---------------------------------------------------------------------------

def detail_view() -> None:
    exam = st.session_state.sel_exam
    ex   = st.session_state.sel_ex
    ann  = load_annotations(exam)

    if st.button("← Back"):
        st.session_state.sel_exam = None
        st.session_state.sel_ex   = None
        st.rerun()

    st.title(f"{exam}  —  Exercise {ex}")
    st.caption("Annotation screenshots grouped by sub-exercise.")
    st.divider()

    shots = screenshots_for_exercise(exam, ex, ann)

    if not shots:
        st.warning("No screenshots found for this exercise. Make sure annotations have been saved.")
        return

    for sub_name, files in shots.items():
        st.subheader(sub_name)
        cols = st.columns(min(len(files), 3))
        for i, path in enumerate(files):
            cols[i % 3].image(str(path), use_container_width=True)
        st.divider()

# ---------------------------------------------------------------------------
# Router
# ---------------------------------------------------------------------------

if st.session_state.sel_exam and st.session_state.sel_ex:
    detail_view()
else:
    list_view()
