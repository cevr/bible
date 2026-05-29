# Source Material — the `bible` CLI

Pull verses, EGW writings, hymns, commentary, and Sabbath School PDFs into your
generation pipeline. Every read-side command supports `--json` for machine
consumption. **stdout is data** (JSON when `--json`); **stderr is human
messaging.**

This is the source-of-truth for the command surface the universal workflow
(step 1, "Pull source material") depends on. Don't paraphrase from memory —
pull, then generate, citing the actual data.

## Quick Reference

| Goal                                  | Command                                               |
| ------------------------------------- | ----------------------------------------------------- |
| Fetch a verse / chapter / book        | `bible verse <ref> --json`                            |
| Text-search the Bible                 | `bible verse "<query>" --json [--limit N]`            |
| Strong's lookup (definition + verses) | `bible concordance H<n> --json [--limit N]`           |
| Search Strong's by English word       | `bible concordance <word> --json [--limit N]`         |
| **Find an EGW reference (FTS)**       | `bible egw search "<query>" --json`                   |
| Find an EGW reference (whole corpus)  | `bible egw search "<query>" --remote --json`          |
| EGW lookup by refcode                 | `bible egw lookup "<CODE n.n>" --json`                |
| EGW commentary on a verse             | `bible egw commentary "<book ch:vv>" --json`          |
| EGW catalog (remote)                  | `bible egw catalog --search "<term>" --json`          |
| List installed EGW books              | `bible egw books --json`                              |
| Download an EGW/pioneer book          | `bible egw download <CODE>` / `--id <ID>`             |
| Hymn full text                        | `bible hymns get <number> --json`                     |
| Hymn search                           | `bible hymns search "<query>" --json [--limit N]`     |
| Hymn categories                       | `bible hymns categories`                              |
| Sabbath School PDFs                   | `bible sabbath-school fetch -y 2026 -q 2 -w 5 --json` |

## Typical agent flow

You're building a study/message/reading. Pull source material in this order:

1. **Pull the Bible passage** in JSON:
   ```bash
   bible verse "daniel 9:24-27" --json
   ```
2. **Find + pull EGW** on the topic. You rarely know the refcode up front —
   **search to find it, then look it up to quote it**:
   ```bash
   bible egw search "seventy weeks" --book GC --json   # discover the refcode
   bible egw lookup "GC 326.1" --json                  # quote the exact text
   bible egw commentary "daniel 9:24" --json           # verse-keyed commentary
   ```
3. **Pull Strong's** for keywords you're studying:
   ```bash
   bible concordance H2451 --json    # ḥākmâ — wisdom
   bible concordance G26 --json       # agapē — love
   ```
4. **Pull a hymn** for a closing call/altar moment:
   ```bash
   bible hymns search "amazing grace" --json
   bible hymns get 108 --json
   ```
5. **For Sabbath School week prep**, fetch the Teachers + EGW Notes PDFs:
   ```bash
   bible sabbath-school fetch -y 2026 -q 2 -w 5 --json
   ```
   Then feed `lessonPdf` and `egwPdf` paths to the pipeline.

Compose results into the user's request. Don't generate first and then
"verify" — pull source first, then generate, citing the actual data.

## Finding EGW + pioneer references

The discovery flow is **search → lookup → quote**:

```bash
# 1. SEARCH to discover the right passage (refcode unknown)
bible egw search "investigative judgment" --json        # local FTS5 index
bible egw search "1844" --book GC --json                # scope to one book
bible egw search "sanctuary cleansed" --remote --json   # whole EGW corpus via API
#   --remote searches ~17K+ paragraphs (all books, letters, periodicals,
#   Froom's Prophetic Faith, SDA Bible Commentary). Use when the local DB
#   (GC, PK, DA, AA, EW, SR, DAR) doesn't surface what you need.

# 2. LOOK UP the refcode the search returned, for exact quotable text
bible egw lookup "GC 423.1" --json                      # single paragraph
bible egw lookup "GC 423-425" --json                    # page range

# 3. QUOTE paragraphs[].text verbatim, with the refcode.
```

For **pioneer voices** (William Miller, Uriah Smith, J.N. Andrews, et al.) not
yet in the local DB: find the book's code/ID with `catalog`, `download` it, then
`search` / `lookup`:

```bash
bible egw catalog --search "uriah smith" --json   # find CODE / book_id
bible egw download DAR                             # or: --id <BOOK_ID>
bible egw search "little horn" --book DAR --json   # now searchable locally
```

## Command details

### `bible verse <ref|query> [--json] [--limit N]`

Reference forms (parsed by `parseBibleQuery`):

- `john 3:16` — single verse
- `john 3` — full chapter
- `john 3:16-18` — verse range
- `john 3-5` — chapter range
- `ruth` — full book
- `"faith"` (no chapter token) — falls back to FTS over the KJV

