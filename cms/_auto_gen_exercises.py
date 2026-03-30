#!/usr/bin/env python3
"""
Build public-facing exercise JSON (+ copied crops) from CMS annotations.

Reads:  cms/processed_data/flat_pdfs/<exam>/annotations.json
        cms/processed_data/flat_pdfs/<exam>/screenshots/*.png
Writes: public/data/exercises/*.json
        public/data/img/*.png

Rules (matches CMS subs: Main, Answer Key, Answer Options, custom…):
- Ignores all Answer Key crops (sub "Answer Key" or legacy "Answer") from the
  published `images` list.
- If an annotation exercise has no custom sub-exercises: emit ONE JSON file using
  Main + Answer Options crops only.
- If it has custom sub-exercises: one JSON per custom sub, each with Main +
  Answer Options + that sub's crops.

Runs OCR (Tesseract) and **multi-pass** LLM inference: small context first; stop
early when confidence is high enough (`--llm-confidence`), otherwise escalate up
to `--llm-max-passes` (4 stages: answer options + key → + truncated Main → + full
Main/custom → full publication order). Enriches JSON with `inputMode`,
`answerOptions`, `correct`.

**LLM backend**: default `--llm-backend openai` (`OPENAI_API_KEY` in env or `cms/.env`; use
`--openai-model`, e.g. `gpt-4o`). Use `--llm-backend ollama` for local
`--ollama-model` (default `qwen3.5:4b`).

**Batch cap**: `--max-exercise-outputs` defaults to **10** JSON files per run
(use `0` for no limit).

This script intentionally does not generate instruction/explain* text fields.

Image order follows `boxes` in annotations.json. Publication crops are copied to
`public/data/img/` with a `{exam_slug}__…` prefix; JSON lists those basenames.

Prereqs:
  - OpenAI: `OPENAI_API_KEY` in the environment or in `cms/.env`, or Ollama + `ollama pull …` for local
  - system `tesseract` + language packs (e.g. deu, eng)
  - `cd cms && uv sync`

Run:
  `cd cms && uv run python 002_build_exercises_from_annotations.py`
"""

from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import sys
from pathlib import Path
from typing import Any, Literal

from pydantic import BaseModel, Field
from tqdm import tqdm

# --- repo paths ---
CMS_ROOT = Path(__file__).resolve().parent
REPO = CMS_ROOT.parent
FLATPDFS = REPO / "cms" / "processed_data" / "flat_pdfs"
PUBLIC = REPO / "public"
EXERCISES_DIR = PUBLIC / "data" / "exercises"
IMG_DIR = PUBLIC / "data" / "img"

RESERVED_SUBS = frozenset({"Main", "Answer Key", "Answer Options", "Answer"})
SKIP_SUBS = frozenset({"Answer Key", "Answer"})  # never exported
KEY_SUBS = frozenset({"Answer Key", "Answer"})  # OCR/LLM only

LlmBackend = Literal["ollama", "openai"]


class LlmMcMetadata(BaseModel):
    inputMode: Literal["SINGLE_CHOICE", "MULTIPLE_CHOICE"]
    answerOptions: list[str] = Field(min_length=2)
    correct_indices: list[int] = Field(min_length=1)
    notes: str = ""
    confidence: float = Field(default=0.5, ge=0.0, le=1.0)
    needs_more_context: bool = True
    missing_clues: str = ""


def slug(s: str) -> str:
    s = s.strip().replace("/", "_")
    return re.sub(r"[^a-zA-Z0-9._-]+", "_", s) or "exam"


def norm_ex_key(ann: dict, ex: str) -> str | None:
    for k in ann.get("exercises", {}):
        if str(k) == str(ex):
            return str(k)
    return None


def subs_for(ann: dict, ex: str) -> list[str]:
    k = norm_ex_key(ann, ex)
    if k is None:
        return ["Main"]
    return list(ann["exercises"][k].get("subs") or ["Main"])


def custom_subs(subs: list[str]) -> list[str]:
    return [s for s in subs if s not in RESERVED_SUBS]


def main_answer_only_subs(subs: list[str]) -> frozenset[str]:
    """Subs allowed in the 'flat' exercise (no custom splits)."""
    out = {"Main", "Answer Options"}
    return frozenset(s for s in subs if s in out)


