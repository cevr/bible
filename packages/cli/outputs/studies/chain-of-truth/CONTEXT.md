# The Chain of Truth — Handbook Glossary

Canonical terms for the Chain of Truth handbook. When a term is used elsewhere
(workflow prompts, sections, conversations), it means what this file says.

Glossary only — no spec, no implementation detail. Fresh design; the
`daniel-revelation/CONTEXT.md` "Pioneer Chain" glossary is **reference** for
canonical names/dates/sources, not a parent spec.

---

## The artifact

**The Chain of Truth — A Bible Handbook Study**
A single self-contained handbook file at
`packages/cli/outputs/studies/2026-06-19-the-chain-of-truth-a-bible-handbook-study.md`,
in the exact style of the two template handbooks (RBF and Daniel & the
Revelation). 16 chronological sections (1816→1888) that let a reader study the
full Adventist pioneer message step by step, in the order God gave it.

**Template (the only format reference)**

- `2026-06-17-righteousness-by-faith-a-bible-handbook-study.md`
- `2026-06-10-daniel-and-the-revelation-a-bible-handbook-study.md`

**Thesis** — _"The key opens the casket."_ Miller's method (compare Scripture
with Scripture; the Bible its own interpreter) is the key that opened the whole
casket of advent truth; every later link in the pioneer chain was drawn out by
the same key.

---

## Organizing concepts

**Chain of truth**
The single interlocking body of present truth God unfolded link by link from
1816 (Miller's conversion) to 1888 (Minneapolis / righteousness by faith). Each
section of the handbook is one link; the handbook is chronological — it follows
**how the truth came to be**, not Bible-book order.

**The casket / the key** (the thesis image)
From Brother Miller's Dream (BMD): the **casket** = the great advent truths
given Miller to publish; the **key** = his manner of interpreting — comparing
Scripture with Scripture, the Bible its own interpreter; the **jewels arranged
in their places** = the truths in proper order. The key precedes and opens
everything.

**Equal narrative + doctrine**
Each section carries roughly half historical narrative (the human story of the
discovery, with dated primary-source and secular receipts) and half doctrinal
exposition (verse→gloss with pioneer/EGW receipts). History is the thread;
doctrine is the substance of each bead.

**Present truth**
The portion of God's truth specially relevant for a given moment in salvation
history (2 Pet 1:12). The pioneer chain demonstrates progressive present-truth
unfolding.

---

## Format conventions (handbook style — scannable)

Copies the two template handbooks exactly; **no `[CHAIN]` / marker machinery**
(that belonged to the other series, not the handbook format).

- **Front matter:** YAML with `created_at`, `topic`.
- **Thesis** + **Method** paragraphs after the H1.
- **Table of Contents** with Parts and numbered sections.
- **Section open:** a one-line `>` blockquote thesis for the section.
- **Verse→gloss:** `- _Ref._ "KJV phrase" — gloss.` Italicize refs
  (`_Dan 8:14_`, `_DAR 192.1_`). Pioneer/EGW lines: `- _DAR 192.1._ Smith:
"...short quote..." — gloss.`
- **Symbol definitions inline, first appearance:**
  `- **symbol** = meaning (_Receipt 1_; _Receipt 2_).`
- **Section close:** `**DEFINITION — TITLE =** ...` summarizing what the
  section built.
- **Appendix:** a Symbol Dictionary gathering every symbol.
- Cross-reference sections by exact **TITLE** in quotes, never by number
  (assembly renumbers).

---

## Sourcing rules

**Doctrinal refcodes (EGW / pioneer)** — machine-verified against the local DB
(`bible egw "REF"` / `bible egw search`) before shipping. **Never invent
refcodes.** Non-negotiable.

**Historical claims (dates, events, periodicals, who/when)** — grounded in:

1. **primary corpus sources** first — Bliss, _Memoirs of William Miller_ (MWM);
   James White, _Sketches of the Life of William Miller_ (SLWM); EGW _Great
   Controversy_ ch. 17-23 (GC); Loughborough; Miller's own WMAD; etc. — with a
   verifiable refcode; then
2. **secular / external sources** where the corpus is thin, located via
   `agent-browser` (or web), cited explicitly with the source named. A date with
   no traceable source is flagged, not asserted.

---

## The 16-link spine (1816→1888)

**Part I — The Method & the Time (1816–1840)**

1. The Casket & the Key — Miller's method
2. The Great Image — Daniel 2, the spine of history
3. The 2300 Days — Daniel 8, the longest line
4. The Seventy Weeks — Daniel 9 / the 457 BC anchor
5. The Eastern Question — Litch & the 1840 year-day vindication

**Part II — The Cry & the Disappointment (1840–1844)**

6. The 1843 Chart — Fitch & Hale
7. Babylon Is Fallen — the second angel, the come-out
8. The Midnight Cry — Snow, Exeter, the seventh month
9. The Tarrying & the Great Disappointment — October 22
10. The Little Book Bitter — Revelation 10 explains 1844

**Part III — The Foundations Laid (1844–1863)**

11. The Cornfield — Edson, Crosier, the heavenly sanctuary
12. The Sabbath — Bates, the seal, the Most Holy Place
13. The Three Angels Assembled — the threefold message as one
14. The Lesser Light — the gift of prophecy confirmed
15. The Remnant Organized — the state of the dead, health, 1863

**Part IV — The Gospel Root (1888)**

16. Righteousness by Faith — 1888, Jones & Waggoner, the chain's end