`--limit N` only applies to FTS search mode (default `10`). Reference modes
return all matched verses regardless.

JSON shape:

```json
{
  "mode": "reference" | "search",
  "query": "<input>",
  "verses": [{ "book_name", "book", "chapter", "verse", "text" }]
}
```

### `bible concordance <Strong's|word> [--json] [--limit N]`

Detection: matches `^[HhGg]\d+$` → direct Strong's lookup; else definition
search. `--limit N` defaults to `50`. Caps the verse list (Strong's mode) or
the entries list (definition search).

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

Strong's is **auxiliary confirmation** of a meaning already plain from the text
(see the Hermeneutic & Sources stance in `SKILL.md`) — never the route to a
non-obvious reading.

### `bible egw search <query> [--remote] [--limit N] [--book CODE] [--lang en] [--json]`

The find-references command. Local FTS5 by default; `--remote` hits the EGW API
(whole corpus). `--book` scopes local search to a single book code (e.g.
`--book DA`). `--limit` defaults to `20`. `--lang` only applies to `--remote`.
Avoid bare commas/operators in the query — they hit the FTS5 parser literally.

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
  "paragraphs": [{ "refcode", "text" }]
}
```

For invalid refcodes (e.g. `"great controversy"`), exits non-zero with a stderr
hint to use `bible egw search` instead.

### `bible egw commentary <book ch:verse> [--json]`

EGW Bible Commentary (BC1-BC7) entries for a **single** Bible verse. Refuses
chapter/range/full-book queries (use `bible egw lookup` for ranges).

JSON shape:

```json
{
  "verse": { "book": 43, "chapter": 3, "verse": 16 },
  "entries": [{ "refcode": "6BC 1071.11", "bookCode", "bookTitle", "content" }]
}
```

`content` may carry HTML (`egwlink_bible` spans) — strip with a simple regex if
you need plain text.

### `bible egw books [--author <substr>] [--json]`

Lists books installed in the local EGW DB. Use `--json` to feed downstream
filters.

### `bible egw catalog [--search <q>] [--author <substr>] [--lang en] [--limit 50] [--json]`

Browses the remote EGW API catalog. Use to find a `CODE`/`book_id` before
`bible egw download`.

### `bible egw download <CODE> | --id <BOOK_ID> [--lang en] [--concurrency N]`

Fetches a book from the API into the local DB and rebuilds the FTS index, so it
becomes searchable via `bible egw search`. The remote catalog matches on
**title**, not code — single-token codes (e.g. `DAR`) may not round-trip; if a
code doesn't resolve, find the `book_id` via `catalog --search "<title>"` and
download by `--id`.

### `bible hymns get <number> [--json]`

Returns the full hymn (`verses[]`). JSON: `{ id, name, category, verses }`.
Range: 1-920.

### `bible hymns search <query> [--json] [--limit N]`

Returns up to `--limit N` matches (default `20`). JSON:
`{ query, matches: [{ id, name, category, firstLine }] }`.

### `bible hymns categories` / `bible hymns category <id>`

Browse categories. (No `--json` yet — these are typically interactive.)

### `bible sabbath-school fetch [-y YEAR] [-q QUARTER] [-w WEEK] [--json]`

Downloads (or returns from cache) the Teachers PDF + EGW Notes PDF for the
requested week(s). No AI involvement. Defaults: current year, current quarter,
all 13 weeks.

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

## Anti-patterns

- **Don't paraphrase verses from memory.** Always pull via `bible verse` and
  cite the JSON.
- **Don't invent Strong's numbers.** `bible concordance H<n>` returns a null
  entry on a miss — check before citing.
- **Don't paraphrase EGW.** Use `bible egw search` to find it and `bible egw
lookup` to quote the `paragraphs[].text` field with the refcode.
- **Don't recall EGW refcodes from memory** — `search` first; a wrong refcode
  silently returns the wrong (or no) paragraph.
- **Don't use bare `bible egw <ref>` (no `lookup`) in agent flows.** That
  subcommand is human-facing and falls through to FTS on a parse failure —
  ambiguous for programmatic use. Use `bible egw lookup`; failures are explicit.

## Source code

| Path                                          | What                       |
| --------------------------------------------- | -------------------------- |
| `packages/cli/src/commands/bible.ts`          | `verse`, `concordance`     |
| `packages/cli/src/commands/egw.ts`            | All `egw` subcommands      |
| `packages/cli/src/commands/hymns.ts`          | All `hymns` subcommands    |
| `packages/cli/src/commands/sabbath-school.ts` | `fetch`, `export`          |
| `packages/core/src/egw-commentary/service.ts` | Commentary lookup          |
| `packages/core/src/hymnal/`                   | Hymnal service             |
| `packages/core/src/bible-reader/`             | Verse parsing & navigation |