def sub_index_in_exercise(subs: list[str], sub: str) -> int:
    if sub in subs:
        return subs.index(sub)
    return 0


def shot_name(ex: str, subs: list[str], b: dict) -> str:
    si = sub_index_in_exercise(subs, b["sub"])
    stem = Path(b["pdf"]).stem
    page_num = b["page"]
    return f"ex{ex}_sub{si}__{stem}_p{page_num}.png"


def ordered_pngs(
    ann: dict,
    ex_key: str,
    allowed_subs: frozenset[str],
    shots_dir: Path,
) -> list[Path]:
    subs = subs_for(ann, ex_key)
    seen: list[Path] = []
    for b in ann.get("boxes", []):
        if str(b.get("exercise")) != str(ex_key):
            continue
        sub = b.get("sub")
        if sub in SKIP_SUBS:
            continue
        if sub not in allowed_subs:
            continue
        name = shot_name(ex_key, subs, b)
        p = shots_dir / name
        if p.is_file() and p not in seen:
            seen.append(p)
    return seen


def ordered_pngs_answer_key_only(
    ann: dict,
    ex_key: str,
    shots_dir: Path,
) -> list[Path]:
    """Answer Key/Answer crops in annotation order for OCR+LLM only."""
    subs = subs_for(ann, ex_key)
    seen: list[Path] = []
    for b in ann.get("boxes", []):
        if str(b.get("exercise")) != str(ex_key):
            continue
        sub = b.get("sub")
        if sub not in KEY_SUBS:
            continue
        name = shot_name(ex_key, subs, b)
        p = shots_dir / name
        if p.is_file() and p not in seen:
            seen.append(p)
    return seen


def ocr_png(path: Path, lang: str) -> str:
    import pytesseract
    from PIL import Image

    with Image.open(path) as img:
        text = pytesseract.image_to_string(img, lang=lang)
    return (text or "").strip()


def sub_label_from_shot_name(ex_key: str, subs: list[str], p: Path) -> str | None:
    m = re.match(rf"ex{re.escape(str(ex_key))}_sub(\d+)__", p.name)
    if not m:
        return None
    idx = int(m.group(1))
    if 0 <= idx < len(subs):
        return subs[idx]
    return None


def partition_public_pngs(
    public_pngs: list[Path],
    ann: dict,
    ex_key: str,
    custom_sub_name: str | None,
) -> tuple[list[Path], list[Path], list[Path]]:
    """Split publication paths into Main / Answer Options / custom sub (if any)."""
    subs = subs_for(ann, ex_key)
    main_l: list[Path] = []
    opt_l: list[Path] = []
    cust_l: list[Path] = []
    cust_set = frozenset({custom_sub_name} if custom_sub_name else [])
    for p in public_pngs:
        label = sub_label_from_shot_name(ex_key, subs, p)
        if label == "Answer Options":
            opt_l.append(p)
        elif label in cust_set:
            cust_l.append(p)
        elif label == "Main" or label is None:
            main_l.append(p)
        else:
            main_l.append(p)
    return main_l, opt_l, cust_l


def truncate_ocr_chunk(text: str, max_chars: int | None) -> str:
    if max_chars is None:
        return text or ""
    t = (text or "").strip()
    if len(t) <= max_chars:
        return t
    return t[:max_chars] + "\n[…truncated…]"


def ocr_paths_into_lines(
    paths: list[Path],
    *,
    ocr_lang: str,
    cache: dict[Path, str],
    progress: bool,
    tqdm_desc: str,
    truncate_chars: int | None,
) -> list[str]:
    lines: list[str] = []
    for p in tqdm(
        paths,
        desc=tqdm_desc,
        leave=False,
        unit="img",
        disable=not progress,
    ):
        lines.append(f"--- {p.name} ---")
        if p not in cache:
            try:
                cache[p] = ocr_png(p, ocr_lang) or ""
            except Exception as exc:  # pragma: no cover
                cache[p] = f"[OCR error: {exc}]"
        lines.append(truncate_ocr_chunk(cache[p], truncate_chars) or "[empty OCR]")
    return lines


