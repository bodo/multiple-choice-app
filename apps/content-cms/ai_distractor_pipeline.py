import argparse
import json
import os
import sys
from pathlib import Path
from typing import Dict, Any, List
import time

from pydantic import BaseModel
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type

EXERCISES_DIR = Path(__file__).parent.parent / "frontend" / "public" / "data" / "exercises"

class DistractorProfile(BaseModel):
    index: str
    distractorType: str
    distractorAnalysis: str

class ExerciseEnrichment(BaseModel):
    distractors: List[DistractorProfile]

SYSTEM_PROMPT = """Du bist ein Experte für pädagogische Diagnostik und Prüfungserstellung im IT-Bereich (Fachinformatiker, Systemelektroniker). 
Deine Aufgabe ist es, für die falschen Antworten (Distraktoren) einer Multiple-Choice-Frage zu analysieren, warum ein Prüfling diese falsch wählen könnte.

Analysiere jeden Distraktor und gib ein JSON-Objekt zurück, das ein Array von `distractors` enthält.
Jedes Element in diesem Array muss den `index` (als String, passend zum Index der Antwortoption), einen `distractorType` (kurzer CamelCase String, offene Taxonomie) und eine `distractorAnalysis` (kurze Erklärung auf Deutsch, ca. 1-2 Sätze) enthalten.
Beispiele für distractorType:
- absoluteStatementTrap (Absolutformulierung wie 'immer'/'nie')
- negationOversight (Übersehen einer Verneinung)
- similarTermConfusion (Verwechslung verwandter Begriffe)
- calculationError (Rechen- oder Umrechnungsfehler)
- conceptContradiction (Widerspruch zum Konzept)
Du kannst beliebig neue, passgenaue Typen erfinden (z.B. portConfusion, subnetBoundaryError).
"""

def generate_user_prompt(exercise_data: dict) -> str:
    question = exercise_data.get("question", "")
    options = exercise_data.get("answerOptions", [])
    correct = exercise_data.get("correct", [])
    
    prompt = f"Frage: {question}\n\nRichtige Antworten (Indizes): {correct}\n\n"
    prompt += "Antwortoptionen:\n"
    for idx, opt in enumerate(options):
        prompt += f"[{idx}]: {opt}\n"
        
    prompt += "\nBitte analysiere alle Antwortoptionen, die NICHT in der Liste der richtigen Antworten stehen (Distraktoren)."
    return prompt

@retry(stop=stop_after_attempt(5), wait=wait_exponential(multiplier=1, min=2, max=30))
def call_openai_sync(exercise_data: dict, api_key: str, model: str) -> ExerciseEnrichment:
    from openai import OpenAI
    client = OpenAI(api_key=api_key)
    
    completion = client.beta.chat.completions.parse(
        model=model,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": generate_user_prompt(exercise_data)},
        ],
        response_format=ExerciseEnrichment,
    )
    return completion.choices[0].message.parsed

@retry(stop=stop_after_attempt(5), wait=wait_exponential(multiplier=1, min=2, max=60))
def call_gemini_sync(exercise_data: dict, api_key: str, model: str) -> ExerciseEnrichment:
    from google import genai
    from google.genai import types
    client = genai.Client(api_key=api_key)
    
    response = client.models.generate_content(
        model=model,
        contents=[SYSTEM_PROMPT, generate_user_prompt(exercise_data)],
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
            response_schema=ExerciseEnrichment,
        ),
    )
    return ExerciseEnrichment.model_validate_json(response.text)

@retry(stop=stop_after_attempt(5), wait=wait_exponential(multiplier=1, min=2, max=30))
def call_anthropic_sync(exercise_data: dict, api_key: str, model: str) -> dict:
    from anthropic import Anthropic
    client = Anthropic(api_key=api_key)
    
    # Anthropic doesn't have a native Pydantic parser, we use tools to force JSON
    response = client.messages.create(
        model=model,
        max_tokens=1000,
        system=SYSTEM_PROMPT,
        messages=[
            {"role": "user", "content": generate_user_prompt(exercise_data)}
        ],
        tools=[
            {
                "name": "provide_distractor_analysis",
                "description": "Provide the distractor analysis results.",
                "input_schema": ExerciseEnrichment.model_json_schema()
            }
        ],
        tool_choice={"type": "tool", "name": "provide_distractor_analysis"}
    )
    
    for block in response.content:
        if block.type == "tool_use":
            return ExerciseEnrichment.model_validate(block.input)
    
    raise ValueError("No tool use found in Anthropic response")


def enrich_exercise_sync(exercise_data: dict, provider: str, model: str, api_key: str = None) -> ExerciseEnrichment:
    if provider == "openai":
        return call_openai_sync(exercise_data, api_key or os.getenv("OPENAI_API_KEY"), model)
    elif provider == "gemini":
        return call_gemini_sync(exercise_data, api_key or os.getenv("GEMINI_API_KEY"), model)
    elif provider == "anthropic":
        return call_anthropic_sync(exercise_data, api_key or os.getenv("ANTHROPIC_API_KEY"), model)
    else:
        raise ValueError(f"Unknown provider {provider}")

