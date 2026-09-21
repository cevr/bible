---
name: bible
description: >
  Generate teaching documents (sermon messages, topical studies, chapter
  readings, structural analyses — one universal scannable format) and Sabbath
  School outlines from a historic SDA pioneer perspective — and pull the
  source material (KJV verses, EGW writings, EGW Bible Commentary, Strong's
  concordance, SDA Hymnal, Sabbath School lesson PDFs) via the `bible` CLI to
  feed generation. `references/teachings.md` is the canonical format;
  `references/source-material.md` documents the CLI command surface. Use when
  the user asks for new preaching/teaching content, when revising existing
  files, when working with the SDA pioneer corpus, or when fetching raw
  source data (verses, EGW, hymns, Strong's, commentary, SS PDFs), or when
  building a Keynote deck from a teaching document
  (`references/decks.md`). Triggers on: sermon, message, study, reading,
  teaching, Sabbath School, structural analysis, chiasm, EGW
  study/reference, bible verse, Strong's number, hymn lookup, commentary on
  a verse, sabbath school PDF, deck, slides, Keynote, "generate a
  message/study/reading on X", "revise this file", "export to notes".
---

# bible — Content Generation

Generate teaching content in **one universal format** (organized by topic,
not output type) and keep an Apple-Notes copy in sync via the `bible` CLI.

## Pick the reference

```
What is the user asking for?
├─ Any teaching document — message, study, reading,
│  analysis (one format; `kind` is just a tag)     → references/teachings.md
├─ Keynote deck for a teaching document
│  (paintings + verses, full-bleed/split rhythm)   → references/decks.md
└─ Sabbath School week outline (PDF-driven medium) → references/sabbath-school.md
```

Both references contain: when-to-use, source-material commands, output shape,
frontmatter spec, and the export workflow. Sabbath School inherits the
teachings voice and markers; only its weekly mechanics differ.

**Regardless of which reference you pick**, the interpretive method is shared:
read [Hermeneutic & Sources](#hermeneutic--sources-canonical--every-reference-inherits-this)
below first. Every output interprets Scripture by **Miller's Rules** and
draws only on the **EGW + SDA-pioneer (incl. William Miller) corpus** —
historic pioneer Adventism, not modern Adventism.

## Topic Index

| File                           | Output            | Output dir                        | Filename pattern  |
| ------------------------------ | ----------------- | --------------------------------- | ----------------- |
| `references/teachings.md`      | Teaching document | `outputs/teachings/<topic-slug>/` | `<slug>.md`       |
| `references/decks.md`          | Keynote deck      | `outputs/decks/<slug>/`           | `<Deck Name>.key` |
| `references/sabbath-school.md` | SS week outline   | `outputs/sabbath-school/`         | `YYYY-QX-WY.md`   |

Not an output type, but used by both:
`references/source-material.md` — the `bible` CLI command surface for pulling
verses, EGW, commentary, Strong's, hymns, and SS PDFs (Phase 1 of the workflow).

Legacy trees (`outputs/{messages,studies,readings,analyses}/`) are frozen —
files stay for the Sure Word site and live note IDs; new/regenerated content
goes to `outputs/teachings/`.

`bible` resolves `outputs/` against a build-time-baked CLI root, so commands
work from any cwd.

## Universal workflow (every reference follows this)

1. **Gather the cloud of witnesses** via the `bible` CLI (verses, EGW,
   pioneers, hymns, commentary, Strong's) — see
   [`references/source-material.md`](references/source-material.md).
   Don't paraphrase from memory.
2. **Generate the content yourself** using the format from the reference
   file — `bible` no longer has any AI generation commands.
3. **Write the file** to the reference's output dir with frontmatter
   (`created_at`, `topic`, `kind`, …).
4. **Export to Apple Notes**: `bible export -f <file> --folder "<Topic>"`
   (folder per topic, Title-Cased). Writes `apple_note_id` back into the
   frontmatter.
5. **Updates**: edit the file in place, then `bible sync -f <file>` (uses
   `apple_note_id` to update the linked note).

## Hermeneutic & Sources (canonical — every reference inherits this)

All interpretation in every output type follows **William Miller's Rules of
Interpretation**. The reference files set tone, shape, and output format; this
section sets the _method_. When a reference's system prompt and these rules
ever seem to disagree, the rules govern the interpretation.

### Stance — literal historicism, not spiritualism

We read the Bible the way the Reformers and SDA pioneers read it:
**literal-historicist**, not allegorical-mystical. This is the
**Reformer/pioneer line (Wycliffe, Luther, Zwingli, Miller) against the
Alexandrian-allegorical line (Origen → Rome)**, which dissolves the plain text
into a "hidden," secret, or mystical sense.

- **The word is read as it is.** Take the Bible as it reads. The language of
  Scripture carries its **plain, obvious meaning** — _unless the text itself
  marks a symbol or figure_ (then interpret the figure by the Bible, per Rules
  6–12). Do not invent a secret, esoteric, or "deeper spiritual" meaning behind
  the words. Prophecy is symbolic where Scripture says it is symbolic, and
  literal everywhere else — that is historicism, not spiritualizing.
- **No mystical / hidden meaning.** Reject the method that treats the plain
  text as a veil over some concealed sense. A reading that needs a key the
  Bible itself never supplies is suspect by definition.
- **Greek/Hebrew is auxiliary, not foundational.** Sound hermeneutics does
  **not** depend on the original languages. Scripture interprets Scripture in
  any faithful translation (KJV here). Use Strong's / lexical data only as
  **supporting confirmation** of a meaning already plain from the text and its
  cross-references — never as the route by which a non-obvious meaning is
  introduced. If a point _requires_ Greek to stand, it is not yet established
  from the Bible.

**EGW confirms this stance (Great Controversy):**

> "The truths most plainly revealed in the Bible have been involved in doubt
> and darkness by learned men, who, with a pretense of great wisdom, teach that
> the Scriptures have a mystical, a secret, spiritual meaning not apparent in
> the language employed. These men are false teachers. … The language of the
> Bible should be explained according to its obvious meaning, unless a symbol
> or figure is employed. … If men would but take the Bible as it reads, … a
> work would be accomplished that would … bring into the fold of Christ
> thousands upon thousands who are now wandering in error." — GC 598.3

> "He submitted himself to the Bible as the word of God, the only sufficient,
> infallible rule. He saw that it must be its own interpreter. He dared not
> attempt to explain Scripture to sustain a preconceived theory or doctrine,
> but held it his duty to learn what is its direct and obvious teaching."
> — GC 173.2 (Zwingli)

### Miller's Rules of Interpretation

Apply these as a generation checklist — every Scripture-takes-Scripture move,
every type, every prophetic figure must pass them:

1. **Every word must have its proper bearing** on the subject presented in the
   Bible.
2. **All Scripture is necessary** and may be understood by diligent study and
   attention.
3. **Nothing revealed in Scripture is hidden** from those who ask in faith, not
   doubting.
4. **To understand doctrine, bring together all the scriptures** on the subject,
   then let every word have its proper influence; if you can form your theory
   without a contradiction, you cannot be in error.
5. **Scripture must be its own expositor**, since it is a rule of itself. If I
   depend on a teacher to expound it, and he guesses, his guess is the word of
   God to me; but if the word of God be its own interpreter, no man is left to
   guess.
6. **God has revealed things to come by visions, figures, and parables**; the
   same thing is often shown in different ways (figures, types, metaphors) to
   establish it.
7. **Visions are always mentioned as such** (Acts 2:17; Joel 2:28; Num. 12:6).
   What is figurative must be explained by the same Bible figure elsewhere.
8. **Figures always have a figurative meaning**, used much in prophecy to
   represent future things, times, and events — mountains, beasts, lamps, days,
   etc.
9. **Parables and metaphors are used as comparisons** to illustrate a subject,
   and must be explained the same way as figures, by the subject and the Bible.
10. **Figures sometimes have two or more meanings** (day = literal, definite, or
    indefinite; world = earth, wicked, or a dispensation) — discern by context
    and harmony.
11. **How to know a word is used figuratively**: if it makes good sense as it
    stands and does no violence to the simple laws of nature, it is literal;
    otherwise, figurative.
12. **To learn the true meaning of a figure**, trace the word through your Bible,
    and where you find it explained, put it on the figure; if it makes good
    sense, you need look no further; if not, look again.
13. **To know whether we have the true historical event** for a prophecy's
    fulfillment: if you find every word of the prophecy (after the figures are
    understood) literally fulfilled, you may know your history is the true event;
    but if one word lacks a fulfillment, you must look for another event, or wait
    its future development.
14. **The most important rule: you must have faith.** Faith that will sacrifice
    pleasure, the world, reputation — that will, if required, give up all for
    Christ. Without this you can never understand the word of God. (Governed by
    evidence, never by feeling or preconceived opinion.)

### Source corpus (in authority order)

- **Scripture (KJV)** — supreme, self-interpreting authority. Quote, don't
  paraphrase. Pull via `bible verse "<ref>" --json`.
- **Spirit of Prophecy (Ellen G. White)** — prophetic voice; a confirming
  witness _in harmony with_ Scripture (Isaiah 8:20), never an independent
  authority. Quote `paragraphs[].text` from `bible egw lookup` / `egw
commentary`.
- **SDA pioneers — including William Miller**, plus Uriah Smith, J.N. Andrews,
  James White, J.N. Loughborough, and the broader Millerite/early-Advent
  corpus. Use for historicist framing, prophetic chronology, and the pioneer
  voice. Cite the pioneer by name when their reading shapes the take.

Do **not** introduce non-pioneer/non-EGW interpretive frameworks as authority.
EGW and the pioneers (Miller foremost) are the lens; Scripture is the rule.

### Finding EGW + pioneer references

You rarely start with the exact refcode. **Search to find it, then look it up to
quote it** — never recall EGW from memory:

```bash
bible egw search "investigative judgment" --json     # 1. find the refcode (local FTS5)
bible egw search "1844" --remote --json              #    --remote = whole ~17K-para corpus
bible egw lookup "GC 423.1" --json                   # 2. quote the exact paragraph text
bible egw commentary "daniel 8:14" --json            #    verse-keyed commentary
```

For pioneer voices not in the local DB (Miller, Smith, Andrews, …), find the
book with `bible egw catalog --search "<title>"`, `bible egw download <CODE>`,
then `search` / `lookup` as above.

**Full command surface — flags, JSON shapes, every command — lives in
[`references/source-material.md`](references/source-material.md).** Read it
before pulling source material.

| Step               | Command                                                                         |
| ------------------ | ------------------------------------------------------------------------------- |
| Fetch verses       | `bible verse "<ref>" --json`                                                    |
| Find EGW reference | `bible egw search "<query>" [--book CODE] [--remote] --json`                    |
| Fetch EGW          | `bible egw lookup "<refcode>" --json` / `bible egw commentary "<verse>" --json` |
| Fetch hymn         | `bible hymns search "<query>" --json` / `bible hymns get <n> --json`            |
| Fetch Strong's     | `bible concordance H1234 --json`                                                |
| Fetch SS PDFs      | `bible sabbath-school fetch -y 2026 -q 2 -w 5 --json`                           |
| Write file         | `Write` tool to `outputs/teachings/<topic-slug>/<slug>.md`                      |
| Initial export     | `bible export -f outputs/teachings/<topic>/<slug>.md --folder "<Topic>"`        |
| Update note        | `bible sync -f outputs/teachings/<topic>/<slug>.md`                             |
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

- **Don't generate without first pulling source material** through the `bible`
  CLI. The whole point of the toolchain is verse accuracy.
- **Don't paraphrase verses from memory** — quote what `bible verse` returns.
- **Don't paraphrase EGW** — quote `paragraphs[].text` from `bible egw lookup`.
- **Don't invent Strong's numbers or hymn numbers** — look them up.
- **Don't write to disk without frontmatter** — export needs `created_at`
  and uses `apple_note_id` for idempotency.
- **Don't skip the export step** — Cristian uses Apple Notes as the active
  surface. A file on disk that isn't in Notes is invisible.

## Source material commands

For raw text (verses, EGW pages/commentary, Strong's, hymns, SS PDFs), use the
`bible` CLI. The full command surface — Quick Reference table, typical agent
flow, per-command flags, `--json` shapes, and anti-patterns — lives in
[`references/source-material.md`](references/source-material.md). The command
table above is the short version; that reference is the source of truth.
