"""
Exercise editor — step 2 of the content pipeline.

List view:
  - Exercise has no sub-exercises: shown directly as a clickable item.
  - Exercise has sub-exercises: non-clickable label; only Sub-Exercise N items are clickable.

Detail view: screenshots left (1/3) + exercise form right (2/3).

Usage (from apps/content-cms/):
    uv run python -m streamlit run exercise_editor.py
"""

import json
import os
import re
import shutil
from pathlib import Path

import fitz  # PyMuPDF
import streamlit as st

try:
    from ai_distractor_pipeline import enrich_exercise_sync
except ImportError:
    enrich_exercise_sync = None

CMS_DIR       = Path(__file__).resolve().parent
FRONTEND_DATA = CMS_DIR.parent / "frontend" / "public" / "data"
FLAT_PDFS     = CMS_DIR / "processed_data" / "flat_pdfs"
EXERCISES_DIR = FRONTEND_DATA / "exercises"
IMG_DIR       = FRONTEND_DATA / "img"
INDEX_PATH    = EXERCISES_DIR / "index.json"

MODES = ["SINGLE_CHOICE", "MULTIPLE_CHOICE", "MATCH"]
SPECIALIZATIONS = ["FIAN", "FISI", "FIDP", "FIDV"]
LEARNING_LEVELS = {
    1: "Warm-up",
    2: "AP1 Essentials",
    3: "AP1 Core Practice",
    4: "AP1 Advanced",
    5: "AP2 Preview",
    6: "AP2 Essentials",
    7: "AP2 Core Practice",
    8: "AP2 Advanced",
    9: "Professional Practice",
    10: "Specialization Challenge",
}

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

def available_categories(current: list[str] | None = None) -> list[str]:
    """Return all categories already used by exercise JSON files."""
    categories = set(current or [])
    for path in EXERCISES_DIR.glob("*.json"):
        if path.name == "index.json" or path.name.startswith("index_"):
            continue
        data = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(data, dict):
            continue
        categories.update(
            category
            for category in data.get("categories", [])
            if isinstance(category, str) and category.strip()
        )
    return sorted(categories)

def completion_pct(stem: str) -> int:
    """Rough % of key text fields that are filled in the saved exercise JSON."""
    data = load_exercise_json(stem)
    if data is None:
        return 0
    checks: list[bool] = []
    checks.append(bool(data.get("instruction", "").strip()))
    checks.append(bool(data.get("explainInstruction", "").strip()))
    opts = data.get("answerOptions", [])
    if opts:
        checks.append(all(o.strip() for o in opts))
        exp = data.get("explainAnswerOptions", [])
        checks.append(bool(exp) and all(e.strip() for e in exp))
    return round(100 * sum(checks) / len(checks))