def process_file_sync(path: Path, provider: str, model: str):
    data = json.loads(path.read_text(encoding="utf-8"))
    
    input_mode = data.get("inputMode")
    if input_mode not in ("SINGLE_CHOICE", "MULTIPLE_CHOICE"):
        return
        
    print(f"Processing {path.name}...")
    try:
        enrichment = enrich_exercise_sync(data, provider, model)
        
        # Rate limit protection for Gemini free tier (15 RPM)
        if provider == "gemini":
            time.sleep(4.1)
        
        # Apply enrichment
        dist_types = data.get("distractorTypes", {})
        dist_analysis = data.get("distractorAnalysis", {})
        
        for profile in enrichment.distractors:
            dist_types[profile.index] = profile.distractorType
            dist_analysis[profile.index] = profile.distractorAnalysis
            
        data["distractorTypes"] = dist_types
        data["distractorAnalysis"] = dist_analysis
        
        path.write_text(json.dumps(data, ensure_ascii=False, indent=4) + "\n", encoding="utf-8")
        print(f"  -> Successfully enriched {len(enrichment.distractors)} distractors.")
    except Exception as e:
        print(f"  -> Failed: {e}", file=sys.stderr)


def generate_openai_batch(output_file: str, model: str):
    batch_lines = []
    
    for p in EXERCISES_DIR.glob("*.json"):
        if p.name == "index.json" or p.name.startswith("index_"):
            continue
            
        data = json.loads(p.read_text(encoding="utf-8"))
        if data.get("inputMode") not in ("SINGLE_CHOICE", "MULTIPLE_CHOICE"):
            continue
            
        request = {
            "custom_id": p.name,
            "method": "POST",
            "url": "/v1/chat/completions",
            "body": {
                "model": "gpt-4o",
                "messages": [
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": generate_user_prompt(data)},
                ],
                "response_format": {
                    "type": "json_schema",
                    "json_schema": {
                        "name": "ExerciseEnrichment",
                        "schema": ExerciseEnrichment.model_json_schema(),
                        "strict": True
                    }
                }
            }
        }
        batch_lines.append(json.dumps(request))
        
    Path(output_file).write_text("\n".join(batch_lines) + "\n", encoding="utf-8")
    print(f"Generated OpenAI batch file with {len(batch_lines)} requests: {output_file}")


def generate_anthropic_batch(output_file: str, model: str):
    batch_lines = []
    
    for p in EXERCISES_DIR.glob("*.json"):
        if p.name == "index.json" or p.name.startswith("index_"):
            continue
            
        data = json.loads(p.read_text(encoding="utf-8"))
        if data.get("inputMode") not in ("SINGLE_CHOICE", "MULTIPLE_CHOICE"):
            continue
            
        request = {
            "custom_id": p.name,
            "params": {
                "model": model,
                "max_tokens": 1000,
                "system": SYSTEM_PROMPT,
                "messages": [
                    {"role": "user", "content": generate_user_prompt(data)}
                ],
                "tools": [
                    {
                        "name": "provide_distractor_analysis",
                        "description": "Provide the distractor analysis results.",
                        "input_schema": ExerciseEnrichment.model_json_schema()
                    }
                ],
                "tool_choice": {"type": "tool", "name": "provide_distractor_analysis"}
            }
        }
        batch_lines.append(json.dumps(request))
        
    Path(output_file).write_text("\n".join(batch_lines) + "\n", encoding="utf-8")
    print(f"Generated Anthropic batch file with {len(batch_lines)} requests: {output_file}")


def apply_anthropic_batch(result_file: str):
    count = 0
    with open(result_file, "r", encoding="utf-8") as f:
        for line in f:
            if not line.strip(): continue
            res = json.loads(line)
            file_name = res["custom_id"]
            
            # Check if the request was successful
            if res.get("result", {}).get("type") != "succeeded":
                print(f"Error in {file_name}: {res}", file=sys.stderr)
                continue
                
            message = res["result"]["message"]
            
            enrichment = None
            for block in message.get("content", []):
                if block.get("type") == "tool_use":
                    enrichment = ExerciseEnrichment.model_validate(block["input"])
                    break
                    
            if not enrichment:
                print(f"Error in {file_name}: No tool use found in response", file=sys.stderr)
                continue
            
            p = EXERCISES_DIR / file_name
            if p.exists():
                data = json.loads(p.read_text(encoding="utf-8"))
                dist_types = data.get("distractorTypes", {})
                dist_analysis = data.get("distractorAnalysis", {})
                for profile in enrichment.distractors:
                    dist_types[profile.index] = profile.distractorType
                    dist_analysis[profile.index] = profile.distractorAnalysis
                data["distractorTypes"] = dist_types
                data["distractorAnalysis"] = dist_analysis
                p.write_text(json.dumps(data, ensure_ascii=False, indent=4) + "\n", encoding="utf-8")
                count += 1
                
    print(f"Successfully applied {count} results from Anthropic batch file.")