def append_key_sections(
    lines: list[str],
    key_pngs: list[Path],
    *,
    ocr_lang: str,
    cache: dict[Path, str],
    progress: bool,
    tqdm_desc: str,
) -> None:
    lines.append("=== ANSWER_KEY_IMAGES (OCR) ===")
    if not key_pngs:
        lines.append("[no answer key annotations]")
        return
    lines.extend(
        ocr_paths_into_lines(
            key_pngs,
            ocr_lang=ocr_lang,
            cache=cache,
            progress=progress,
            tqdm_desc=tqdm_desc,
            truncate_chars=None,
        )
    )


def build_ocr_context_for_llm(
    public_pngs: list[Path],
    key_pngs: list[Path],
    *,
    ocr_lang: str,
    progress: bool,
    ocr_desc: str,
    cache: dict[Path, str] | None = None,
) -> str:
    """Full publication order + answer key (final escalation pass)."""
    c = cache if cache is not None else {}
    lines: list[str] = []
    lines.append("=== QUESTION_AND_OPTION_IMAGES (OCR, publication order) ===")
    lines.extend(
        ocr_paths_into_lines(
            public_pngs,
            ocr_lang=ocr_lang,
            cache=c,
            progress=progress,
            tqdm_desc=f"{ocr_desc} · publication",
            truncate_chars=None,
        )
    )
    append_key_sections(
        lines,
        key_pngs,
        ocr_lang=ocr_lang,
        cache=c,
        progress=progress,
        tqdm_desc=f"{ocr_desc} · answer key",
    )
    return "\n".join(lines)


def build_progressive_ocr_dump(
    *,
    pass_index: int,
    public_pngs: list[Path],
    key_pngs: list[Path],
    main_pngs: list[Path],
    options_pngs: list[Path],
    custom_pngs: list[Path],
    ocr_lang: str,
    progress: bool,
    ocr_desc: str,
    cache: dict[Path, str],
    main_trunc_chars: int,
) -> str:
    """
    pass_index 0: answer options + key only.
    1: + Main (truncated per image).
    2: + Main full + custom full (if custom_pngs else Main full only).
    3: full publication order + key (canonical).
    """
    lines: list[str] = []
    if pass_index >= 3:
        return build_ocr_context_for_llm(
            public_pngs,
            key_pngs,
            ocr_lang=ocr_lang,
            progress=progress,
            ocr_desc=ocr_desc,
            cache=cache,
        )

    lines.append("=== ANSWER_OPTIONS_IMAGES (OCR) ===")
    if not options_pngs:
        lines.append("[no Answer Options crops]")
    else:
        lines.extend(
            ocr_paths_into_lines(
                options_pngs,
                ocr_lang=ocr_lang,
                cache=cache,
                progress=progress,
                tqdm_desc=f"{ocr_desc} · options",
                truncate_chars=None,
            )
        )
    append_key_sections(
        lines,
        key_pngs,
        ocr_lang=ocr_lang,
        cache=cache,
        progress=progress,
        tqdm_desc=f"{ocr_desc} · answer key",
    )

    if pass_index >= 1 and main_pngs:
        lines.append("=== MAIN_IMAGES (OCR) ===")
        mt = main_trunc_chars if pass_index == 1 else None
        lines.extend(
            ocr_paths_into_lines(
                main_pngs,
                ocr_lang=ocr_lang,
                cache=cache,
                progress=progress,
                tqdm_desc=f"{ocr_desc} · main",
                truncate_chars=mt,
            )
        )

    if pass_index >= 2 and custom_pngs:
        lines.append("=== CUSTOM_SUB_IMAGES (OCR) ===")
        lines.extend(
            ocr_paths_into_lines(
                custom_pngs,
                ocr_lang=ocr_lang,
                cache=cache,
                progress=progress,
                tqdm_desc=f"{ocr_desc} · custom sub",
                truncate_chars=None,
            )
        )
    return "\n".join(lines)


def _mc_system_prompt() -> str:
    return (
        "Extract multiple-choice metadata from exam OCR. "
        "Use ANSWER_KEY_IMAGES when present. "
        "Set confidence 0..1 (how sure you are). "
        "Set needs_more_context false when you have enough to list options and correct indices. "
        "Set needs_more_context true only if stems/choices/key are insufficient. "
        "missing_clues: at most one short phrase."
    )


