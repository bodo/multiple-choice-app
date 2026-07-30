# bodo-multiple-choice

A mobile-first multiple-choice practice app built with Vue 3 + TypeScript + Vite.

## Features

- Five input modes: single choice, multiple choice, matching, free text, number
- Markdown rendering in questions and answer options
- Image display with zoom (OpenSeadragon)
- Fuzzy text matching with configurable Levenshtein distance tolerance
- Immediate color-coded feedback (correct / incorrect / missed)
- Auto-advance with configurable delay
- Device-aware filtering for exercises suited to small screens
- Persisted IT-specialization filter
- i18n support (German / English)
- Works offline (PWA)

## Adding Exercises

Exercises are JSON files in `public/data/exercises/`. After adding, removing,
or changing the specializations of a file, regenerate the indexes:

```bash
python3 cms/999_generate_index.py
```

This validates the specialization metadata and writes the complete authoring
index plus `index_fian.json`, `index_fisi.json`, `index_fidp.json`, and
`index_fidv.json`.

### Exercise format

```jsonc
{
  // Required
  "inputMode": "SINGLE_CHOICE" | "MULTIPLE_CHOICE" | "TEXT" | "NUMBER" | "MATCH",
  "mobileSolvable": true, // small screen, no external tools required
  "categories": ["Arbeitsrecht", "Tarifrecht"], // at least one learning category
  "specializations": ["FISI", "FIDV"], // required; all applicable values
  "correct": [3],        // one index (SINGLE_CHOICE), [0,1,4] (MULTIPLE_CHOICE),
                         // ["GmbH", "G.m.b.H."] (TEXT), [250000] (NUMBER),
                         // [2,0,1] match-option indices (MATCH)

  // Optional
  "instruction": "Markdown **supported**",
  "images": ["2012_1.png"],          // filenames from public/data/img/
  "answerOptions": ["A", "B", "C"],  // markdown supported
  "matchOptions": ["1", "2", "3"],   // MATCH right-side labels
  "submitButton": true,              // default true

  // TEXT mode options
  "caseSensitive": false,            // default false
  "maximumStringDistance": 1,        // Levenshtein tolerance per word, default 1

  // Author and review workflow metadata (not shown in UI)
  "adminComment": "...",
  "adminTags": ["needs-review", "error-reported"]
}
```

Images are served from `public/data/img/`.

`correct` is always a non-empty array. `SINGLE_CHOICE` and `NUMBER` contain
exactly one item; the other modes may contain multiple items according to their
mode-specific semantics.

For `TEXT`, `correct` is always a non-empty array. Plain entries are accepted
alternatives and use the existing fuzzy word comparison. The sed-like
`/pattern/flags` delimiters also map directly to JavaScript regular expressions:

```json
{
  "inputMode": "TEXT",
  "correct": [
    "Datenbank",
    "database",
    "/(?:relationale )?Datenbank/u"
  ]
}
```

Regular expressions must match the complete trimmed input and do not use fuzzy
matching. The supported flags are `i` and `u`. Comparisons are
case-insensitive by default; with `caseSensitive: true`, a regular expression
is case-sensitive unless it has the `i` flag. Invalid expressions cause the
exercise to be rejected while loading. Keep at least one plain entry when
possible so the result view can show a learner-friendly reference answer.

`mobileSolvable` indicates that an exercise can be completed comfortably on a
small screen without external tools such as a calculator. It is required for
every exercise and can be maintained in the exercise editor.

`categories` contains one or more learner-facing subject areas. The practice
filter and category statistics use only this list. `adminTags` is optional and
reserved for authoring and review workflow markers.

`specializations` limits a card to one or more IT specializations: `FIAN`,
`FISI`, `FIDP`, or `FIDV`. Multiple values support overlapping content, for
example AP2 network questions for both `FISI` and `FIDV`. Current AP1 cards
explicitly list all four specializations. The list is required and must not be
empty: every applicable specialization is stated explicitly, so adding a new
occupation cannot accidentally expose existing cards to it. The specialization
selected in Settings is stored in `bodo-mc-settings`.
Changing it loads the corresponding specialization index and stores that
question set in a separate Dexie cache for offline use.

### Shared security, privacy, and law set

The bundled shared data includes 100 exercises: 40 AP1 questions on IT
security, 35 AP1 questions on data protection, 16 AP1 questions on IT-specific
law, and 9 WiSo questions on general contract and business law. General
commercial, employment, contract, and company-law questions use `WiSo`; only
software, licensing, cybercrime, and other IT-specific legal topics use
`AP1 / IT-Recht`. Every card explicitly lists all four current IT
specializations.