if __name__ == "__main__":
    HELP_EPILOG = """
======================================================================
Ausführliche Workflow-Anleitung für Batch-Modi:
======================================================================

Die Batch-Modi (--mode prepare-batch / apply-batch) erlauben es, hunderte
Aufgaben parallel und zu deutlich günstigeren Preisen (i.d.R. -50%) durch 
die KI-Anbieter analysieren zu lassen.

1. OPENAI WORKFLOW:
-------------------
  Schritt A: Batch-Datei erstellen
      uv run apps/content-cms/ai_distractor_pipeline.py --mode prepare-batch --provider openai --batch-file batch_openai.jsonl
  Schritt B: Batch hochladen und starten
      Gehe zu: https://platform.openai.com/batches
      Lade "batch_openai.jsonl" hoch und wähle den Endpoint "/v1/chat/completions".
  Schritt C: Ergebnisse abholen
      Lade die fertige "batch_output.jsonl" aus dem Dashboard herunter.
  Schritt D: Ergebnisse einspielen
      uv run apps/content-cms/ai_distractor_pipeline.py --mode apply-batch --provider openai --batch-file /pfad/zur/batch_output.jsonl

2. ANTHROPIC WORKFLOW:
----------------------
  Schritt A: Batch-Datei erstellen
      uv run apps/content-cms/ai_distractor_pipeline.py --mode prepare-batch --provider anthropic --batch-file batch_anthropic.jsonl
  Schritt B: Batch hochladen und starten
      Gehe zur Anthropic Console: https://console.anthropic.com/
      (Aktuell funktioniert der Batch-Upload bei Anthropic primär per API. 
       Siehe Doku: https://docs.anthropic.com/en/docs/build-with-claude/message-batches)
  Schritt C: Ergebnisse abholen
      Lade das resultierende JSONL-File herunter.
  Schritt D: Ergebnisse einspielen
      uv run apps/content-cms/ai_distractor_pipeline.py --mode apply-batch --provider anthropic --batch-file /pfad/zur/anthropic_output.jsonl

3. GEMINI WORKFLOW:
-------------------
  Die direkte Generierung von .jsonl-Batch-Dateien wird aktuell für Gemini 
  (Developer API) in diesem Skript noch nicht unterstützt. Nutze hierfür 
  --mode sync für sequentielle Aufrufe.
======================================================================
"""

    parser = argparse.ArgumentParser(
        description="AI Distractor Profiling Pipeline",
        formatter_class=argparse.RawTextHelpFormatter,
        epilog=HELP_EPILOG
    )
    parser.add_argument("--mode", choices=["sync", "prepare-batch", "apply-batch"], required=True, 
                        help="sync: Direkte Live-Abfrage\nprepare-batch: Erzeugt eine JSONL-Datei für den Upload\napply-batch: Trägt die Ergebnisse einer Batch-Verarbeitung in die .json Dateien ein.")
    parser.add_argument("--provider", choices=["openai", "gemini", "anthropic"], default="openai",
                        help="Welcher LLM Provider genutzt werden soll.")
    parser.add_argument("--model", type=str, default="gpt-4o", help="Modell, das verwendet werden soll (z.B. gpt-4o oder claude-3-5-sonnet-20241022)")
    parser.add_argument("--file", help="Spezifische JSON-Datei (nur für --mode sync)", type=str)
    parser.add_argument("--batch-file", help="Eingabe- oder Ausgabedatei für Batch-Modi", default="batch.jsonl")
    
    args = parser.parse_args()
    
    if args.mode == "sync":
        if args.file:
            process_file_sync(Path(args.file), args.provider, args.model)
        else:
            for p in EXERCISES_DIR.glob("*.json"):
                if p.name == "index.json" or p.name.startswith("index_"):
                    continue
                process_file_sync(p, args.provider, args.model)
                
    elif args.mode == "prepare-batch":
        if args.provider == "openai":
            generate_openai_batch(args.batch_file, args.model)
        elif args.provider == "anthropic":
            # Setze ein Default-Modell für Anthropic, falls versehentlich gpt-4o übergeben wird
            model_to_use = "claude-3-5-sonnet-20241022" if args.model == "gpt-4o" else args.model
            generate_anthropic_batch(args.batch_file, model_to_use)
        else:
            print(f"Batch preparation currently not implemented for provider: {args.provider}")
            sys.exit(1)
            
    elif args.mode == "apply-batch":
        if args.provider == "openai":
            apply_openai_batch(args.batch_file)
        elif args.provider == "anthropic":
            apply_anthropic_batch(args.batch_file)
        else:
            print(f"Batch application currently not implemented for provider: {args.provider}")
            sys.exit(1)

