---
name: bible-cli
description: >
  Use the `bible` CLI (this repo) to pull source material when generating Bible
  studies, sermon messages, readings, or Sabbath School outlines. Provides
  Bible verses (KJV), Strong's concordance, EGW writings, EGW Bible Commentary,
  SDA Hymnal, and Sabbath School lesson PDFs. Use when an agent needs raw
  source data to feed into a generation pipeline. Triggers on: bible verse,
  EGW reference, sabbath school PDF, hymn lookup, Strong's number, commentary
  on a verse, prompt registry inspection.
---

# bible-cli — Agent Source-Material CLI

Pull verses, EGW writings, hymns, commentary, and Sabbath School PDFs into
your generation pipeline. Every read-side command supports `--json` for
machine consumption.

## Quick Reference

| Goal                                  | Command                                               |
| ------------------------------------- | ----------------------------------------------------- |
| Fetch a verse / chapter / book        | `bible verse <ref> --json`                            |
| Text-search the Bible                 | `bible verse "<query>" --json`                        |
| Strong's lookup (definition + verses) | `bible concordance H<n> --json`                       |
| Search Strong's by English word       | `bible concordance <word> --json`                     |
| EGW lookup by refcode                 | `bible egw lookup "<CODE n.n>" --json`                |
| EGW commentary on a verse             | `bible egw commentary "<book ch:vv>" --json`          |
| EGW local FTS search                  | `bible egw search "<query>" --json`                   |
| EGW remote API search                 | `bible egw search "<query>" --remote --json`          |
| EGW catalog (remote)                  | `bible egw catalog --search "<term>" --json`          |
| List installed EGW books              | `bible egw books --json`                              |
| Hymn full text                        | `bible hymns get <number> --json`                     |
| Hymn search                           | `bible hymns search "<query>" --json`                 |
| Hymn categories                       | `bible hymns categories`                              |
| Sabbath School PDFs                   | `bible sabbath-school fetch -y 2026 -q 2 -w 5 --json` |
| List system prompts                   | `bible prompts list --json`                           |
| Get a system prompt                   | `bible prompts get <name>`                            |

stdout is data (JSON when `--json`), stderr is human messaging.

## Typical Agent Flow

You're building a study/message/reading. Pull source material in this order:

1. **Get the prompt registry** — see what generation prompts already exist:
   ```bash
   bible prompts list --json
   ```
2. **Fetch a system prompt** if you want to reuse the project's house style:
   ```bash
   bible prompts get studies/generate
   ```
3. **Pull the Bible passage** in JSON:
   ```bash
   bible verse "daniel 9:24-27" --json
   ```
4. **Pull EGW commentary** on key verses:
   ```bash
   bible egw commentary "daniel 9:24" --json
   ```
5. **Pull EGW refcode passages** cited by the topic:
   ```bash
   bible egw lookup "PP 351.1" --json
   bible egw lookup "GC 419-422" --json
   ```
6. **Pull Strong's** for keywords you're studying:
   ```bash
   bible concordance H2451 --json    # ḥākmâ — wisdom
   bible concordance G26 --json       # agapē — love
   ```
7. **Pull a hymn** for a closing call/altar moment:
   ```bash
   bible hymns search "amazing grace" --json
   bible hymns get 108 --json
   ```
8. **For Sabbath School week prep**, fetch the Teachers + EGW Notes PDFs:
   ```bash
   bible sabbath-school fetch -y 2026 -q 2 -w 5 --json
   ```
   Then feed `lessonPdf` and `egwPdf` paths to the pipeline.

Compose results into the user's request. Don't generate first and then
"verify" — pull source first, then generate, citing the actual data.

## Command Details

### `bible verse <ref|query> [--json]`

Reference forms (parsed by `parseBibleQuery`):

- `john 3:16` — single verse
- `john 3` — full chapter
- `john 3:16-18` — verse range
- `john 3-5` — chapter range
- `ruth` — full book
- `"faith"` (no chapter token) — falls back to FTS over the KJV

JSON shape:

```json
{
  "mode": "reference" | "search",
  "query": "<input>",
  "verses": [{ "book_name", "book", "chapter", "verse", "text" }]
}
```

### `bible concordance <Strong's|word> [--json]`

Detection: matches `^[HhGg]\d+$` → direct Strong's lookup; else definition
search.

Direct lookup JSON shape:

```json
{
  "mode": "strongs",
  "number": "H157",
  "entry": { "number", "language", "lemma", "transliteration", "definition", ... },
  "verses": [{ "book", "chapter", "verse", "word", ... }]
}
```

Definition search shape:

```json
{ "mode": "search", "query": "<input>", "entries": [ ... ] }
```

### `bible egw lookup <ref> [--json]`

Explicit refcode lookup — no FTS fallback. Refcode forms:

- `"PP 351.1"` — single paragraph
- `"PP 351.1-5"` — paragraph range
- `"PP 351"` — full page
- `"PP 351-355"` — page range
- `"PP"` — book metadata + chapter TOC

JSON shape (single page):