def _mc_user_prompt(
    pass_label: str,
    pass_index: int,
    pass_total: int,
    ocr_dump: str,
) -> str:
    return (
        f"{pass_label} ({pass_index + 1}/{pass_total}). "
        "Rules: answerOptions in reading order; correct_indices 0-based; "
        "inputMode SINGLE_CHOICE iff exactly one correct option else MULTIPLE_CHOICE.\n\n"
        "OCR:\n"
        f"{ocr_dump}"
    )


def infer_mc_metadata_ollama(
    ocr_dump: str,
    *,
    model: str,
    host: str | None,
    timeout: float | None,
    llm_desc: str,
    progress: bool,
    pass_index: int,
    pass_total: int,
    pass_label: str,
) -> LlmMcMetadata:
    from ollama import Client

    schema: dict[str, Any] = LlmMcMetadata.model_json_schema()
    system_prompt = _mc_system_prompt()
    user_prompt = _mc_user_prompt(pass_label, pass_index, pass_total, ocr_dump)

    client = Client(host=host, timeout=timeout)
    with tqdm(
        total=1,
        desc=f"{llm_desc} · LLM p{pass_index + 1}/{pass_total}",
        leave=False,
        unit="call",
        disable=not progress,
    ) as llm_pbar:
        response = client.chat(
            model=model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            format=schema,
            options={"temperature": 0},
        )
        llm_pbar.update(1)
    content = response["message"]["content"]
    return LlmMcMetadata.model_validate_json(content)


def infer_mc_metadata_openai(
    ocr_dump: str,
    *,
    model: str,
    llm_desc: str,
    progress: bool,
    pass_index: int,
    pass_total: int,
    pass_label: str,
) -> LlmMcMetadata:
    from openai import OpenAI

    client = OpenAI()
    system_prompt = _mc_system_prompt()
    user_prompt = _mc_user_prompt(pass_label, pass_index, pass_total, ocr_dump)
    with tqdm(
        total=1,
        desc=f"{llm_desc} · OpenAI p{pass_index + 1}/{pass_total}",
        leave=False,
        unit="call",
        disable=not progress,
    ) as llm_pbar:
        completion = client.chat.completions.parse(
            model=model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            response_format=LlmMcMetadata,
            temperature=0,
        )
        llm_pbar.update(1)
    msg = completion.choices[0].message
    if msg.refusal:
        raise RuntimeError(f"OpenAI refusal: {msg.refusal}")
    if msg.parsed is None:
        raise RuntimeError("OpenAI returned no parsed structured output")
    return msg.parsed


def infer_mc_metadata(
    ocr_dump: str,
    *,
    backend: LlmBackend,
    ollama_model: str,
    ollama_host: str | None,
    ollama_timeout: float | None,
    openai_model: str,
    llm_desc: str,
    progress: bool,
    pass_index: int,
    pass_total: int,
    pass_label: str,
) -> LlmMcMetadata:
    if backend == "openai":
        return infer_mc_metadata_openai(
            ocr_dump,
            model=openai_model,
            llm_desc=llm_desc,
            progress=progress,
            pass_index=pass_index,
            pass_total=pass_total,
            pass_label=pass_label,
        )
    return infer_mc_metadata_ollama(
        ocr_dump,
        model=ollama_model,
        host=ollama_host,
        timeout=ollama_timeout,
        llm_desc=llm_desc,
        progress=progress,
        pass_index=pass_index,
        pass_total=pass_total,
        pass_label=pass_label,
    )


def normalize_guess_to_exercise_fields(guess: LlmMcMetadata) -> dict[str, Any]:
    options = [o.strip() for o in guess.answerOptions if o.strip()]
    if len(options) < 2:
        raise ValueError("LLM returned too few answer options")

    valid = sorted({i for i in guess.correct_indices if 0 <= i < len(options)})
    if not valid:
        raise ValueError("LLM returned no valid correct indices")

    mode = guess.inputMode
    if mode == "SINGLE_CHOICE" and len(valid) > 1:
        mode = "MULTIPLE_CHOICE"
    if mode == "MULTIPLE_CHOICE" and len(valid) == 1:
        mode = "SINGLE_CHOICE"

    out: dict[str, Any] = {
        "inputMode": mode,
        "answerOptions": options,
    }
    if mode == "SINGLE_CHOICE":
        out["correct"] = valid[0]
        out["submitButton"] = False
    else:
        out["correct"] = valid
    return out


