# bodo-multiple-choice

A mobile-first multiple-choice practice app built with Vue 3 + TypeScript + Vite.

## Features

- Four input modes: single choice, multiple choice, free text, number
- Markdown rendering in questions and answer options
- Image display with zoom (OpenSeadragon)
- Fuzzy text matching with configurable Levenshtein distance tolerance
- Immediate color-coded feedback (correct / incorrect / missed)
- Auto-advance with configurable delay
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

## Development

```bash
npm install
npm run dev
```

```bash
npm run build
npm run preview
```