def save_indexes() -> None:
    exercise_paths = sorted(
        path
        for path in EXERCISES_DIR.glob("*.json")
        if path.name != "index.json" and not path.name.startswith("index_")
    )
    exercise_files = [path.name for path in exercise_paths]
    INDEX_PATH.write_text(
        json.dumps(exercise_files, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    exercise_specializations = {
        path.name: json.loads(path.read_text(encoding="utf-8")).get(
            "specializations",
            [],
        )
        for path in exercise_paths
    }
    for specialization in SPECIALIZATIONS:
        specialized_files = [
            filename
            for filename, values in exercise_specializations.items()
            if specialization in values
        ]
        index_path = EXERCISES_DIR / f"index_{specialization.lower()}.json"
        index_path.write_text(
            json.dumps(specialized_files, ensure_ascii=False, indent=2),
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
    if (
        mode == "SINGLE_CHOICE"
        and isinstance(raw_correct, list)
        and len(raw_correct) == 1
        and isinstance(raw_correct[0], int)
    ):
        correct_single = raw_correct[0]
    elif mode == "SINGLE_CHOICE" and isinstance(raw_correct, int):
        # Read legacy files long enough to save them in the array format.
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
        "ef_mobile_solvable":    data.get("mobileSolvable", False),
        "ef_learning_level":     data.get("learningLevel", 1),
        "ef_difficulty":         data.get("difficulty", 1),
        "ef_instruction":        data.get("instruction", ""),
        "ef_answer_options":     list(opts),
        "ef_match_options":      list(mopts),
        "ef_correct_single":     correct_single,
        "ef_correct_multiple":   correct_multiple,
        "ef_correct_match":      correct_match,
        "ef_explain_instruction":data.get("explainInstruction", ""),
        "ef_explain_options":    list(data.get("explainAnswerOptions", [""] * n_opts)),
        "ef_categories":         list(data.get("categories", [])),
        "ef_specializations":    list(data.get("specializations", [])),
        "ef_distractor_types":   dict(data.get("distractorTypes", {})),
        "ef_distractor_analysis": dict(data.get("distractorAnalysis", {})),
        "ef_admin_comment":      data.get("adminComment", ""),
        "ef_admin_tags":         ", ".join(data.get("adminTags", [])),
        "ef_selected_screenshots": sel_shots,
        "ef_save_message":       None,
        "ef_confirm_delete":     False,
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

def all_exercises() -> list[tuple[str, str, int]]:
    """Ordered list of (exam, ex, sub_idx) matching the list view."""
    result = []
    for exam, ann in annotated_exams():
        for ex, meta in ann.get("exercises", {}).items():
            subs = meta.get("subs", [])
            real_subs = real_sub_exercises(subs)
            if not real_subs:
                result.append((exam, ex, -1))
            else:
                for sub_idx, _ in real_subs:
                    result.append((exam, ex, sub_idx))
    return result

def _remove_match_option(j: int) -> None:
    ss = _ss()
    ss["ef_match_options"].pop(j)
    ss["ef_correct_match"] = [
        0 if v == j else (v - 1 if v > j else v)
        for v in ss["ef_correct_match"]
    ]

# ---------------------------------------------------------------------------
# Delete annotation
# ---------------------------------------------------------------------------

def delete_annotation() -> None:
    """Delete all screenshots and annotation entry for the current exercise."""
    ss = _ss()
    exam = ss["sel_exam"]
    ex   = ss["sel_ex"]

    ann = load_annotations(exam)
    exs = ann.get("exercises", {})
    if ex in exs:
        subs = exs[ex].get("subs", [])
        for i in range(len(subs)):
            for f in screenshots_for_sub(exam, ex, i):
                f.unlink(missing_ok=True)
        del exs[ex]
        ann_path = FLAT_PDFS / exam / "annotations.json"
        ann_path.write_text(json.dumps(ann, ensure_ascii=False, indent=2), encoding="utf-8")

    ss.update(sel_exam=None, sel_ex=None, sel_sub_idx=None, ef_confirm_delete=False)

# ---------------------------------------------------------------------------
# Save
# ---------------------------------------------------------------------------

def save_exercise(screenshot_files: list[Path]) -> None:
    ss = _ss()
    stem = ss["ef_filename"].strip().removesuffix(".json")
    if not stem:
        ss["ef_save_message"] = "error:Filename cannot be empty."
        return

    data: dict = {
        "inputMode": ss["ef_input_mode"],
        "mobileSolvable": ss["ef_mobile_solvable"],
        "learningLevel": ss["ef_learning_level"],
        "difficulty": ss["ef_difficulty"],
    }

    categories = list(dict.fromkeys(
        category.strip()
        for category in ss["ef_categories"]
        if category.strip()
    ))
    if not categories:
        ss["ef_save_message"] = "error:Select at least one category."
        return
    data["categories"] = categories

    specializations = list(dict.fromkeys(
        specialization
        for specialization in ss["ef_specializations"]
        if specialization in SPECIALIZATIONS
    ))
    if not specializations:
        ss["ef_save_message"] = "error:Select at least one specialization."
        return
    data["specializations"] = specializations

    if ss["ef_instruction"].strip():
        data["instruction"] = ss["ef_instruction"]

    # Copy selected screenshots into the frontend's public data directory.
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
        data["correct"] = [ss["ef_correct_single"]]
    elif mode == "MULTIPLE_CHOICE":
        data["correct"] = [i for i, v in enumerate(ss["ef_correct_multiple"]) if v]
    elif mode == "MATCH":
        correct_matches = list(ss["ef_correct_match"])
        if (
            not opts
            or not mopts
            or len(opts) != len(mopts)
            or sorted(correct_matches) != list(range(len(mopts)))
        ):
            ss["ef_save_message"] = (
                "error:MATCH requires equally sized option lists and each "
                "match option exactly once."
            )
            return
        data["correct"] = correct_matches

    if ss["ef_explain_instruction"].strip():
        data["explainInstruction"] = ss["ef_explain_instruction"]

    exp_opts = ss["ef_explain_options"]
    if any(s.strip() for s in exp_opts):
        data["explainAnswerOptions"] = exp_opts

    dist_types = {str(k): str(v).strip() for k, v in ss.get("ef_distractor_types", {}).items() if str(v).strip()}
    if dist_types:
        data["distractorTypes"] = dist_types

    dist_analysis = {str(k): str(v).strip() for k, v in ss.get("ef_distractor_analysis", {}).items() if str(v).strip()}
    if dist_analysis:
        data["distractorAnalysis"] = dist_analysis

    if ss["ef_admin_comment"].strip():
        data["adminComment"] = ss["ef_admin_comment"]
    tags = [t.strip() for t in ss["ef_admin_tags"].split(",") if t.strip()]
    if tags:
        data["adminTags"] = tags

    out = EXERCISES_DIR / f"{stem}.json"
    EXERCISES_DIR.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(data, ensure_ascii=False, indent=4), encoding="utf-8")

    entry = f"{stem}.json"
    save_indexes()

    ss["ef_save_message"] = f"ok:Saved → {entry}"

def _save_and_next(screenshot_files: list[Path]) -> None:
    save_exercise(screenshot_files)
    ss = _ss()
    if ss.get("ef_save_message", "").startswith("error:"):
        return
    exercises = all_exercises()
    current = (ss["sel_exam"], ss["sel_ex"], ss["sel_sub_idx"])
    try:
        idx = exercises.index(current)
        if idx + 1 < len(exercises):
            _open(*exercises[idx + 1])
        else:
            ss["ef_save_message"] = "ok:Saved. No more exercises."
    except ValueError:
        pass

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
    st.checkbox(
        "Solvable on a small screen without external tools",
        key="ef_mobile_solvable",
    )

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

def render_distractor_profiling() -> None:
    ss = _ss()
    opts = ss.get("ef_answer_options", [])
    if not opts:
        return
    with st.expander("🎯 Distractor Profiling & Analysis (Extensible Taxonomy)"):
        st.caption("Categorize wrong options and explain author intent. Leave blank for correct options.")
        
        if enrich_exercise_sync:
            c_ai, c_key = st.columns([1, 2])
            with c_key:
                api_key = st.text_input("OpenAI API Key (optional if set in ENV)", type="password", key="ef_ai_key")
            with c_ai:
                st.write("") # alignment
                if st.button("🤖 KI: Analysiere Distraktoren", type="primary", key="ef_ai_distractors"):
                    with st.spinner("KI analysiert..."):
                        ex_data = {
                            "question": ss.get("ef_instruction", ""),
                            "answerOptions": opts,
                        }
                        if ss["ef_input_mode"] == "SINGLE_CHOICE":
                            ex_data["correct"] = [ss["ef_correct_single"]]
                        elif ss["ef_input_mode"] == "MULTIPLE_CHOICE":
                            ex_data["correct"] = [i for i, v in enumerate(ss["ef_correct_multiple"]) if v]
                        elif ss["ef_input_mode"] == "MATCH":
                            ex_data["correct"] = list(ss["ef_correct_match"])
                            
                        try:
                            res = enrich_exercise_sync(ex_data, provider="openai", model="gpt-4o", api_key=api_key or os.getenv("OPENAI_API_KEY"))
                            for profile in res.distractors:
                                ss.setdefault("ef_distractor_types", {})[profile.index] = profile.distractorType
                                ss.setdefault("ef_distractor_analysis", {})[profile.index] = profile.distractorAnalysis
                            st.rerun()
                        except Exception as e:
                            st.error(f"KI Fehler: {e}")
                            
        d_types = ss.get("ef_distractor_types", {})
        d_analysis = ss.get("ef_distractor_analysis", {})

        for i, opt in enumerate(opts):
            key_str = str(i)
            st.markdown(f"**Option {i + 1}**: `{opt[:40]}...`" if len(opt) > 40 else f"**Option {i + 1}**: `{opt}`")
            c1, c2 = st.columns([1, 2])
            with c1:
                cur_type = d_types.get(key_str, "")
                new_type = st.text_input(
                    f"Distractor type (Option {i + 1})",
                    value=cur_type,
                    key=f"ef_dist_type_{i}",
                    placeholder="e.g. similarTermConfusion",
                )
                if new_type.strip():
                    d_types[key_str] = new_type.strip()
                elif key_str in d_types:
                    del d_types[key_str]
            with c2:
                cur_ana = d_analysis.get(key_str, "")
                new_ana = st.text_input(
                    f"Distractor analysis (Option {i + 1})",
                    value=cur_ana,
                    key=f"ef_dist_ana_{i}",
                    placeholder="Why this option tricks learners",
                )
                if new_ana.strip():
                    d_analysis[key_str] = new_ana.strip()
                elif key_str in d_analysis:
                    del d_analysis[key_str]

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

    st.multiselect(
        "Categories",
        options=available_categories(_ss().get("ef_categories")),
        key="ef_categories",
        placeholder="Select or add at least one learning category",
        accept_new_options=True,
    )
    st.multiselect(
        "Specializations",
        options=SPECIALIZATIONS,
        key="ef_specializations",
        placeholder="Select at least one specialization",
    )
    st.select_slider(
        "Learning level",
        options=list(LEARNING_LEVELS),
        format_func=lambda level: f"{level} – {LEARNING_LEVELS[level]}",
        key="ef_learning_level",
    )
    st.slider(
        "Estimated difficulty",
        min_value=1,
        max_value=5,
        step=1,
        key="ef_difficulty",
    )
    st.divider()

    render_distractor_profiling()

    with st.expander("Author workflow"):
        st.text_area("Comment", key="ef_admin_comment", height=80,
                     placeholder="Internal note — not shown to users")
        st.text_input(
            "Workflow tags",
            key="ef_admin_tags",
            placeholder="comma-separated, e.g. draft, needs-review",
        )

    st.divider()
    col_save, col_next, col_del = st.columns([2, 2, 3])
    with col_save:
        _save_btn("save_bottom", screenshot_files)
    with col_next:
        if st.button("💾 Save and Next", key="save_next"):
            _save_and_next(screenshot_files)
    with col_del:
        if st.button("🗑 Annotation invalid, delete", key="ef_del_btn"):
            ss["ef_confirm_delete"] = True
            st.rerun()

    if ss.get("ef_confirm_delete"):
        st.warning("Delete all screenshots and annotation for this exercise? This cannot be undone.")
        c1, c2, _ = st.columns([2, 2, 5])
        with c1:
            if st.button("Yes, delete", key="ef_confirm_yes", type="primary"):
                delete_annotation()
                st.rerun()
        with c2:
            if st.button("Cancel", key="ef_confirm_no"):
                ss["ef_confirm_delete"] = False
                st.rerun()

    msg = ss.get("ef_save_message")
    if msg:
        if msg.startswith("ok:"):
            st.success(msg[3:])
        else:
            st.error(msg[6:] if msg.startswith("error:") else msg)

# ---------------------------------------------------------------------------
# OCR reference panel
# ---------------------------------------------------------------------------

def _parse_screenshot_source(exam: str, filename: str) -> tuple[Path, int] | None:
    """Parse 'ex1_sub0__stem_p3.png' → (pdf_path, page_index)."""
    parts = filename.split("__", 1)
    if len(parts) != 2:
        return None
    m = re.match(r"^(.+)_p(\d+)(?:_b\d+)?\.png$", parts[1])
    if not m:
        return None
    stem, page = m.group(1), int(m.group(2))
    pdf_path = FLAT_PDFS / exam / f"{stem}.pdf"
    return (pdf_path, page) if pdf_path.exists() else None


def render_ocr_reference(exam: str, files: list[Path]) -> None:
    if not files:
        return

    ann = load_annotations(exam)
    ocr_map: dict[str, str] = ann.get("ocr", {})

    shot_ocr = [(f.name, ocr_map[f.name]) for f in files if f.name in ocr_map]

    # Collect unique (pdf_path, page) pairs, preserving order
    seen: set[tuple[Path, int]] = set()
    pdf_pages: list[tuple[Path, int]] = []
    for f in files:
        parsed = _parse_screenshot_source(exam, f.name)
        if parsed and parsed not in seen:
            seen.add(parsed)
            pdf_pages.append(parsed)

    page_texts: list[tuple[str, int, str]] = []
    for pdf_path, page_idx in pdf_pages:
        try:
            doc = fitz.open(str(pdf_path))
            text = doc[page_idx].get_text().strip()
            doc.close()
            if text:
                page_texts.append((pdf_path.name, page_idx, text))
        except Exception:
            pass

    if not shot_ocr and not page_texts:
        return

    with st.expander("📋 OCR reference", expanded=False):
        if shot_ocr:
            st.markdown("**Screenshot OCR**")
            for name, text in shot_ocr:
                st.caption(name)
                st.code(text, language=None)

        if page_texts:
            st.markdown("**Source PDF pages**")
            for pdf_name, page_idx, text in page_texts:
                st.caption(f"{pdf_name}  —  page {page_idx + 1}")
                st.code(text, language=None)


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
                    pct = completion_pct(suggested_filename(exam, ex, -1))
                    if st.button(f"Exercise {ex}  —  {pct}%", key=f"open_{exam}_{ex}"):
                        _open(exam, ex, -1)
                else:
                    for sub_idx, _ in real_subs:
                        pct = completion_pct(suggested_filename(exam, ex, sub_idx))
                        if st.button(f"Exercise {ex}.{sub_idx}  —  {pct}%", key=f"open_{exam}_{ex}_{sub_idx}"):
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

    render_ocr_reference(exam, files)

# ---------------------------------------------------------------------------
# Router
# ---------------------------------------------------------------------------

if st.session_state.sel_exam is not None:
    detail_view()
else:
    list_view()