def llm_should_stop(
    guess: LlmMcMetadata,
    *,
    conf_min: float,
    conf_relaxed: float,
) -> bool:
    if guess.confidence >= conf_min:
        return True
    if not guess.needs_more_context and guess.confidence >= conf_relaxed:
        return True
    return False


def run_ocr_llm_enrichment(
    public_pngs: list[Path],
    key_pngs: list[Path],
    ann: dict,
    ex_key: str,
    *,
    custom_sub_name: str | None,
    ocr_lang: str,
    llm_backend: LlmBackend,
    ollama_model: str,
    ollama_host: str | None,
    ollama_timeout: float | None,
    openai_model: str,
    progress: bool,
    task_desc: str,
    llm_max_passes: int,
    llm_conf_min: float,
    llm_conf_relaxed: float,
    main_trunc_chars: int,
) -> tuple[dict[str, Any] | None, str]:
    main_pngs, options_pngs, custom_pngs = partition_public_pngs(
        public_pngs,
        ann,
        ex_key,
        custom_sub_name,
    )
    cache: dict[Path, str] = {}
    last_err: str | None = None
    best_guess: LlmMcMetadata | None = None
    best_fields: dict[str, Any] | None = None
    pass_total = min(max(llm_max_passes, 1), 4)
    passes_used = 0

    pass_labels = ("options+key", "+main (trunc)", "+main/custom full", "full publication order")

    for pi in range(pass_total):
        try:
            ocr_dump = build_progressive_ocr_dump(
                pass_index=pi,
                public_pngs=public_pngs,
                key_pngs=key_pngs,
                main_pngs=main_pngs,
                options_pngs=options_pngs,
                custom_pngs=custom_pngs,
                ocr_lang=ocr_lang,
                progress=progress,
                ocr_desc=task_desc,
                cache=cache,
                main_trunc_chars=main_trunc_chars,
            )
        except Exception as exc:
            return None, f"OCR failed: {exc}"

        plabel = pass_labels[min(pi, 3)]
        try:
            guess = infer_mc_metadata(
                ocr_dump,
                backend=llm_backend,
                ollama_model=ollama_model,
                ollama_host=ollama_host,
                ollama_timeout=ollama_timeout,
                openai_model=openai_model,
                llm_desc=task_desc,
                progress=progress,
                pass_index=pi,
                pass_total=pass_total,
                pass_label=plabel,
            )
            fields = normalize_guess_to_exercise_fields(guess)
        except Exception as exc:
            last_err = str(exc)
            continue

        passes_used = pi + 1
        best_guess = guess
        best_fields = fields
        if llm_should_stop(guess, conf_min=llm_conf_min, conf_relaxed=llm_conf_relaxed):
            break

    if best_fields is None or best_guess is None:
        suffix = f" ({last_err})" if last_err else ""
        return None, f"LLM metadata inference failed{suffix}"

    backend_tag = f"openai:{openai_model}" if llm_backend == "openai" else f"ollama:{ollama_model}"
    extra = (
        f"OCR+LLM ({backend_tag}); passes_used={passes_used}/{pass_total}; "
        f"confidence={best_guess.confidence:.2f}; needs_more_context={best_guess.needs_more_context}"
    )
    if best_guess.notes.strip():
        extra += f"; notes={best_guess.notes.strip()}"
    if best_guess.missing_clues.strip():
        extra += f"; missing={best_guess.missing_clues.strip()}"
    return best_fields, extra


def copy_with_unique_name(src: Path, exam_slug: str, dest_dir: Path) -> str:
    dest_dir.mkdir(parents=True, exist_ok=True)
    safe = slug(src.stem)
    dest_name = f"{exam_slug}__{safe}{src.suffix}"
    dest = dest_dir / dest_name
    shutil.copy2(src, dest)
    return dest_name


def load_ann(exam: str) -> dict:
    p = FLATPDFS / exam / "annotations.json"
    if not p.is_file():
        raise FileNotFoundError(f"Missing annotations: {p}")
    return json.loads(p.read_text(encoding="utf-8"))


