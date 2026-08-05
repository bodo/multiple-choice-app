# Multiple Choice Practice App — Specification

A Vue 3 + TypeScript practice app with spaced repetition, optimized for mobile landscape.

## Tech Stack

- **Framework**: Vue 3.5, TypeScript 5.9, Vite 8
- **Styling**: Tailwind CSS 4 + DaisyUI 5 + `@abschluss/theme`
- **Libraries**: vue-i18n, vue-router, marked (markdown), OpenSeadragon (image zoom), fastest-levenshtein (typo tolerance)
- **PWA**: vite-plugin-pwa with auto-update and offline caching

## Layout

- **Mobile landscape**: Two columns — question left (50%), answer right (50%)
- **Desktop / portrait**: Progress bar full width on top, question and answer side-by-side below
- All interaction elements positioned at the right edge for thumb-friendly access

## Exercise Data

Dexie is the runtime source of truth for exercises. A selected loading service
refreshes its exercise set in Dexie:

- `json`: one of `index_fian.json`, `index_fisi.json`, `index_fidp.json`, or
  `index_fidv.json` lists the files for the selected specialization. Each
  exercise gets an `id` derived from its filename (minus `.json`).
- `api`: draft `GET /api/v1/exercises` adapter expecting
  `{ "items": Exercise[] }`. `VITE_EXERCISE_API_URL` overrides `/api/v1`.

Images used by the current JSON source remain in `public/data/img/`.
See [Exercise loading and API migration](exercise-loading.md) for the service
boundary, runtime data flow, draft API response, and remaining migration work.

The local session, partial-answer, streak, XP, motivation, and rhythm rules
are specified in [Learning, session, streak, XP, and motivation
logic](learning-session-xp-spec.md). The private daily award documented there
remains backend-only and is not part of the current runtime behavior.

### Exercise Format

```typescript
interface Exercise {
  id: string                          // Auto-assigned from filename
  inputMode: 'SINGLE_CHOICE' | 'MULTIPLE_CHOICE' | 'TEXT' | 'NUMBER' | 'MATCH'
  mobileSolvable: boolean             // Small screen, no external tools required
  learningLevel: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10
                                       // Curriculum stage and maximum filter
  difficulty: 1 | 2 | 3 | 4 | 5      // Intrinsic card difficulty for XP
  categories: string[]                // At least one learner-facing subject area
  specializations: Array<'FIAN' | 'FISI' | 'FIDP' | 'FIDV'>
                                       // Required, non-empty positive list
  correct: number[] | string[]          // Always a non-empty array
  instruction?: string                // Markdown-rendered question text
  images?: string[]                   // Filenames in /data/img/
  answerOptions?: string[]            // Options for choice-based inputs
  matchOptions?: string[]             // Right-side labels for MATCH
  submitButton?: boolean              // Default true; false = auto-submit on select
  caseSensitive?: boolean             // TEXT only; default false
  maximumStringDistance?: number       // TEXT only; per-word, default 1
  adminComment?: string               // Internal notes (not displayed)
  adminTags?: string[]                // Authoring and review workflow markers
}
```

## Input Modes

### SINGLE_CHOICE
- Options displayed as buttons in shuffled order
- `correct` contains exactly one option index
- Keyboard shortcuts: number keys 1–N to select, Enter/Space to submit
- If `submitButton: false`, submits immediately on selection
- After submit: ✓ green for correct+selected, ✗ red for wrong+selected or correct+missed
- Wrong selections and missed correct answers blink 3 times

### MULTIPLE_CHOICE
- Checkboxes with card-style options in shuffled order
- Keyboard shortcuts: number keys toggle, Enter submits
- Always has a submit button
- Same visual feedback as single choice (per-option ✓/✗ with blink)

### TEXT
- Text input with submit button (Enter to submit)
- `correct` is a non-empty `string[]`; any entry may accept the answer
- Plain entries use word-by-word Levenshtein comparison. The default maximum
  distance is 1 per word and can be changed with `maximumStringDistance`
- A plain answer that passes fuzzy comparison but is not equal is marked as a
  close match
- `/pattern/flags` entries are native JavaScript regular expressions. They
  match the complete trimmed input, bypass fuzzy matching, and support only
  the `i` and `u` flags
- `caseSensitive` applies to plain entries and regular expressions. When it is
  `false` or omitted, the matcher adds the `i` flag to regular expressions
- Invalid expressions are rejected by the exercise loading service
- The result view lists all plain accepted variants. If a card has only
  regular expressions, it lists those patterns instead

