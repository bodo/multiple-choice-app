"""
Generate the complete and specialization-specific exercise indexes.

Usage (from the project root):
    python3 apps/content-cms/999_generate_index.py

Scans for exercise JSON files, validates shared authoring invariants, and writes
index.json plus one index_<specialization>.json per specialization.
"""

import json
import pathlib
from typing import Any

DIR = pathlib.Path(__file__).parent.parent / "frontend" / "public" / "data" / "exercises"
SPECIALIZATIONS = ("FIAN", "FISI", "FIDP", "FIDV")


def is_index_file(path: pathlib.Path) -> bool:
    return path.name == "index.json" or path.name.startswith("index_")


def load_specializations(path: pathlib.Path) -> list[str]:
    value: Any = json.loads(path.read_text())
    if not isinstance(value, dict):
        raise ValueError(f"{path.name}: exercise must be an object")

    correct = value.get("correct")
    if not isinstance(correct, list) or not correct:
        raise ValueError(f"{path.name}: correct must be a non-empty array")

    categories = value.get("categories")
    if (
        not isinstance(categories, list)
        or not categories
        or any(not isinstance(item, str) or not item.strip() for item in categories)
        or len(set(categories)) != len(categories)
    ):
        raise ValueError(f"{path.name}: categories must be a non-empty string array")

    learning_level = value.get("learningLevel")
    if type(learning_level) is not int or not 1 <= learning_level <= 10:
        raise ValueError(f"{path.name}: learningLevel must be an integer from 1 to 10")

    difficulty = value.get("difficulty")
    if type(difficulty) is not int or not 1 <= difficulty <= 5:
        raise ValueError(f"{path.name}: difficulty must be an integer from 1 to 5")

    specializations = value.get("specializations")
    if (
        not isinstance(specializations, list)
        or not specializations
        or any(item not in SPECIALIZATIONS for item in specializations)
        or len(set(specializations)) != len(specializations)
    ):
        raise ValueError(f"{path.name}: invalid specializations")
    return specializations


def write_index(filename: str, exercise_files: list[str]) -> None:
    index_path = DIR / filename
    index_path.write_text(json.dumps(exercise_files, ensure_ascii=False) + "\n")
    print(f"Wrote {len(exercise_files)} entries to {index_path}")


def main() -> None:
    exercise_paths = sorted(
        (
            path
            for path in DIR.glob("*.json")
            if not is_index_file(path)
        ),
        key=lambda path: path.name,
    )
    exercise_specializations = {
        path.name: load_specializations(path)
        for path in exercise_paths
    }
    exercise_files = list(exercise_specializations)

    write_index("index.json", exercise_files)
    for specialization in SPECIALIZATIONS:
        specialized_files = [
            filename
            for filename, values in exercise_specializations.items()
            if specialization in values
        ]
        write_index(
            f"index_{specialization.lower()}.json",
            specialized_files,
        )


if __name__ == "__main__":
    main()
