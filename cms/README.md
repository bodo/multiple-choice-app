# CMS

Content management scripts for the exercise data in `public/data/exercises/`.

## Setup

Requires [uv](https://docs.astral.sh/uv/getting-started/installation/).

## Scripts

### generate-index

Scans `public/data/exercises/` for `*.json` files and regenerates `index.json`.

Run after adding, removing, or renaming exercise files (from `cms/`):

```bash
uv run python generate_index.py
```
