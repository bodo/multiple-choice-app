import json
import re
from pathlib import Path

EXERCISES_DIR = Path("/Users/bodo/projects/bodo/code-community/apps/multiple-choice-app/apps/frontend/public/data/exercises")

ABSOLUTE_WORDS = re.compile(r"\b(immer|nie|niemals|ausschließlich|generell|vollständig|jegliche|alle)\b", re.IGNORECASE)
NEGATION_WORDS = re.compile(r"\b(nicht|kein|keine|keinen|ohne|weder)\b", re.IGNORECASE)
NUMERICAL = re.compile(r"\b(\d+(\.\d+)?|/2[4-9]|/30|/16)\b")

def classify_distractor(option_text: str, index: int) -> tuple[str, str]:
    if ABSOLUTE_WORDS.search(option_text):
        return (
            "absoluteStatementTrap",
            "Fallstrick durch unzulässige Absolutformulierung (z.B. immer/nie/generell)."
        )
    if NEGATION_WORDS.search(option_text):
        return (
            "negationOversight",
            "Falle durch implizite oder explizite Verneinungselemente im Antworttext."
        )
    if NUMERICAL.search(option_text):
        return (
            "numericalCalculationTrap",
            "Fehlerhafte Zahlenwert-, Bereichs- oder Grenzwertberechnung."
        )
    if len(option_text) > 40:
        return (
            "similarTermConfusion",
            "Verwechslung mit einem inhaltlich verwandten Fachbegriff oder Schema."
        )
    return (
        "conceptContradiction",
        "Widerspruch zur geforderten fachlichen Kernaussage der Aufgabenstellung."
    )

def process_file(path: Path) -> bool:
    if path.name == "index.json" or path.name.startswith("index_"):
        return False

    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        return False

    input_mode = data.get("inputMode")
    if input_mode not in ("SINGLE_CHOICE", "MULTIPLE_CHOICE"):
        return False

    options = data.get("answerOptions")
    correct = data.get("correct")
    if not options or not isinstance(correct, list):
        return False

    correct_set = set(correct)
    dist_types = {}
    dist_analysis = {}

    for idx, opt in enumerate(options):
        if idx in correct_set:
            continue
        dtype, danal = classify_distractor(opt, idx)
        dist_types[str(idx)] = dtype
        dist_analysis[str(idx)] = danal

    if not dist_types:
        return False

    data["distractorTypes"] = dist_types
    data["distractorAnalysis"] = dist_analysis

    path.write_text(json.dumps(data, ensure_ascii=False, indent=4) + "\n", encoding="utf-8")
    return True

def main():
    count = 0
    for p in EXERCISES_DIR.glob("*.json"):
        if process_file(p):
            count += 1
    print(f"Successfully enriched {count} exercise files with distractorTypes and distractorAnalysis.")

if __name__ == "__main__":
    main()
