# Weak spots, Box 0, and local user data

## Purpose

Box 0 interrupts unproductive repetition. A card that repeatedly produces an
incorrect answer is paused in regular training until the learner explicitly
returns it after studying the topic elsewhere. Bookmarks remain a separate,
neutral way to save a card without changing its schedule.

## Lifecycle

An exercise progress record has a Leitner `box` from 1 through 5 and a separate
`learningStatus`:

- `active`: eligible for normal training according to its Leitner weight
- `interventionRequired`: displayed as **Box 0 – Study needed** and excluded
  from normal training

The app enters Box 0 in either of two ways:

1. The learner marks the card manually. This does not create an answer event,
   increment the wrong counter, or change accuracy.
2. The last four answers since the most recent return are all incorrect, and
   the first and fourth occurred no more than 24 hours apart.

The progress record stores `manual` or `repeatedIncorrect` as the reason. On an
automatic transition, auto-advance stops once and the practice page explains
what happened. In exam mode, Box-0 cards remain eligible and newly detected
transitions are applied only after the exam finishes.

Returning a card is always explicit. The operation preserves counters, answer
history, earlier interventions, and statistics; it sets Box 1, records
`lastReturnedAt`, and starts a new four-error period. A bookmark on the same card
is unaffected.

## Visibility

Open interventions are never scoped to the current category, specialization,
or loading source:

- the global navigation shows their total count;
- the practice page shows an in-app reminder;
- `/stats?tab=weakspots` lists every Box-0 record before the analytical ranking;
- cards outside the current question set are labelled instead of hidden;
- a record whose card content is not cached stays visible with an unavailable
  marker.

Bookmark and weak-spot rows resolve their card by canonical exercise ID from all
downloaded Dexie exercise sets. Clicking an available row opens the shared
read-only card dialog. Revealing the answer or explanation in this dialog does
not write an answer event or alter progress.

## IndexedDB tables

Dexie version 10 adds these user-data tables:

| Table | Purpose |
|-------|---------|
| `settings` | Language, theme, mode, source, specialization, and preferences |
| `bookmarks` | Independent saved-card markers by canonical exercise ID |
| `exerciseProgress` | Leitner box, aggregate results, answer log, and Box-0 state |
| `answerEvents` | Append-only local answer events prepared for later synchronization |
| `practiceSessions` | Persisted session aggregates |
| `streaks` | Completed correct-answer streaks |
| `metadata` | Idempotent migration markers |

Exercise caches and current training sessions remain in `exercises` and
`trainingSessions`. Cache keys include source and specialization; user progress
uses the stable canonical exercise ID so switching from JSON files to the future
API does not create a second learning history.

## Legacy import

`migrateLegacyLocalStorage` runs before Vue mounts. It reads the known
`bodo-mc-settings`, `bodo-mc-bookmarks`, `bodo-mc-history`,
`bodo-mc-sessions`, `bodo-mc-streaks`, and legacy `theme` values, validates and
normalizes them, and writes all imported data plus its completion marker in one
Dexie transaction. Only after that transaction succeeds and persistent browser
storage is confirmed are those exact keys removed. If persistence is unavailable
or denied, they remain as a migration fallback. The importer never calls
`localStorage.clear()` and never runs the data import twice.

## API transition

The JSON and API loaders must normalize to the same `Exercise` model and retain
the same canonical IDs. A later synchronization service can send the append-only
answer events with idempotency keys and derive server-side progress without
changing the current pages or the local offline behavior.