### NUMBER
- Numeric input with submit button (Enter to submit)
- `correct` contains exactly one number
- Exact match required
- Shows strikethrough user answer + correct answer if wrong

### MATCH
- Every `answerOptions[i]` receives exactly one selection from `matchOptions`
- `correct[i]` stores the index of the matching right-side option
- Both option lists must have the same length; `correct` must be a permutation
  containing every match-option index exactly once
- The submit button remains disabled until every row has a unique assignment
- After submission, each row shows the selected assignment and, when wrong,
  the correct assignment

## Spaced Repetition

Per-exercise progress is stored in Dexie by stable exercise ID. It tracks full,
partial, and incorrect answers, last-seen timestamp, a 20-entry recent answer
log, average answer time, Leitner box, and the explicit learning status.

**Weighted selection algorithm** (`getWeight`):
- Never seen → weight 10 (highest priority)
- Box 1 → weight 5–10 according to lifetime error rate
- Box 2 → due after 4 hours
- Box 3 → due after 24 hours
- Box 4 → due after 72 hours
- Box 5 → due after 168 hours
- Overdue cards gain weight up to 10; cards not yet due keep weight 0.1
- Current exercise excluded from selection (no immediate repeats)
- Exercises outside the active category filter are excluded
- Exercises without the selected IT specialization are excluded. Every card
  must list at least one specialization explicitly; multiple values allow
  overlaps such as AP2 network content for both FISI and FIDV
- If `mobileSolvableOnly` is enabled, exercises with `mobileSolvable: false` are excluded
- Box-0 cards are excluded from training but remain eligible in exam mode
- An empty filtered pool shows the existing no-exercises state instead of falling back to an excluded exercise

### Box 0 and manual weak spots

- Four consecutive fully incorrect answers whose first and fourth attempts are
  at most 24 hours apart change `learningStatus` to `interventionRequired`.
  A partially correct answer resets this failure sequence but leaves its box
  unchanged.
- Learners can set the same status manually without recording an incorrect answer
- The reason distinguishes `manual` from `repeatedIncorrect`
- A global badge and an in-practice alert keep every open weak spot visible
- The Box-0 list is not limited to the ten-card analytical weak-spot ranking
- Returning a card is explicit, preserves its full history, resets only the
  current failure period, and places the card in Box 1
- Exam mode does not exclude Box-0 cards and applies newly detected Box-0
  transitions only after the exam finishes
- Fully incorrect answers award no XP. Partially and fully correct answers only
  earn the not-yet-credited share of their daily card value, preventing
  accumulation through repeated guessing.

Bookmarks are a separate, neutral marker and never change scheduling. Bookmark
and weak-spot lists resolve card data from all downloaded Dexie exercise sets,
so switching specialization or source does not hide their entries. Their shared
modal is read-only and does not create answer or progress events.

## Exercise Catalog

Separate module (`useExerciseCatalog`) that builds a category index from loaded exercises:
- Builds its learner-facing index exclusively from `categories`; `adminTags` are ignored
- Specialization metadata is deliberately separate and does not become a
  learner-facing category or distort category statistics
- Provides `allCategories` (unique sorted categories) and `categoryFilteredIds`
- Designed to be swappable with a server-provided index later
- Integrated with exercise flow — category and mobile filters are combined before weighted selection

## Settings

Stored in the Dexie `settings` table and auto-saved via Vue watchers.
`mobileSolvableOnly` is inferred once when no stored setting exists. The guess uses
`navigator.userAgentData.mobile` when available; otherwise it requires touch or
a coarse pointer and a shortest screen side of at most 1024 CSS pixels. The
result is stored immediately. The GUI toggle writes the same field, and that
stored manual value is authoritative on later visits.

