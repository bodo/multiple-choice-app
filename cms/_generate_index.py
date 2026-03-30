"""
Generate index.json listing all exercise files in public/data/exercises/.

Usage (from cms/):
    uv run generate-index

Scans for *.json files (excluding index.json itself), sorts them, and writes
the resulting list to index.json.
"""

import json
import pathlib

DIR = pathlib.Path(__file__).parent.parent / "public" / "data" / "exercises"


def main() -> None:
    exercise_files = sorted(
        p.name
        for p in DIR.glob("*.json")
        if p.name != "index.json"
    )

    index_path = DIR / "index.json"
    index_path.write_text(json.dumps(exercise_files, ensure_ascii=False) + "\n")

    print(f"Wrote {len(exercise_files)} entries to {index_path}")
    for name in exercise_files:
        print(f"  {name}")


if __name__ == "__main__":
    main()
