"""
Groups PDFs in processed_data/flat_pdfs/ by exam session using Ollama (qwen3.5:4b).

Strategy:
1. Programmatic pre-clustering by filename prefix (regex) → small groups
2. LLM assigns a human-readable name to each batch (structured JSON output)
3. Validate all files assigned; write processed_data/exam_groups.json

Output: [{"name": "1999 Sommer WiSo", "files": [...]}, ...]

Usage (from cms/):
    uv run python 002_group_pdfs_by_exam.py
"""

import json
import re
import sys
from collections import defaultdict
from pathlib import Path

import ollama
from pydantic import BaseModel

FLAT_PDFS = Path(__file__).parent / "processed_data" / "flat_pdfs"
OUTPUT    = Path(__file__).parent / "processed_data" / "exam_groups.json"
MODEL     = "qwen3.5:4b"
BATCH     = 15  # clusters per LLM call

# ---------------------------------------------------------------------------
# Pydantic schema — keeps it minimal
# ---------------------------------------------------------------------------

class ExamGroup(BaseModel):
    name:  str
    files: list[str]

class ExamGroupList(BaseModel):
    groups: list[ExamGroup]

# ---------------------------------------------------------------------------
# Step 1: cluster by filename prefix
# ---------------------------------------------------------------------------

PREFIX_RE = re.compile(
    r"^("
    r"\d{4}_\d{2} (?:Winter|Sommer|Herbst|Frühjahr)"   # "2000_01 Winter"
    r"|\d{4} (?:Winter|Sommer|Herbst|Frühjahr)"         # "2002 Sommer"
    r"|\d{4}_(?:Winter|Sommer|Herbst|Frühjahr)"         # "1999_Sommer"
    r"|\d{4}(?=_)"                                       # "2007_…"
    r"|\d{4}"                                            # bare year
    r")"
)

def cluster_by_prefix(filenames: list[str]) -> dict[str, list[str]]:
    groups: dict[str, list[str]] = defaultdict(list)
    for f in filenames:
        m = PREFIX_RE.match(f)
        groups[m.group(1) if m else "root"].append(f)
    return dict(groups)

# ---------------------------------------------------------------------------
# Step 2: LLM labels each batch
# ---------------------------------------------------------------------------

SYSTEM = """\
You receive groups of German IHK exam PDF filenames.
Return a JSON object {"groups": [...]} where each element has:
  "name":  short human-readable exam name, e.g. "1999 Sommer WiSo"
  "files": the exact filenames for that group (copy verbatim)

You may merge groups that belong to the same exam sitting.
Never drop or invent filenames.
"""

def label_batch(client: ollama.Client, batch: list[tuple[str, list[str]]], n: int, total: int) -> list[ExamGroup]:
    lines = []
    for prefix, files in batch:
        lines.append(f"group {prefix!r}:")
        lines.extend(f"  {f}" for f in files)

    print(f"  [batch {n}/{total}] {len(batch)} groups...", end=" ", flush=True)

    response = client.chat(
        model=MODEL,
        messages=[
            {"role": "system", "content": SYSTEM},
            {"role": "user",   "content": "\n".join(lines)},
        ],
        format=ExamGroupList.model_json_schema(),
        think=False,                    # required: thinking + structured output = empty content bug
        options={"temperature": 0},
    )

    try:
        content = re.sub(r"^```[a-z]*\n?|\n?```$", "", response.message.content.strip())
        result = ExamGroupList.model_validate_json(content)
        print(f"{len(result.groups)} exams")
        return result.groups
    except Exception as e:
        print(f"parse error: {e!r}")
        print(f"  raw response: {response.message.content[:200]!r}")
        # fallback: one group per prefix, unlabelled
        return [ExamGroup(name=prefix, files=files) for prefix, files in batch]

# ---------------------------------------------------------------------------
# Validation
# ---------------------------------------------------------------------------

def validate(groups: list[ExamGroup], all_files: set[str]) -> list[str]:
    issues, seen = [], set()
    for g in groups:
        for f in g.files:
            if f not in all_files:
                issues.append(f"[{g.name}] unknown file: {f}")
            elif f in seen:
                issues.append(f"[{g.name}] duplicate: {f}")
            seen.add(f)
    for f in sorted(all_files - seen):
        issues.append(f"unassigned: {f}")
    return issues

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    filenames = sorted(p.name for p in FLAT_PDFS.glob("*.pdf"))
    if not filenames:
        print("No PDFs found in processed_data/flat_pdfs/")
        sys.exit(1)

    print(f"Found {len(filenames)} PDFs.")

    clusters = cluster_by_prefix(filenames)
    print(f"Pre-clustered into {len(clusters)} groups.\n")

    client = ollama.Client()
    items  = list(clusters.items())
    batches = [items[i : i + BATCH] for i in range(0, len(items), BATCH)]

    all_groups: list[ExamGroup] = []
    for i, batch in enumerate(batches, 1):
        all_groups.extend(label_batch(client, batch, i, len(batches)))

    issues = validate(all_groups, set(filenames))
    if issues:
        print(f"\n{len(issues)} validation issue(s):")
        for issue in issues:
            print(f"  {issue}")
    else:
        print(f"\nAll {len(filenames)} files across {len(all_groups)} exams. ✓")

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(
        json.dumps([g.model_dump() for g in all_groups], ensure_ascii=False, indent=2) + "\n"
    )
    print(f"Wrote → {OUTPUT}")


if __name__ == "__main__":
    main()