`specialization` is an explicit MVP choice in Settings and is never inferred
from the device. Existing settings without the field default once to `FIAN` and
the saved manual choice is then authoritative. The backend may provide this
user preference later without changing exercise-category semantics.
Current AP1 exercises explicitly list all four specializations. Changing the
selection loads its own index and uses a source-and-specialization Dexie cache,
so previously downloaded sets remain available offline.

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `mode` | `'train' \| 'exam'` | `'train'` | Exam mode forces auto-advance |
| `autoAdvance` | boolean | `false` | Auto-advance to next question after answering |
| `timeoutCorrect` | number (ms) | `10000` | Delay after correct answer (500–20000) |
| `timeoutIncorrect` | number (ms) | `20000` | Delay after incorrect answer (500–20000) |
| `soundEnabled` | boolean | `false` | Play sound effects |
| `hapticEnabled` | boolean | `true` | Vibrate on answer (mobile) |
| `examQuestionCount` | number | `10` | Number of questions selected for an exam |
| `language` | string | `'eng'` | `'eng'` or `'deu'` |
| `theme` | string | `'auto'` | `'auto'`, `'abschluss-light'`, `'abschluss-dark'` |
| `exerciseSource` | `'json' \| 'api'` | `'json'` | Active exercise loading service |
| `mobileSolvableOnly` | boolean | One-time device guess | Exclude exercises where `mobileSolvable` is false; manually configurable |
| `specialization` | `'FIAN' \| 'FISI' \| 'FIDP' \| 'FIDV'` | `'FIAN'` | Include cards explicitly assigned to the selected IT specialization |
| `learningLevel` | integer 1–10 | `1` | Inclusive curriculum maximum used by training, exam mode, and statistics |
| `automaticLevelProgression` | boolean | `true` | Raise the maximum after the current level meets its practice thresholds |

## Sound & Haptics

- **Sound effects** via Web Audio API (no external files):
  - Correct: ascending sine tones (C5→E5→G5→C6), 30% volume
  - Incorrect: descending sawtooth buzz (F4→C4→G3), 20% volume
- **Haptic feedback** via Vibration API:
  - Correct: single 100ms pulse
  - Incorrect: double pulse (100ms–50ms pause–100ms)
  - Silent no-op on unsupported devices

## Accessibility

- **aria-live** region announces correct/incorrect results to screen readers
- **Keyboard navigation**: number keys for options, Enter/Space to submit/advance, Escape to advance
- **Focus management**: auto-focus on text/number inputs with `requestAnimationFrame`
- **Reduced motion**: `prefers-reduced-motion` media query disables all animations/transitions
- **Touch**: swipe left to advance after submitting

## Learning levels, progress & stats

- Learning level is separate from intrinsic card difficulty and Leitner mastery.
- Training applies category, specialization, device, weak-spot, and maximum-level
  filters together. It prefers current-level cards for 60% of draws and lower
  prerequisites for 40%, then applies Leitner weighting.
- Adaptive progression requires 20% of the current-level pool (minimum 5,
  maximum 20 distinct cards), at least 80% recent training accuracy, and at
  least 60% of attempted cards in Box 2 or higher. It only raises levels.
- Exam mode selects without replacement. Levels 1–4 use the AP1 category;
  levels 5–10 use AP2 plus WiSo, so AP2 cannot crowd AP1 preparation.
- **Training progress bar**: 30 distinct correct cards per local day, carried
  across sessions, with separate counts for the source Leitner Boxes 1–5.
- **Exam progress bar**: current exam question versus the eligible exam total.
- The statistics page applies the same inclusive maximum-level subset.
- Difficulty-weighted basis XP use `1, 2, 3, 5, 8` for difficulties 1–5, plus
  one point for Boxes 2–5. The session bonus, momentum-XP decay and rhythm
  metrics are defined in the linked learning-system specification.
- **Session stats**: accuracy %, average answer time and an answer series are
  shown below the progress bar after the first answer.

## Routing

| Path | Component | Description |
|------|-----------|-------------|
| `/` | MainPage | Exercise practice flow |
| `/stats` | StatsPage | Score card, Box 0, weak spots, and mastery |
| `/bookmarks` | BookmarksPage | Persisted bookmark list and card preview |
| `/settings` | SettingsPage | User preferences |
| `/help` | HelpPage | Localized learner help and usage guidance |

## i18n

- vue-i18n with `legacy: false`
- Languages: English (`eng`), German (`deu`)
- Locale files in `src/app/locales/`
- Markdown rendering uses `marked` with `breaks: true` (single newlines → `<br>`)

## PWA

- `registerType: 'autoUpdate'` — service worker auto-updates
- `display: 'standalone'` — installable on mobile home screen
- Precaches all built assets for offline use
- `navigator.onLine` and the `online`/`offline` events trigger offline fallback
  and refresh after reconnecting; failed requests still fall back to Dexie
- `navigator.connection.type` distinguishes Wi-Fi, cellular, and Ethernet only
  in supporting browsers; the UI reports an unavailable type elsewhere
- Referenced exercise images are downloaded during a successful question-set
  refresh and served cache-first from the `exercise-images` runtime cache

## Deployment

- CI via Forgejo/GitHub Actions on push to `main`
- Build: `vue-tsc -b && vite build`
- Deploy: rsync to VPS (`/var/www/wiso.abschluss.jetzt/httpdocs/`)
