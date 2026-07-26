# Teachings — The Universal Format

One format for every teaching document: sermon messages, topical studies,
chapter readings, structural analyses. What a document is *for* is a
frontmatter tag (`kind`), never a change in shape. Organization is **by
topic**, not by type.

The format is built for how Cristian actually uses the page: he teaches from
a **whiteboard**, uses the document as a **reference, not a script** (glances
mid-sentence to retrieve an anchor, a verse, a quote), and **improvises as
the Spirit leads** — jumping, compressing, expanding. Every rule below serves
one of those three uses. The page is a map and a repository, never a rail.

## When to use

Any request for preaching/teaching content that isn't a Sabbath School weekly
outline (→ `references/sabbath-school.md`, which shares this voice but keeps
its PDF-driven weekly mechanics).

## The two-phase workflow

**Phase 1 — Gather the cloud of witnesses.** Before writing a word:

1. Pull every Bible passage via `bible verse "<ref>" --json` — the source
   verses (if regenerating from a source, **all** of them) plus the
   cross-references you intend to chain.
2. Gather EGW + pioneer testimony on each movement of the argument:
   `bible egw search` → `bible egw lookup` → quote `paragraphs[].text`
   verbatim with refcode. Pioneers (Miller, Uriah Smith, Andrews, James
   White, Jones, …) cited by name.
3. For large documents, fan the gathering out (one gatherer per theme);
   never write from memory.

Full command surface: `references/source-material.md`. Hermeneutic: the
"Hermeneutic & Sources" section of `SKILL.md` — Miller's 14 Rules, literal
historicism, **historic pioneer Adventism, not modern Adventism**.

**Phase 2 — Write** with the grammar below.

## Line grammar

The left edge of every line is its retrieval handle. Mid-sentence, one
second, eyes down: the eye walks the left rail and finds the anchor.

### Scripture — ref first, gloss after

```markdown
- _Eze 28:14._ "Thou art the anointed cherub that covereth; and I have set
  thee so" — the title is a station, not a compliment
- _Eze 28:15._ "perfect in thy ways... till iniquity was found in thee" —
  made perfect; iniquity "found," never explained
```

- Italic ref, trailing period, then the KJV text, then **em-dash + gloss**.
- **The gloss is the payload** — the connection or point he may not have
  made, telegraphic, one line. A verse bullet without a gloss is unfinished.
- One **anchor passage** per section quoted in full (the verse he reads
  aloud). Supporting verses compress to ref + short fragment, or to a chain:

```markdown
- chain: Ex 25:20 (wings cover mercy seat) → Heb 8:5 (copy of heavenly) →
  Ps 99:1 (He sits between) → Rev 11:19 (ark still there — post vacant)
```

- Chains are board-writable routes: ref + parenthetical gloss of 2-6 words
  per hop. Use them to compress a verse tour instead of stacking six full
  quotations.

### Witnesses — refcode first, punchline only

```markdown
[SOP SR 13.1] "a high and exalted angel, next in honor to God's dear Son" —
his rank

[PIONEER Jones, ECE 572.4] "stood close to the throne of God with
outstretched, covering wings" — pioneer reads Eze 28 the same way
```

- `[SOP REFCODE]` for Ellen White; `[PIONEER Name, REFCODE]` for pioneers.
- **≤30 words, no mid-quote ellipses** — pick the single contiguous
  punchline clause from the lookup text. If two clauses are both needed,
  stack two witness lines with the same refcode.
- A quote may not open on a pronoun whose referent is unquoted — bracket the
  antecedent: `"It is in this sense [no subjects left] that he is bound"`.
- Em-dash gloss at the end: why this quote (2-6 words).
- **One primary witness per section** — the one he reads aloud. Secondaries
  stay single-line. Never stack three where one lands (Isa 8:20 order:
  Scripture establishes; witnesses confirm).
- EGW/pioneer words appear **only** on these marker lines — the
  `_Ref._ "text"` bullet form is reserved for Scripture, so a glance never
  confuses witness with verse.

### Markers

| Marker                    | Use                                                        |
| ------------------------- | ---------------------------------------------------------- |
| `[WB]`                    | Whiteboard move — drawable in ≤30s: ≤5 nodes, ≤4 words each|
| `[SOP REFCODE]`           | EGW witness — ≤30 words, no ellipses, gloss                |
| `[PIONEER Name, REFCODE]` | Pioneer witness — same rules, author named                 |
| `[Q]`                     | Anticipated objection → one `→` answer line (refs + gist)  |
| `[RQ]`                    | Question to put to the audience                            |
| `[Aside]`                 | One-line image seed — he tells the story, the page plants it|
| `[TANGENT]`               | Optional hop-chain: ≥3 refs, parenthetical gloss per hop   |
| `[→]`                     | One-line connection, link front-loaded — closes a section  |

Marker bodies are capped at **2 lines**. A `[Q]` answer is one `→` line of
refs and gist — never a paragraph. `[→]` is one line, and at most one per
section, as its last line.

Retired: `[ILL]` (canned stories — an `[Aside]` seed replaces it), `[DYK🔎]`
(word studies become sub-bullets under their verse; whiteboard-worthy facts
become bold-headline bullets; trivia is cut), Act super-structures, the
multi-sentence prose thesis.

### Contrasts are tables

