"""
Exercise editor — step 2 of the content pipeline.

List view:
  - Exercise has no sub-exercises: shown directly as a clickable item.
  - Exercise has sub-exercises: non-clickable label; only Sub-Exercise N items are clickable.

Detail view: screenshots left (1/3) + exercise form right (2/3).

Usage (from cms/):
    uv run python -m streamlit run exercise_editor.py
"""

import json
import shutil
from pathlib import Path

import streamlit as st

FLAT_PDFS     = Path(__file__).parent / "processed_data" / "flat_pdfs"
EXERCISES_DIR = (Path(__file__).parent / ".." / "public" / "data" / "exercises").resolve()
IMG_DIR       = (Path(__file__).parent / ".." / "public" / "data" / "img").resolve()
INDEX_PATH    = EXERCISES_DIR / "index.json"

MODES = ["SINGLE_CHOICE", "MULTIPLE_CHOICE", "MATCH"]

st.set_page_config(layout="wide", page_title="Exercise Editor")

# ---------------------------------------------------------------------------
# Annotation helpers
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
    return [(i, s) for i, s in enumerate(subs) if s.startswith("Sub-Exercise")]

def context_sub_indices(subs: list[str]) -> list[int]:
    return [i for i, s in enumerate(subs) if not s.startswith("Sub-Exercise")]

# ---------------------------------------------------------------------------
# Exercise I/O
# ---------------------------------------------------------------------------

def suggested_filename(exam: str, ex: str, sub_idx: int) -> str:
    slug = exam.lower().replace(" ", "_")
    if sub_idx < 0:
        return f"{slug}_ex{ex}"
    return f"{slug}_ex{ex}_sub{sub_idx}"

def load_exercise_json(stem: str) -> dict | None:
    p = EXERCISES_DIR / f"{stem}.json"
    return json.loads(p.read_text(encoding="utf-8")) if p.exists() else None

def load_index() -> list[str]:
    return json.loads(INDEX_PATH.read_text(encoding="utf-8")) if INDEX_PATH.exists() else []

