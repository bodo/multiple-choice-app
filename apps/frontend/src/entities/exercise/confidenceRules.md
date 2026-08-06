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
