# bodo-multiple-choice

A mobile-first multiple-choice practice app built with Vue 3 + TypeScript + Vite.

## Features

- Four input modes: single choice, multiple choice, free text, number
- Markdown rendering in questions and answer options
- Image display with zoom (OpenSeadragon)
- Fuzzy text matching with configurable Levenshtein distance tolerance
- Immediate color-coded feedback (correct / incorrect / missed)
- Auto-advance with configurable delay
- Device-aware filtering for exercises suited to small screens
- i18n support (German / English)
- Works offline (PWA)

## Adding Exercises

Exercises are JSON files in `public/data/exercises/`. After adding or removing files, regenerate the index:

```bash
cd public/data/exercises
python _generate_index.py
```

This scans for all `*.json` files in the folder (excluding `index.json` itself) and rewrites `index.json`.

### Exercise format

```jsonc
{
  // Required
  "inputMode": "SINGLE_CHOICE" | "MULTIPLE_CHOICE" | "TEXT" | "NUMBER",
  "mobileSolvable": true, // small screen, no external tools required
  "correct": 3,          // index (SINGLE_CHOICE), [0,1,4] (MULTIPLE_CHOICE),
                         // "GmbH" (TEXT), 250000 (NUMBER)

  // Optional
  "instruction": "Markdown **supported**",
  "images": ["2012_1.png"],          // filenames from public/data/img/
  "answerOptions": ["A", "B", "C"],  // markdown supported
  "submitButton": true,              // default true

  // TEXT mode options
  "caseSensitive": false,            // default false
  "maximumStringDistance": 0,        // Levenshtein tolerance, default 0

  // Admin metadata (not shown in UI)
  "adminComment": "...",
  "adminTags": ["tag1"]
}
```

Images are served from `public/data/img/`.

`mobileSolvable` indicates that an exercise can be completed comfortably on a
small screen without external tools such as a calculator. It is required for
every exercise and can be maintained in the exercise editor.

## Exercise loading services

The card source can be switched in the app settings:

- **JSON files** loads `public/data/exercises/index.json` and then each listed file.
- **Backend API** is a draft adapter for the upcoming backend. It calls
  `GET /api/v1/exercises` and currently expects `{ "items": Exercise[] }`.

Set `VITE_EXERCISE_API_URL` to change the API base URL. The selected service
stores its result in Dexie; the UI reads the active card set from there.
The complete data flow, draft API contract, and migration checklist are
documented in [`doc/exercise-loading.md`](doc/exercise-loading.md).

## Mobile exercise selection

The `mobileSolvableOnly` setting controls whether exercises with
`mobileSolvable: false` are excluded from the question pool.

When `bodo-mc-settings` is first created, or an older stored object does not yet
contain this setting, the app makes a one-time device guess:

1. Use `navigator.userAgentData.mobile` when the browser provides it.
2. Otherwise, treat a touch or coarse-pointer device whose shortest screen side
   is at most 1024 CSS pixels as mobile.

The result is written to localStorage immediately. The toggle under **Settings →
Mobile-solvable exercises only** changes that stored value and is authoritative
on subsequent visits; the device guess is not reapplied.

## Development

```bash
npm install
npm run dev
```

```bash
npm run build
npm run preview
```