def save_index(entries: list[str]) -> None:
    INDEX_PATH.write_text(
        json.dumps(sorted(entries), ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

# ---------------------------------------------------------------------------
# Form state helpers
# ---------------------------------------------------------------------------

def _ss() -> dict:
    return st.session_state

def _list_defaults(n: int) -> tuple[list[bool], list[int]]:
    return [False] * n, [0] * n

def init_form_state(exam: str, ex: str, sub_idx: int, screenshot_files: list[Path]) -> None:
    guard = f"{exam}__{ex}__{sub_idx}"
    if _ss().get("ef_loaded_for") == guard:
        return

    stem = suggested_filename(exam, ex, sub_idx)
    data = load_exercise_json(stem) or {}

    opts   = data.get("answerOptions", ["", ""])
    mopts  = data.get("matchOptions",  [""])
    n_opts = len(opts)
    mode   = data.get("inputMode", "SINGLE_CHOICE")

    correct_single   = 0
    correct_multiple = [False] * n_opts
    correct_match    = [0] * n_opts

    raw_correct = data.get("correct")
    if mode == "SINGLE_CHOICE" and isinstance(raw_correct, int):
        correct_single = raw_correct
    elif mode == "MULTIPLE_CHOICE" and isinstance(raw_correct, list):
        for idx in raw_correct:
            if isinstance(idx, int) and idx < n_opts:
                correct_multiple[idx] = True
    elif mode == "MATCH" and isinstance(raw_correct, list):
        for i, v in enumerate(raw_correct):
            if i < n_opts and isinstance(v, int):
                correct_match[i] = v

    # Map saved image filenames back to screenshot checkboxes
    saved_images = set(data.get("images", []))
    sel_shots = [f.name in saved_images for f in screenshot_files]

    _ss().update({
        "ef_loaded_for":         guard,
        "ef_filename":           stem,
        "ef_input_mode":         mode,
        "ef_instruction":        data.get("instruction", ""),
        "ef_answer_options":     list(opts),
        "ef_match_options":      list(mopts),
        "ef_correct_single":     correct_single,
        "ef_correct_multiple":   correct_multiple,
        "ef_correct_match":      correct_match,
        "ef_submit_button":      data.get("submitButton", True),
        "ef_explain_instruction":data.get("explainInstruction", ""),
        "ef_explain_options":    list(data.get("explainAnswerOptions", [""] * n_opts)),
        "ef_admin_comment":      data.get("adminComment", ""),
        "ef_admin_tags":         ", ".join(data.get("adminTags", [])),
        "ef_selected_screenshots": sel_shots,
        "ef_save_message":       None,
    })

    # Pad explain_options to match answer_options length
    diff = n_opts - len(_ss()["ef_explain_options"])
    if diff > 0:
        _ss()["ef_explain_options"] += [""] * diff

def _remove_answer_option(i: int) -> None:
    ss = _ss()
    for key in ("ef_answer_options", "ef_explain_options", "ef_correct_multiple", "ef_correct_match"):
        ss[key].pop(i)
    # Fix correct_single
    if ss["ef_correct_single"] == i:
        ss["ef_correct_single"] = 0
    elif ss["ef_correct_single"] > i:
        ss["ef_correct_single"] -= 1
    # Fix correct_match values
    ss["ef_correct_match"] = [
        0 if v == i else (v - 1 if v > i else v)
        for v in ss["ef_correct_match"]
    ]

def _grow_correct_state() -> None:
    _ss()["ef_correct_multiple"].append(False)
    _ss()["ef_correct_match"].append(0)

def _remove_match_option(j: int) -> None:
    ss = _ss()
    ss["ef_match_options"].pop(j)
    ss["ef_correct_match"] = [
        0 if v == j else (v - 1 if v > j else v)
        for v in ss["ef_correct_match"]
    ]

# ---------------------------------------------------------------------------
# Save
# ---------------------------------------------------------------------------

def save_exercise(screenshot_files: list[Path]) -> None:
    ss = _ss()
    stem = ss["ef_filename"].strip().removesuffix(".json")
    if not stem:
        ss["ef_save_message"] = "error:Filename cannot be empty."
        return

    data: dict = {"inputMode": ss["ef_input_mode"]}

    if ss["ef_instruction"].strip():
        data["instruction"] = ss["ef_instruction"]

    # Copy selected screenshots → public/data/img/
    IMG_DIR.mkdir(parents=True, exist_ok=True)
    images = []
    for i, f in enumerate(screenshot_files):
        if i < len(ss["ef_selected_screenshots"]) and ss["ef_selected_screenshots"][i]:
            dest = IMG_DIR / f.name
            if not dest.exists():
                shutil.copy2(f, dest)
            images.append(f.name)
    if images:
        data["images"] = images

    opts  = ss["ef_answer_options"]
    mopts = ss["ef_match_options"]
    mode  = ss["ef_input_mode"]

    if opts:
        data["answerOptions"] = opts
    if mode == "MATCH" and mopts:
        data["matchOptions"] = mopts

    if mode == "SINGLE_CHOICE":
        data["correct"] = ss["ef_correct_single"]
        data["submitButton"] = ss["ef_submit_button"]
    elif mode == "MULTIPLE_CHOICE":
        data["correct"] = [i for i, v in enumerate(ss["ef_correct_multiple"]) if v]
    elif mode == "MATCH":
        data["correct"] = list(ss["ef_correct_match"])

    if ss["ef_explain_instruction"].strip():
        data["explainInstruction"] = ss["ef_explain_instruction"]

    exp_opts = ss["ef_explain_options"]
    if any(s.strip() for s in exp_opts):
        data["explainAnswerOptions"] = exp_opts

    if ss["ef_admin_comment"].strip():
        data["adminComment"] = ss["ef_admin_comment"]
    tags = [t.strip() for t in ss["ef_admin_tags"].split(",") if t.strip()]
    if tags:
        data["adminTags"] = tags

    out = EXERCISES_DIR / f"{stem}.json"
    EXERCISES_DIR.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(data, ensure_ascii=False, indent=4), encoding="utf-8")

    entries = load_index()
    entry = f"{stem}.json"
    if entry not in entries:
        entries.append(entry)
    save_index(entries)

    ss["ef_save_message"] = f"ok:Saved → {entry}"

# ---------------------------------------------------------------------------
# Form renderers
# ---------------------------------------------------------------------------

def render_screenshot_selector(files: list[Path]) -> None:
    ss = _ss()
    # Grow selection list if new screenshots appeared
    while len(ss["ef_selected_screenshots"]) < len(files):
        ss["ef_selected_screenshots"].append(False)

    st.markdown("**Screenshots**  *(check to include as exercise image)*")
    for i, f in enumerate(files):
        st.image(str(f), use_container_width=True)
        checked = st.checkbox(
            "Include as image",
            value=ss["ef_selected_screenshots"][i],
            key=f"ef_shot_{i}",
        )
        ss["ef_selected_screenshots"][i] = checked

def render_mode_and_filename() -> None:
    st.text_input("Filename (without .json)", key="ef_filename")
    st.selectbox("Input mode", MODES, key="ef_input_mode")

def render_answer_options() -> None:
    ss = _ss()
    opts  = ss["ef_answer_options"]
    exps  = ss["ef_explain_options"]
    st.markdown("**Answer options**")

    for i in range(len(opts)):
        col_text, col_btn = st.columns([11, 1])
        with col_text:
            opts[i] = st.text_area(
                f"Option {i + 1}",
                value=opts[i],
                key=f"ef_opt_{i}",
                height=80,
                label_visibility="collapsed",
                placeholder=f"Option {i + 1}",
            )
            exps[i] = st.text_area(
                f"Explanation {i + 1}",
                value=exps[i],
                key=f"ef_exp_{i}",
                height=60,
                label_visibility="collapsed",
                placeholder=f"Explanation for option {i + 1} (optional)",
            )
        with col_btn:
            st.write("")  # vertical alignment nudge
            if st.button("✕", key=f"ef_rm_opt_{i}"):
                _remove_answer_option(i)
                st.rerun()

    if st.button("＋ Add option", key="ef_add_opt"):
        opts.append("")
        exps.append("")
        _grow_correct_state()
        st.rerun()

def render_match_options() -> None:
    if _ss()["ef_input_mode"] != "MATCH":
        return
    ss = _ss()
    mopts = ss["ef_match_options"]
    st.markdown("**Match options** *(right-side items)*")

    for j in range(len(mopts)):
        col_text, col_btn = st.columns([11, 1])
        with col_text:
            mopts[j] = st.text_area(
                f"Match {j + 1}",
                value=mopts[j],
                key=f"ef_mopt_{j}",
                height=80,
                label_visibility="collapsed",
                placeholder=f"Match item {j + 1}",
            )
        with col_btn:
            st.write("")
            if st.button("✕", key=f"ef_rm_mopt_{j}"):
                _remove_match_option(j)
                st.rerun()

    if st.button("＋ Add match item", key="ef_add_mopt"):
        mopts.append("")
        st.rerun()

def render_correct_answer() -> None:
    ss    = _ss()
    mode  = ss["ef_input_mode"]
    opts  = ss["ef_answer_options"]
    mopts = ss["ef_match_options"]

    if not opts:
        st.info("Add answer options above to set the correct answer.")
        return

    st.markdown("**Correct answer**")

    if mode == "SINGLE_CHOICE":
        # Clamp index
        ss["ef_correct_single"] = min(ss["ef_correct_single"], len(opts) - 1)
        labels = [f"{i + 1}. {o}" if o.strip() else f"Option {i + 1}" for i, o in enumerate(opts)]
        idx = st.radio(
            "Correct option",
            options=range(len(opts)),
            format_func=lambda i: labels[i],
            index=ss["ef_correct_single"],
            key="ef_radio_correct",
            label_visibility="collapsed",
        )
        ss["ef_correct_single"] = idx
        ss["ef_submit_button"] = st.checkbox("Show submit button", value=ss["ef_submit_button"], key="ef_submit_btn")

    elif mode == "MULTIPLE_CHOICE":
        # Ensure parallel list length
        while len(ss["ef_correct_multiple"]) < len(opts):
            ss["ef_correct_multiple"].append(False)
        for i, opt in enumerate(opts):
            label = f"{i + 1}. {opt}" if opt.strip() else f"Option {i + 1}"
            ss["ef_correct_multiple"][i] = st.checkbox(
                label,
                value=ss["ef_correct_multiple"][i],
                key=f"ef_mc_{i}",
            )

    elif mode == "MATCH":
        if not mopts:
            st.info("Add match items above to configure pairings.")
            return
        while len(ss["ef_correct_match"]) < len(opts):
            ss["ef_correct_match"].append(0)
        for i, opt in enumerate(opts):
            label = opt.strip() or f"Option {i + 1}"
            val = min(ss["ef_correct_match"][i], len(mopts) - 1)
            ss["ef_correct_match"][i] = st.selectbox(
                label,
                options=range(len(mopts)),
                format_func=lambda j: mopts[j] if mopts[j].strip() else f"Match {j + 1}",
                index=val,
                key=f"ef_match_{i}",
            )

def _save_btn(key: str, files: list[Path]) -> None:
    if st.button("💾 Save", key=key, type="primary"):
        save_exercise(files)

def render_exercise_form(screenshot_files: list[Path]) -> None:
    ss = _ss()

    render_mode_and_filename()
    _save_btn("save_top", screenshot_files)
    st.divider()

    st.text_area("Instruction", key="ef_instruction", height=120,
                 placeholder="Question or instruction text (Markdown supported)")
    st.divider()

    render_answer_options()
    render_match_options()
    st.divider()

    render_correct_answer()
    st.divider()

    st.text_area("Explain instruction", key="ef_explain_instruction", height=100,
                 placeholder="Shown after answering (Markdown supported)")
    st.divider()

    with st.expander("Admin"):
        st.text_area("Comment", key="ef_admin_comment", height=80,
                     placeholder="Internal note — not shown to users")
        st.text_input("Tags", key="ef_admin_tags",
                      placeholder="comma-separated, e.g. wiso, arbeitsrecht")

    st.divider()
    _save_btn("save_bottom", screenshot_files)

    msg = ss.get("ef_save_message")
    if msg:
        if msg.startswith("ok:"):
            st.success(msg[3:])
        else:
            st.error(msg[6:] if msg.startswith("error:") else msg)

# ---------------------------------------------------------------------------
# Navigation
# ---------------------------------------------------------------------------

def _open(exam: str, ex: str, sub_idx: int) -> None:
    st.session_state.sel_exam    = exam
    st.session_state.sel_ex      = ex
    st.session_state.sel_sub_idx = sub_idx
    st.session_state.ef_loaded_for = None  # force form re-init
    st.rerun()

# ---------------------------------------------------------------------------
# Session state defaults
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
                    if st.button(f"Exercise {ex}", key=f"open_{exam}_{ex}"):
                        _open(exam, ex, -1)
                else:
                    for sub_idx, _ in real_subs:
                        if st.button(f"Exercise {ex}.{sub_idx}", key=f"open_{exam}_{ex}_{sub_idx}"):
                            _open(exam, ex, sub_idx)

# ---------------------------------------------------------------------------
# Detail view
# ---------------------------------------------------------------------------

def detail_view() -> None:
    exam    = st.session_state.sel_exam
    ex      = st.session_state.sel_ex
    sub_idx = st.session_state.sel_sub_idx
    ann     = load_annotations(exam)
    subs    = ann.get("exercises", {}).get(ex, {}).get("subs", [])
    is_sub  = sub_idx >= 0

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
        context_files = [
            f for i in context_sub_indices(subs)
            for f in screenshots_for_sub(exam, ex, i)
        ]
        files = context_files + screenshots_for_sub(exam, ex, sub_idx)
    else:
        files = [
            f for i in context_sub_indices(subs)
            for f in screenshots_for_sub(exam, ex, i)
        ]

    init_form_state(exam, ex, sub_idx, files)

    left_col, right_col = st.columns([1, 2])
    with left_col:
        if files:
            render_screenshot_selector(files)
        else:
            st.warning("No screenshots found. Make sure annotations have been saved.")
    with right_col:
        render_exercise_form(files)

# ---------------------------------------------------------------------------
# Router
# ---------------------------------------------------------------------------

if st.session_state.sel_exam is not None:
    detail_view()
else:
    list_view()
