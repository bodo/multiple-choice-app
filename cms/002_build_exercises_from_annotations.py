#!/usr/bin/env python3
"""
Build public-facing exercise JSON (+ copied crops) from CMS annotations.

Reads:  cms/processed_data/flat_pdfs/<exam>/annotations.json
        cms/processed_data/flat_pdfs/<exam>/screenshots/*.png
Writes: public/data/exercises/*.json
        public/data/img/*.png

Rules (matches CMS subs: Main, Answer Key, Answer Options, custom…):
- Ignores all Answer Key crops (sub "Answer Key" or legacy "Answer").
- If an annotation exercise has no custom sub-exercises: emit ONE JSON file using
  Main + Answer Options crops only.
- If it has custom sub-exercises: one JSON per custom sub, each with Main +
  Answer Options + that sub's crops.

Image order follows `boxes` in annotations.json. Crops are copied to
`public/data/img/` with a `{exam_slug}__…` prefix; JSON lists those basenames.

Run:  python scripts/002_build_exercises_from_annotations.py [--exam DIR …] [--update-index]
"""

from __future__ import annotations

import argparse
import json
import re
import shutil
import sys
from pathlib import Path

# --- repo paths ---
REPO = Path(__file__).resolve().parent.parent
FLATPDFS = REPO / "cms" / "processed_data" / "flat_pdfs"
PUBLIC = REPO / "public"
EXERCISES_DIR = PUBLIC / "data" / "exercises"
IMG_DIR = PUBLIC / "data" / "img"

RESERVED_SUBS = frozenset({"Main", "Answer Key", "Answer Options", "Answer"})
SKIP_SUBS = frozenset({"Answer Key", "Answer"})  # never exported


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
) -> dict:
    return {
        "images": image_basenames,
        "adminComment": admin_note,
    }


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


def process_exam(
    exam: str,
    *,
    dry_run: bool,
) -> list[str]:
    ann = load_ann(exam)
    exam_slug = slug(exam)

    if not dry_run:
        ensure_screenshots_safe(exam, ann)
    shots_dir = FLATPDFS / exam / "screenshots"

    created: list[str] = []
    exercises_block = ann.get("exercises") or {}

    for ex_raw, _meta in exercises_block.items():
        ex_key = str(ex_raw)
        subs = subs_for(ann, ex_key)
        customs = custom_subs(subs)
        base_allowed = main_answer_only_subs(subs)

        if not customs:
            pngs = ordered_pngs(ann, ex_key, base_allowed, shots_dir)
            if dry_run:
                print(f"[dry-run] {exam} ex{ex_key} flat -> {len(pngs)} images")
                continue
            imgs: list[str] = []
            for p in pngs:
                imgs.append(copy_with_unique_name(p, exam_slug, IMG_DIR))
            fname = f"{exam_slug}__ex{ex_key}.json"
            obj = build_exercise_object(
                imgs,
                admin_note=f"Auto-generated from CMS annotations: exam={exam!r}, exercise={ex_key}, variant=flat (Main + Answer Options).",
            )
            write_json(EXERCISES_DIR / fname, obj)
            created.append(fname)
        else:
            for csub in customs:
                allowed = frozenset(set(base_allowed) | {csub})
                pngs = ordered_pngs(ann, ex_key, allowed, shots_dir)
                sub_slug = slug(csub)
                if dry_run:
                    print(
                        f"[dry-run] {exam} ex{ex_key} sub={csub!r} -> {len(pngs)} images"
                    )
                    continue
                imgs = [copy_with_unique_name(p, exam_slug, IMG_DIR) for p in pngs]
                fname = f"{exam_slug}__ex{ex_key}__{sub_slug}.json"
                obj = build_exercise_object(
                    imgs,
                    admin_note=(
                        f"Auto-generated from CMS annotations: exam={exam!r}, exercise={ex_key}, "
                        f"variant=sub-exercise {csub!r} (Main + Answer Options + this sub)."
                    ),
                )
                write_json(EXERCISES_DIR / fname, obj)
                created.append(fname)

    return created


def main() -> None:
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
    args = ap.parse_args()

    if not FLATPDFS.is_dir():
        print(f"Expected annotations root {FLATPDFS}", file=sys.stderr)
        sys.exit(1)

    names = args.exams
    if not names:
        names = sorted(d.name for d in FLATPDFS.iterdir() if d.is_dir())

    all_created: list[str] = []
    for exam in names:
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