```json
{
  "ref": "PP 351.1",
  "found": true,
  "kind": "page",
  "book": { "bookId", "bookCode", "title", "author", "paragraphCount" },
  "page": 351,
  "chapterHeading": null,
  "paragraphs": [{ "refcode", "text", "html" }]
}
```

For invalid refcodes (e.g. `"great controversy"`), exits non-zero with stderr
hint to use `bible egw search` instead.

### `bible egw commentary <book ch:verse> [--json]`

EGW Bible Commentary (BC1-BC7) entries for a single Bible verse. Refuses
chapter/range/full-book queries (use `bible egw lookup` for ranges).

JSON shape:

```json
{
  "verse": { "book": 43, "chapter": 3, "verse": 16 },
  "entries": [
    { "refcode": "6BC 1071.11", "bookCode", "bookTitle", "content", "puborder" }
  ]
}
```

`content` is HTML (with `egwlink_bible` spans) — strip with a simple regex if
you need plain text.

### `bible egw search <query> [--remote] [--limit N] [--book CODE] [--lang en] [--json]`

Local FTS by default. `--remote` hits the EGW API. `--book` scopes local
search to a single book code (e.g. `--book DA`). `--lang` only applies
remote.

### `bible egw books [--author <substr>] [--json]`

Lists books installed in the local EGW DB. Use `--json` to feed downstream
filters.

### `bible egw catalog [--search <q>] [--author <substr>] [--lang en] [--limit 50] [--json]`

Browses the remote EGW API catalog. Useful when planning what to
`bible egw download <code>`.

### `bible hymns get <number> [--json]`

Returns the full hymn (verses[]). JSON: `{ id, name, category, verses }`.
Range: 1-920.

### `bible hymns search <query> [--json]`

Returns up to 20 matches. JSON: `{ query, matches: [{ id, name, category, firstLine }] }`.

### `bible hymns categories` / `bible hymns category <id>`

Browse categories. (No `--json` yet — these are typically interactive.)

### `bible sabbath-school fetch [-y YEAR] [-q QUARTER] [-w WEEK] [--json]`

Downloads (or returns from cache) the Teachers PDF + EGW Notes PDF for the
requested week(s). No AI involvement. Defaults: current year, current
quarter, all 13 weeks.

JSON shape:

```json
{
  "weeks": [
    {
      "year": 2026,
      "quarter": 2,
      "week": 5,
      "lessonPdf": "/abs/path/2026-Q2-W5-lesson.pdf",
      "egwPdf": "/abs/path/2026-Q2-W5-egw.pdf",
      "lessonUrl": "https://absg.adventist.org/...",
      "egwUrl": "https://www.sabbath.school/..."
    }
  ]
}
```

Files cache to `outputs/sabbath-school/pdfs/`; re-runs are idempotent.

### `bible prompts list [--json]`

Lists the in-binary prompt registry (the same prompts the CLI uses for its
own AI commands). Names are stable; entries:

- `messages/generate` — peak-ending message outlines
- `studies/generate` — whiteboard-style topical studies
- `readings/generate` — slide-format readings
- `readings/generate-study` — extended SDA-pioneer chapter studies
- `analyze/system` — structural analysis (chiastic, typological)

### `bible prompts get <name> [--json]`

Default output: raw markdown to stdout (the prompt content). With `--json`:
`{ name, description, content }`. Unknown names exit 1 with available list on
stderr.

## Anti-Patterns

- **Don't paraphrase verses from memory.** Always pull via `bible verse` and
  cite the JSON.
- **Don't invent Strong's numbers.** `bible concordance H<n>` returns null
  entry on miss — check before citing.
- **Don't paraphrase EGW.** Use `bible egw lookup` and quote the
  `paragraphs[].text` field with the refcode.
- **Don't use `bible egw <ref>` (no `lookup`) for agent flows.** That
  subcommand is human-facing and falls through to FTS on parse failure —
  ambiguous for programmatic use. Use `bible egw lookup` instead; failures
  are explicit.
- **Don't run `bible sabbath-school process`** unless the user asks — that
  invokes the AI generation pipeline. `fetch` is the read-only path.

## Source Code

| Path                                          | What                                   |
| --------------------------------------------- | -------------------------------------- |
| `packages/cli/src/commands/bible.ts`          | `verse`, `concordance`                 |
| `packages/cli/src/commands/egw.ts`            | All `egw` subcommands                  |
| `packages/cli/src/commands/hymns.ts`          | All `hymns` subcommands                |
| `packages/cli/src/commands/sabbath-school.ts` | `fetch`, `process`, `revise`, `export` |
| `packages/cli/src/commands/prompts.ts`        | `prompts list/get`                     |
| `packages/cli/src/prompts/index.ts`           | The inline `PROMPT_REGISTRY`           |
| `packages/core/src/egw-commentary/service.ts` | Commentary lookup                      |
| `packages/core/src/hymnal/`                   | Hymnal service                         |
| `packages/core/src/bible-reader/`             | Verse parsing & navigation             |