Any A-vs-B pairing (type/antitype, first Adam/second Adam, charge/exhibit,
name/role) **must** be a table — 2-3 columns, ≤4 words per cell. The table
is the board artifact; never leave a contrast latent in bullets.

## Document anatomy

```markdown
---
created_at: '2026-07-25T14:00:00Z'
topic: great-controversy
title: 'Origin, History, and Destiny of Satan'
kind: reading            # reading | study | message | analysis — a tag only
series: bible-readings    # optional
chapter: 102              # optional
---

# [Title]

**[Burden — ONE bold sentence. The whole document, sayable from memory.]**

## MAP

1. [Section phrase] — [anchor ref]
2. ...
N. Appeal

[Q] index: [objection phrase]? →[section #] · [objection]? →[section #]

---

## 1. [Phrase] — [Anchor Ref]

> [Section burden — ≤2 lines. The sentence he teaches this section from
> if the page stays closed.]

[WB]: [the board move for this section, when it has a shape]

**[Cluster headline — bold claim — refs]:**

- _Ref._ "anchor verse quoted in full" — gloss
- _Ref._ "fragment" — gloss
- chain: Ref (gloss) → Ref (gloss) → Ref (gloss)

[SOP REFCODE] "punchline" — why this quote

[Q] objection?
→ answer gist — REF; second move — REF

[→] the connection, front-loaded

---

## 2. ...

---

## N. Appeal

- decision language, pressed home
- _Ref._ "closing scripture"
```

Rules that make it work live:

- **MAP** right after the burden: one line per numbered section with its
  anchor ref — the jump index and the first thing drawn on the board. Plus a
  one-line `[Q]` index so a live objection finds its prepared answer
  instantly. No time allocations, no priority stars — pacing and selection
  belong to the Spirit, not the page.
- **Numbered sections, headers carry the anchor ref** —
  `## 4. War in Heaven — Rev 12:7-9`. The number is the jump address; the
  ref is the address's content.
- **Every section is self-contained** — opens with its own blockquote
  burden; a cold jump into any section must work. Cross-references carry
  their payload inline ("§2: the trial God let run → now the verdict —
  GC 670.2"); "hold that pattern," "see below," and setup-without-payload
  lines are banned.
- **One screen per section** (~15 rendered lines). Longer sections split
  with bold cluster headlines, blank line every 4-5 bullets.
- **Bold is reserved** for the document burden and cluster headlines — one
  bold span per line, at line start. If everything is bold, nothing pops.
- **DEFINITION blocks** (from the handbook studies) are optional for
  symbol-heavy studies: close a section with
  `**DEFINITION — [SYMBOL] =** ...` and a `**Symbols defined here:**` list.
- **Delivery extras** (optional, `kind: message`): Opening/Closing Hymns and
  a Central Bible Verse block between frontmatter and MAP.

## Scripture rules

- **Regenerating from a source** → every source verse appears (anchor
  quotes, fragments, or chain hops — present, always).
- KJV. Verse text verbatim from `bible verse` — never memory.
- Every doctrinal claim carries a ref on its own line or clause.
- Strong's / Greek is auxiliary confirmation as a sub-bullet under its
  verse — a point that *needs* the Greek isn't established yet.

## Output location

```
outputs/teachings/<topic-slug>/<slug>.md
```

Topic slugs are kebab-case doctrinal topics (`great-controversy`,
`sanctuary`, `law-and-gospel`, `second-coming`, `state-of-the-dead`, …).
Reuse an existing topic dir before minting a new one (`ls outputs/teachings`).

Series members prefix the filename with the series number so they sort and
track: `reading-102-origin-history-destiny-of-satan.md` (matching the
`series`/`chapter` frontmatter).

Legacy files in `outputs/{messages,studies,readings,analyses}/` stay where
they are (the Sure Word site reads `outputs/studies/`; note IDs are live).
New and regenerated documents go in the teachings tree.

## Export — folder per topic

```bash
bible export -f outputs/teachings/great-controversy/<slug>.md --folder "Great Controversy"
```

Folder = the topic, Title-Cased. A regenerated legacy document keeps its
`apple_note_id` — `bible export -f <file>` then updates the existing note in
place (`bible sync` is DB-only).

## Anti-patterns

- **Don't write before gathering** — the cloud of witnesses is collected
  before composition starts.
- **Don't put the ref at the end of the line** — the left edge is the
  retrieval rail; ref first, always.
- **Don't quote a verse without a gloss** — the em-dash connection is the
  document's whole value.
- **Don't stack full quotations** — one anchor per section; the rest
  compress to fragments and chains.
- **Don't let a witness run past 30 words or splice with ellipses** — pick
  the punchline clause.
- **Don't let EGW wear Scripture's clothes** — witnesses live on
  `[SOP]`/`[PIONEER]` lines only.
- **Don't rail sections together** — every section must survive a cold jump.
- **Don't leave a contrast in bullets** — contrasts are tables.
- **Don't let prose in through marker bodies** — 2-line cap, everywhere.
- **Don't soften the historicist / pioneer position** — historic Adventism
  is the voice; factual and citation fixes only, never tone softening.
- **Don't spiritualize the plain text** — literal unless the text marks a
  figure; figures interpreted by the Bible's own usage (Miller's Rules 6-12).
- **Don't organize by output type** — topic dirs, topic Notes folders,
  `kind` is only a tag.