def ensure_screenshots_safe(exam: str, ann: dict) -> Path:
    shots = FLATPDFS / exam / "screenshots"
    sys.path.insert(0, str(REPO / "cms"))
    try:
        from annotation_store import extract_screenshots

        extract_screenshots(exam, ann)
    finally:
        sys.path.pop(0)
    return shots


def build_exercise_object(
    image_basenames: list[str],
    *,
    admin_note: str,
    llm_fields: dict[str, Any] | None = None,
) -> dict:
    obj: dict[str, Any] = {
        "images": image_basenames,
        "adminComment": admin_note,
    }
    if llm_fields:
        obj.update(llm_fields)
    return obj


def write_json(path: Path, obj: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def merge_index(new_filenames: list[str]) -> None:
    idx_path = EXERCISES_DIR / "index.json"
    if idx_path.is_file():
        cur = json.loads(idx_path.read_text(encoding="utf-8"))
        if not isinstance(cur, list):
            cur = []
    else:
        cur = []
    names = sorted(set(cur) | set(new_filenames))
    idx_path.parent.mkdir(parents=True, exist_ok=True)
    idx_path.write_text(json.dumps(names, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def exercise_output_count(ann: dict) -> int:
    exercises_block = ann.get("exercises") or {}
    total = 0
    for ex_raw in exercises_block:
        ex_key = str(ex_raw)
        subs = subs_for(ann, ex_key)
        customs = custom_subs(subs)
        total += 1 if not customs else len(customs)
    return total


class OutputBudget:
    """Cap exercise JSON outputs per run. None limit = unlimited."""

    def __init__(self, max_outputs: int | None) -> None:
        self._left = max_outputs

    def is_exhausted(self) -> bool:
        return self._left is not None and self._left <= 0

    def record_one(self) -> None:
        if self._left is not None:
            self._left -= 1


def process_exam(
    exam: str,
    *,
    dry_run: bool,
    no_llm: bool,
    ocr_lang: str,
    llm_backend: LlmBackend,
    ollama_model: str,
    ollama_host: str | None,
    ollama_timeout: float | None,
    openai_model: str,
    progress: bool,
    llm_max_passes: int,
    llm_conf_min: float,
    llm_conf_relaxed: float,
    main_trunc_chars: int,
    output_budget: OutputBudget,
) -> list[str]:
    ann = load_ann(exam)
    exam_slug = slug(exam)

    if not dry_run:
        ensure_screenshots_safe(exam, ann)
    shots_dir = FLATPDFS / exam / "screenshots"

    created: list[str] = []
    exercises_block = ann.get("exercises") or {}
    out_total = exercise_output_count(ann)
    out_pbar = tqdm(
        total=out_total,
        desc=f"{exam}",
        unit="exercise",
        leave=True,
        disable=not progress,
    )

    try:
        for ex_raw, _meta in exercises_block.items():
            ex_key = str(ex_raw)
            subs = subs_for(ann, ex_key)
            customs = custom_subs(subs)
            base_allowed = main_answer_only_subs(subs)

            if not customs:
                if output_budget.is_exhausted():
                    print(
                        "Max exercise outputs reached (--max-exercise-outputs); stopping.",
                        file=sys.stderr,
                    )
                    break
                pngs = ordered_pngs(ann, ex_key, base_allowed, shots_dir)
                key_pngs = ordered_pngs_answer_key_only(ann, ex_key, shots_dir)
                task_desc = f"{exam} ex{ex_key}"
                if dry_run:
                    print(
                        f"[dry-run] {exam} ex{ex_key} flat -> {len(pngs)} images, "
                        f"{len(key_pngs)} answer-key OCR crops"
                    )
                    output_budget.record_one()
                    out_pbar.update(1)
                    continue
                imgs: list[str] = []
                for p in pngs:
                    imgs.append(copy_with_unique_name(p, exam_slug, IMG_DIR))
                fname = f"{exam_slug}__ex{ex_key}.json"
                llm_fields: dict[str, Any] | None = None
                llm_info = "LLM disabled"
                if not no_llm and pngs:
                    llm_fields, llm_info = run_ocr_llm_enrichment(
                        pngs,
                        key_pngs,
                        ann,
                        ex_key,
                        custom_sub_name=None,
                        ocr_lang=ocr_lang,
                        llm_backend=llm_backend,
                        ollama_model=ollama_model,
                        ollama_host=ollama_host,
                        ollama_timeout=ollama_timeout,
                        openai_model=openai_model,
                        progress=progress,
                        task_desc=task_desc,
                        llm_max_passes=llm_max_passes,
                        llm_conf_min=llm_conf_min,
                        llm_conf_relaxed=llm_conf_relaxed,
                        main_trunc_chars=main_trunc_chars,
                    )
                obj = build_exercise_object(
                    imgs,
                    admin_note=(
                        f"Auto-generated from CMS annotations: exam={exam!r}, "
                        f"exercise={ex_key}, variant=flat (Main + Answer Options); {llm_info}."
                    ),
                    llm_fields=llm_fields,
                )
                write_json(EXERCISES_DIR / fname, obj)
                created.append(fname)
                output_budget.record_one()
                out_pbar.update(1)
            else:
                for csub in customs:
                    if output_budget.is_exhausted():
                        print(
                            "Max exercise outputs reached (--max-exercise-outputs); stopping.",
                            file=sys.stderr,
                        )
                        break
                    allowed = frozenset(set(base_allowed) | {csub})
                    pngs = ordered_pngs(ann, ex_key, allowed, shots_dir)
                    key_pngs = ordered_pngs_answer_key_only(ann, ex_key, shots_dir)
                    sub_slug = slug(csub)
                    task_desc = f"{exam} ex{ex_key} {sub_slug}"
                    if dry_run:
                        print(
                            f"[dry-run] {exam} ex{ex_key} sub={csub!r} -> {len(pngs)} images, "
                            f"{len(key_pngs)} answer-key OCR crops"
                        )
                        output_budget.record_one()
                        out_pbar.update(1)
                        continue
                    imgs = [copy_with_unique_name(p, exam_slug, IMG_DIR) for p in pngs]
                    fname = f"{exam_slug}__ex{ex_key}__{sub_slug}.json"
                    llm_fields = None
                    llm_info = "LLM disabled"
                    if not no_llm and pngs:
                        llm_fields, llm_info = run_ocr_llm_enrichment(
                            pngs,
                            key_pngs,
                            ann,
                            ex_key,
                            custom_sub_name=csub,
                            ocr_lang=ocr_lang,
                            llm_backend=llm_backend,
                            ollama_model=ollama_model,
                            ollama_host=ollama_host,
                            ollama_timeout=ollama_timeout,
                            openai_model=openai_model,
                            progress=progress,
                            task_desc=task_desc,
                            llm_max_passes=llm_max_passes,
                            llm_conf_min=llm_conf_min,
                            llm_conf_relaxed=llm_conf_relaxed,
                            main_trunc_chars=main_trunc_chars,
                        )
                    obj = build_exercise_object(
                        imgs,
                        admin_note=(
                            f"Auto-generated from CMS annotations: exam={exam!r}, exercise={ex_key}, "
                            f"variant=sub-exercise {csub!r} (Main + Answer Options + this sub); "
                            f"{llm_info}."
                        ),
                        llm_fields=llm_fields,
                    )
                    write_json(EXERCISES_DIR / fname, obj)
                    created.append(fname)
                    output_budget.record_one()
                    out_pbar.update(1)
                else:
                    continue
                break
    finally:
        out_pbar.close()

    return created


def load_cms_dotenv() -> None:
    """Load `cms/.env` if present. Does not override variables already set in the environment."""
    from dotenv import load_dotenv

    env_path = CMS_ROOT / ".env"
    if env_path.is_file():
        load_dotenv(env_path, override=False)


def main() -> None:
    load_cms_dotenv()
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument(
        "--exam",
        action="append",
        dest="exams",
        metavar="NAME",
        help="Exam folder under cms/processed_data/flat_pdfs (repeatable). Default: all.",
    )
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument(
        "--update-index",
        action="store_true",
        help="Merge new filenames into public/data/exercises/index.json",
    )
    ap.add_argument(
        "--no-llm",
        action="store_true",
        help="Skip OCR+LLM enrichment and only emit images/adminComment.",
    )
    ap.add_argument(
        "--llm-backend",
        choices=["openai", "ollama"],
        default="openai",
        help="LLM provider (default: openai). Requires OPENAI_API_KEY for openai.",
    )
    ap.add_argument(
        "--openai-model",
        default="gpt-4o",
        help="OpenAI model for structured parsing (default: gpt-4o).",
    )
    ap.add_argument(
        "--max-exercise-outputs",
        type=int,
        default=10,
        metavar="N",
        help="Max exercise JSON files this run (0 = no limit). Default: 10.",
    )
    ap.add_argument(
        "--ocr-lang",
        default="deu+eng",
        help="Tesseract languages (default: deu+eng).",
    )
    ap.add_argument(
        "--ollama-model",
        default="qwen3.5:4b",
        help="Ollama model (default: qwen3.5:4b).",
    )
    ap.add_argument(
        "--ollama-host",
        default=None,
        help="Ollama host URL; falls back to OLLAMA_HOST/default client host.",
    )
    ap.add_argument(
        "--ollama-timeout",
        type=float,
        default=120.0,
        help="Ollama request timeout in seconds (default: 120).",
    )
    ap.add_argument(
        "--no-progress",
        action="store_true",
        help="Disable tqdm progress bars.",
    )
    ap.add_argument(
        "--llm-max-passes",
        type=int,
        default=4,
        help="LLM escalation passes (1–4). Default: 4.",
    )
    ap.add_argument(
        "--llm-confidence",
        type=float,
        default=0.82,
        help="Stop early when model confidence >= this (0–1). Default: 0.82.",
    )
    ap.add_argument(
        "--llm-confidence-relaxed",
        type=float,
        default=0.70,
        help="Stop when needs_more_context is false and confidence >= this. Default: 0.70.",
    )
    ap.add_argument(
        "--llm-main-truncate",
        type=int,
        default=1400,
        help="Max OCR chars per Main image on pass 2 (truncated pass). Default: 1400.",
    )
    args = ap.parse_args()
    args.llm_max_passes = max(1, min(4, args.llm_max_passes))

    if not args.no_llm and args.llm_backend == "openai" and not os.environ.get("OPENAI_API_KEY"):
        print(
            "OPENAI_API_KEY is required for --llm-backend openai "
            "(or use --llm-backend ollama / --no-llm).",
            file=sys.stderr,
        )
        sys.exit(1)

    if not FLATPDFS.is_dir():
        print(f"Expected annotations root {FLATPDFS}", file=sys.stderr)
        sys.exit(1)

    names = args.exams
    if not names:
        names = sorted(d.name for d in FLATPDFS.iterdir() if d.is_dir())

    show_progress = not args.no_progress
    budget_limit: int | None = (
        None if args.max_exercise_outputs <= 0 else args.max_exercise_outputs
    )
    output_budget = OutputBudget(budget_limit)
    all_created: list[str] = []
    for exam in tqdm(
        names,
        desc="Exams",
        unit="exam",
        disable=not show_progress,
    ):
        if output_budget.is_exhausted():
            print(
                "Max exercise outputs reached (--max-exercise-outputs); skipping further exams.",
                file=sys.stderr,
            )
            break
        p = FLATPDFS / exam
        if not p.is_dir():
            print(f"skip missing exam dir: {exam}", file=sys.stderr)
            continue
        if not (p / "annotations.json").is_file():
            print(f"skip no annotations.json: {exam}", file=sys.stderr)
            continue
        created = process_exam(
            exam,
            dry_run=args.dry_run,
            no_llm=args.no_llm,
            ocr_lang=args.ocr_lang,
            llm_backend=args.llm_backend,
            ollama_model=args.ollama_model,
            ollama_host=args.ollama_host,
            ollama_timeout=args.ollama_timeout,
            openai_model=args.openai_model,
            progress=show_progress,
            llm_max_passes=args.llm_max_passes,
            llm_conf_min=args.llm_confidence,
            llm_conf_relaxed=args.llm_confidence_relaxed,
            main_trunc_chars=args.llm_main_truncate,
            output_budget=output_budget,
        )
        all_created.extend(created)

    if args.update_index and all_created and not args.dry_run:
        merge_index(all_created)

    if all_created:
        print("Wrote:")
        for f in all_created:
            print(f"  {f}")
    elif not args.dry_run:
        print("No exercise JSON files created.")


if __name__ == "__main__":
    main()
