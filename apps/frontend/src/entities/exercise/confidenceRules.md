# Developer Documentation - Confidence Rating & Metacognitive Analysis Rules

This document specifies the internal algorithm, decision matrix, box progression rules, session re-queuing distances, and metacognitive data telemetry for Confidence-Based Answer Submission ("bin sicher", "bin unsicher", "weiß gar nicht").

---

## 1. Decision & Progression Matrix

When `hideOptionsInitially` is enabled, users submit answers with a self-assessed Confidence level:
- `high` ("bin sicher"): Strong belief in the chosen answer.
- `medium` ("bin unsicher"): Uncertainty, partial guess, or process of elimination.
- `none` ("weiß gar nicht"): Admitted lack of knowledge (selectable even without choosing an option).

| Confidence | Outcome | Leitner Box Action | Session Re-Queue Gap | Auto-Advance | Metacognitive Signal |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **`high` ("bin sicher")** | `correct` | **+1 Box** (up to Box 5) | Completed for session | Enabled | `calibrated` |
| **`high` ("bin sicher")** | `incorrect` | **Reset to Box 1** | **5–7 cards** | **Disabled** (Forces explanation review) | `overconfident` (Misconception signal) |
| **`medium` ("bin unsicher")** | `correct` | **Caps at current box (max Box 2)** | **8–10 cards** | Enabled | `underconfident` (Lucky guess / Hesitation) |
| **`medium` ("bin unsicher")** | `incorrect` | **Reset to Box 1** | **5 cards** | Enabled | `calibrated` |
| **`none` ("weiß gar nicht")** | `incorrect` | **Reset to Box 1** (Not Box 0) | **3–5 cards** | **Disabled** (Forces explanation review) | `calibrated` |

---

## 2. Metacognitive Telemetry Signals & Self-Tagging

Each `StoredAnswerEvent` stores the following metrics for diagnostic reports:
- `confidence`: `'high' | 'medium' | 'none'`
- `durationMs`: Total duration taken to answer the question in milliseconds.
- `timeToRevealMs`: Duration spent attempting unassisted active recall before revealing options.
- `timeToSubmitMs`: Duration spent selecting options after reveal.
- `timeOnExplanationMs`: Duration spent reading solution feedback before advancing.
- `optionChangeCount`: Number of option toggles/swaps prior to submission.
- `firstSelectedIdx`: Index of the option initially selected by the learner.
- `finalSelectedIdx`: Index of the option submitted.
- `errorSelfTag`: Optional self-assessment when an answer is incorrect or submitted with `none` confidence:
  - `knowledgeGap`: Learner did not know the concept/fact.
  - `careless`: Learner misread the question or made a hasty oversight.
  - `confusion`: Learner confused two related concepts.
- `metacognitiveState`:
  - `overconfident`: High confidence on an incorrect answer. Indicates a deep misconception that requires instructional intervention.
  - `underconfident`: Medium confidence on a correct answer. Indicates hesitation or reliance on elimination.
  - `calibrated`: Confidence matches actual outcome.

---

## 3. XP & Incentives

To prevent XP farming:
- Base XP and streak rules depend **solely on answer correctness** (`correct`, `partial`, `incorrect`).
- `high` vs `medium` confidence produces **identical XP**. No extra XP bonus is granted for choosing "bin sicher".

---

## 4. Extensible Distractor Taxonomy & Architectural Contract

The set of `distractorTypes` is **NOT closed or finite**. It represents an **open, extensible taxonomy** (`Record<number, string>`) that evolves as new subject domains, vocational specializations, and AI content ingestion pipelines are added.

### Core Vocabulary (Non-exhaustive):
- `similarTermConfusion`: Verwechslung mit inhaltlich verwandten Fachbegriffen.
- `negationOversight`: Übersehen oder Falschdeuten von Verneinungen ("nicht", "kein").
- `absoluteStatementTrap`: Fallstrick durch Absolutausdrücke ("immer", "nie", "generell").
- `conceptContradiction`: Widerspruch zur geforderten fachlichen Kernaussage.
- `exceptionRuleTrap`: Ausnahmeregelung fälschlicherweise auf den Grundfall angewandt.
- `numericalCalculationTrap`: Rechen- oder Grenzwertfehler (z.B. Subnet-Masken).
- `offByOneError`: Grenzfallfehler um genau 1 Einheit.

### System Contract Across Layers:
1. **JSON Schema & OpenAPI**: Must type `distractorTypes` as an open string map (`additionalProperties: { type: string }`). Hardcoded enums are strictly forbidden.
2. **Frontend & Telemetry**: Must safely pass through any arbitrary string identifier without validation errors.
3. **Backend & DB**: Storage columns (`distractorTypes`, `distractorAnalysis`) use flexible `JSON` columns.
4. **CMS Editor (`exercise_editor.py`)**: Must allow free-text input for novel distractor types.
5. **Fallback Safety**: If `distractorTypes` is omitted, all layers must fall back gracefully without breaking rendering or Leitner progression.
