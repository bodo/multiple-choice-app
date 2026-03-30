---
name: Keep data structures minimal
description: User wants the simplest possible data structure — only what was asked for, no extra metadata fields
type: feedback
---

When designing output data structures, include only the fields explicitly requested. Do not add "helpful" metadata like year, season, type, source, etc. unless asked.

**Why:** User was frustrated when asked for "exam name + files" but received a comprehensive schema with year/season/exam_type fields.

**How to apply:** Before adding a field to a schema or data structure, ask: did the user ask for this? If not, leave it out.
