---
name: bible
description: >
  Generate Bible studies, sermon messages, slide-format readings, extended
  chapter studies, structural analyses, and Sabbath School outlines from an
  SDA pioneer perspective. Each output type has a reference file with the
  canonical system prompt and the export-to-Apple-Notes workflow. Use when
  the user asks for new preaching/teaching content, when revising existing
  files, or when working with the SDA pioneer corpus. Triggers on: sermon,
  message, study, reading, Sabbath School, structural analysis, chiasm,
  EGW study, "generate a message/study/reading on X", "revise this file",
  "export to notes".
---

# bible — Content Generation

Generate Bible-study content (messages, studies, readings, structural
analyses, Sabbath School outlines) and keep an Apple-Notes copy in sync via
the `bible` CLI.

## Pick the reference

```
What is the user asking for?
├─ Sermon outline (≤30 min, peak-ending, CTA)            → references/messages.md
├─ Topical Bible study (whiteboard, scannable bullets)   → references/studies.md
├─ Slide deck (slide-by-slide, [IMG] prompts)            → references/readings-slides.md
├─ Extended chapter study (preserve every source verse)  → references/readings-study.md
├─ Structural analysis (chiastic, typological, parallel) → references/analyze.md
└─ Sabbath School week outline (PDF-driven)              → references/sabbath-school.md
```

Each reference contains: when-to-use, source-material commands, the full
system prompt, output shape, frontmatter spec, and the export workflow.

## Topic Index

| File                            | Output type         | Output dir                | Filename pattern     |
| ------------------------------- | ------------------- | ------------------------- | -------------------- |
| `references/messages.md`        | Sermon outline      | `outputs/messages/`       | `YYYY-MM-DD-slug.md` |
| `references/studies.md`         | Topical study       | `outputs/studies/`        | `YYYY-MM-DD-slug.md` |
| `references/readings-slides.md` | Slide deck          | `outputs/readings/`       | `YYYY-MM-DD-slug.md` |
| `references/readings-study.md`  | Chapter study       | `outputs/readings/`       | `chapter-N.md`       |
| `references/analyze.md`         | Structural analysis | `outputs/analyses/`       | `YYYY-MM-DD-slug.md` |
| `references/sabbath-school.md`  | SS week outline     | `outputs/sabbath-school/` | `YYYY-QX-WY.md`      |

`bible` resolves `outputs/` against a build-time-baked CLI root, so commands
work from any cwd.

## Universal workflow (every reference follows this)

1. **Pull source material** via the `bible-cli` skill (verses, EGW, hymns,
   commentary, Strong's). Don't paraphrase from memory.
2. **Generate the content yourself** using the system prompt from the
   reference file — `bible` no longer has any AI generation commands.
3. **Write the file** to `outputs/<type>/<filename>.md` with frontmatter
   (`created_at`, type-specific fields).
4. **Export to Apple Notes**: `bible export -f <file> --folder <type>`.
   Writes `apple_note_id` back into the frontmatter.
5. **Updates**: edit the file in place, then `bible sync -f <file>` (uses
   `apple_note_id` to update the linked note).

| Step               | Command                                                                         |
| ------------------ | ------------------------------------------------------------------------------- |
| Fetch verses       | `bible verse "<ref>" --json`                                                    |
| Fetch EGW          | `bible egw lookup "<refcode>" --json` / `bible egw commentary "<verse>" --json` |
| Fetch hymn         | `bible hymns search "<query>" --json` / `bible hymns get <n> --json`            |
| Fetch Strong's     | `bible concordance H1234 --json`                                                |
| Fetch SS PDFs      | `bible sabbath-school fetch -y 2026 -q 2 -w 5 --json`                           |
| Write file         | `Write` tool to `outputs/<type>/...md`                                          |
| Initial export     | `bible export -f outputs/<type>/<file>.md --folder <type>`                      |
| Update note        | `bible sync -f outputs/<type>/<file>.md`                                        |
| List existing      | `bible <type> list [--json]`                                                    |
| Delete linked note | `bible <type> delete -f <file>`                                                 |

## Apple Notes idempotency contract

Every generated file must have frontmatter. The `apple_note_id` field is
what makes export/sync idempotent:

```yaml
---
created_at: '2026-05-08T14:00:00Z'
topic: 'Choose Ye This Day'
apple_note_id: 'x-coredata://.../ICNote/p1234' # ← written by `bible export`
---
```

- **No `apple_note_id`** → `bible export` creates the note, writes the ID back.
- **Has `apple_note_id`** → `bible sync` updates that exact note.
- **Has `apple_note_id` + you want a fresh note** → `bible export -f <file> --force-create`.

## Anti-patterns

- **Don't generate without first pulling source material** through the
  `bible-cli` skill. The whole point of the toolchain is verse accuracy.
- **Don't paraphrase verses from memory** — quote what `bible verse` returns.
- **Don't paraphrase EGW** — quote `paragraphs[].text` from `bible egw lookup`.
- **Don't invent Strong's numbers or hymn numbers** — look them up.
- **Don't write to disk without frontmatter** — export needs `created_at`
  and uses `apple_note_id` for idempotency.
- **Don't skip the export step** — Cristian uses Apple Notes as the active
  surface. A file on disk that isn't in Notes is invisible.

## Source material defer

For raw text (verses, EGW pages/commentary, Strong's, hymns, SS PDFs), use
the **`bible-cli` skill**. It has the full command surface, `--json` shapes,
anti-patterns, and `--limit` semantics. Don't duplicate that here.
