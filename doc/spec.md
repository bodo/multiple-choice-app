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

- `json`: `public/data/exercises/index.json` lists the JSON files. Each exercise
  gets an `id` derived from its filename (minus `.json`).
- `api`: draft `GET /api/v1/exercises` adapter expecting
  `{ "items": Exercise[] }`. `VITE_EXERCISE_API_URL` overrides `/api/v1`.

Images used by the current JSON source remain in `public/data/img/`.
See [Exercise loading and API migration](exercise-loading.md) for the service
boundary, runtime data flow, draft API response, and remaining migration work.

### Exercise Format

```typescript
interface Exercise {
  id: string                          // Auto-assigned from filename
  inputMode: 'SINGLE_CHOICE' | 'MULTIPLE_CHOICE' | 'TEXT' | 'NUMBER'
  mobileSolvable: boolean             // Small screen, no external tools required
  correct: number | number[] | string // Correct answer(s)
  instruction?: string                // Markdown-rendered question text
  images?: string[]                   // Filenames in /data/img/
  answerOptions?: string[]            // Options for choice-based inputs
  submitButton?: boolean              // Default true; false = auto-submit on select
  caseSensitive?: boolean             // TEXT only; default false
  maximumStringDistance?: number       // TEXT only; auto-calculated if omitted
  adminComment?: string               // Internal notes (not displayed)
  adminTags?: string[]                // Categories for filtering
}
```

## Input Modes

### SINGLE_CHOICE
- Options displayed as buttons in shuffled order
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
- **Word-by-word validation**: splits answer by spaces, checks each word with Levenshtein distance ≤ 1
- **Auto-calculated tolerance** when `maximumStringDistance` is not set:
  - Answer ≤ 3 chars: exact match
  - Answer 4–6 chars: 1 typo allowed
  - Answer 7+ chars: 2 typos allowed
- After submit: correct words in green, wrong words in red strikethrough with correct word in brackets
- **Close match**: if all words pass but not exact, shows warning: "Close! The exact answer is: **X**"
- Supports HTML in close-match message via `v-html`

### NUMBER
- Numeric input with submit button (Enter to submit)
- Exact match required
- Shows strikethrough user answer + correct answer if wrong

## Spaced Repetition

Per-exercise stats stored in localStorage (`bodo-mc-history`):
- Tracks correct/wrong counts and last-seen timestamp per exercise ID

**Weighted selection algorithm** (`getWeight`):
- Never seen → weight 10 (highest priority)
- Seen before → `(1 + errorRate × 9) × (1 + hoursSinceLastSeen / 24)`
- Time decay capped at 168 hours (1 week)
- Current exercise excluded from selection (no immediate repeats)
- Exercises outside active tag filter excluded
- If `mobileSolvableOnly` is enabled, exercises with `mobileSolvable: false` are excluded
- An empty filtered pool shows the existing no-exercises state instead of falling back to an excluded exercise

## Exercise Catalog

Separate module (`useExerciseCatalog`) that builds a tag index from loaded exercises:
- Provides `allTags` (unique sorted tags), `filteredIds` (exercises matching active filter)
- Designed to be swappable with a server-provided index later
- Integrated with exercise flow — tag and mobile filters are combined before weighted selection

## Settings

Stored in localStorage (`bodo-mc-settings`), auto-saved via Vue watchers.
`mobileSolvableOnly` is inferred once when the stored settings are first
created or migrated from an older object without that field. The guess uses
`navigator.userAgentData.mobile` when available; otherwise it requires touch or
a coarse pointer and a shortest screen side of at most 1024 CSS pixels. The
result is stored immediately. The GUI toggle writes the same field, and that
stored manual value is authoritative on later visits.

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `mode` | `'train' \| 'exam'` | `'train'` | Exam mode forces auto-advance |
| `autoAdvance` | boolean | `true` | Auto-advance to next question after answering |
| `timeoutCorrect` | number (ms) | `1500` | Delay after correct answer (500–10000) |
| `timeoutIncorrect` | number (ms) | `3000` | Delay after incorrect answer (500–10000) |
| `soundEnabled` | boolean | `true` | Play sound effects |
| `hapticEnabled` | boolean | `true` | Vibrate on answer (mobile) |
| `language` | string | `'eng'` | `'eng'` or `'deu'` |
| `theme` | string | `'auto'` | `'auto'`, `'abschluss-light'`, `'abschluss-dark'` |
| `exerciseSource` | `'json' \| 'api'` | `'json'` | Active exercise loading service |
| `mobileSolvableOnly` | boolean | One-time device guess | Exclude exercises where `mobileSolvable` is false; manually configurable |

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

## Progress & Stats

- **Progress bar**: "Question X of Y" with percentage, displayed full-width above content
- **Session stats**: accuracy % and average time per answer, shown below progress bar after first answer

## Routing

| Path | Component | Description |
|------|-----------|-------------|
| `/` | MainPage | Exercise practice flow |
| `/settings` | SettingsPage | User preferences |

## i18n

- vue-i18n with `legacy: false`
- Languages: English (`eng`), German (`deu`)
- Locale files in `src/app/locales/`
- Markdown rendering uses `marked` with `breaks: true` (single newlines → `<br>`)

## PWA

- `registerType: 'autoUpdate'` — service worker auto-updates
- `display: 'standalone'` — installable on mobile home screen
- Precaches all built assets for offline use

## Deployment

- CI via Forgejo/GitHub Actions on push to `main`
- Build: `vue-tsc -b && vite build`
- Deploy: rsync to VPS (`/var/www/wiso.abschluss.jetzt/httpdocs/`)