The content is based on the
[BIBB implementation guide](https://www.bibb.de/dienst/publikationen/de/16661),
[BSI security guidance](https://www.bsi.bund.de/DE/Themen/Unternehmen-und-Organisationen/Informationen-und-Empfehlungen/Empfehlungen-nach-Angriffszielen/Unternehmen-allgemein/10-Tipps-zur-Cyber-Sicherheit-fuer-Unternehmen/10-tipps-zur-cyber-sicherheit-fuer-unternehmen.html),
the [GDPR](https://eur-lex.europa.eu/legal-content/DE/TXT/?uri=CELEX:02016R0679-20160504),
and the current official texts of
[BGB](https://www.gesetze-im-internet.de/bgb/),
[UrhG](https://www.gesetze-im-internet.de/urhg/),
[GeschGehG](https://www.gesetze-im-internet.de/geschgehg/),
[StGB](https://www.gesetze-im-internet.de/stgb/), and
[TDDDG](https://www.gesetze-im-internet.de/ttdsg/).

### Shared AP1 UML set

The bundled data includes 48 shared AP1 UML exercises: 12 each on sequence,
use-case, class, and activity diagrams. They focus on recognizing notation,
purpose, and straightforward interpretations. More advanced object-oriented
design questions remain in FIAN AP2.

This split follows the common first-18-month scope of AP1 described by
[IHK Ulm](https://www.ihk.de/ulm/hauptnavigation/ausbildungsbetriebe-azubis/beratung-und-infos/infos-fuer-ausbildungsbetriebe/pruefungsinhalte-und-ansprechpartner-berufe-a-z-/fachinformatiker-6955832)
and the transition toward UML in the revised IT examination catalog described
by [IHK Hannover](https://www.ihk.de/hannover/hauptnavigation/ausbildung-und-weiterbildung/ausbildung/ausbildung-a-z/neuordnungen/pruefungskataloge-it-berufe-6438900).
The notation follows the
[OMG UML 2.5.1 specification](https://www.omg.org/spec/UML/).

### GoF design-pattern set

The bundled data includes 60 exercises on the 23 Gang-of-Four design patterns:
20 multiple-choice classification exercises, 10 single-choice purpose
descriptions for widely used patterns, 10 matching exercises, and 20 text
exercises. The text set contains 10 purpose descriptions plus 10 open
classification prompts, including all six combinations of purpose and
class-based or object-based scope.

The 39 introductory exercises use `AP1` and explicitly list all four current
IT specializations. The 21 scope and application exercises use `AP2` and
`FIAN`. Pattern names are shown in German followed by English in parentheses.
Text answers accept either language and tolerate an optional `Muster` or
`Pattern` suffix through regular expressions. All cards remain
`mobileSolvable`.

The purpose and scope matrix follows the original
[Gang-of-Four catalog](https://www.informit.com/store/design-patterns-elements-of-reusable-object-oriented-9780321770462).
German terms and concise purpose descriptions follow the
[University of Rostock overview](https://wwwswt.informatik.uni-rostock.de/patterns/index.html).
The Adapter (Adapter) is intentionally accepted in both structural scope
groups because the catalog distinguishes a class adapter from an object
adapter.

## Exercise loading services

The card source can be switched in the app settings:

- **JSON files** loads the specialization-specific index, for example
  `public/data/exercises/index_fian.json`, and then every listed file.
- **Backend API** is a draft adapter for the upcoming backend. It calls
  `GET /api/v1/exercises` and currently expects `{ "items": Exercise[] }`.

Set `VITE_EXERCISE_API_URL` to change the API base URL. The selected service
stores its result in Dexie; the UI reads the active card set from there.
Caches are separated by source and specialization, so downloading a new
specialization does not remove a previously downloaded one. Reconnecting
automatically refreshes the currently selected set. Referenced question images
are downloaded into the PWA's exercise-image cache as part of the refresh.
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

Build the production bundle and serve it locally:

```bash
./scripts/build-serve-deploy.sh build
./scripts/build-serve-deploy.sh serve
```

Preview a production deployment without changing the server:

```bash
./scripts/build-serve-deploy.sh deploy --dry-run
```

An actual deployment first builds the app, checks the document root on `vps3`,
and displays the same `rsync --delete` dry-run. It then requires typing
`deploy`; use `--yes` only in non-interactive automation:

```bash
./scripts/build-serve-deploy.sh deploy
```
