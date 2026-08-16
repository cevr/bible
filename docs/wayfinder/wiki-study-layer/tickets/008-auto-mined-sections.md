---
id: 008
title: Auto-mined section composition
labels: [wayfinder:grilling]
status: closed
assignee: fable-main
blocked-by: [002, 004]
---

## Question

Every topic page — flagship or catalog-only — assembles auto-mined sections. Decide the
composition and the compute story per section:

- **Candidate sections**: key verses (catalog `topic_references`, OSIS-normalized);
  EGW appearances (FTS over `paragraphs_fts` for dictionary phrases); EGW Bible
  Commentary entries for the key verses (`packages/core/src/egw-commentary/`); pioneer
  witnesses (same paragraphs DB, pioneer books — see
  [Pioneer corpus inventory](003-pioneer-corpus-inventory.md)); cross-references radiating
  from key verses (`cross_refs`, openbible/tske); backlinks (topics whose pages link
  here); "everywhere this phrase appears" long tail.
- **Per section: precomputed in the artifact vs live query at view time** — decided on
  facts from [Phrase matching and live-query feasibility](002-phrase-matching-feasibility.md).
  Precomputed sections must state how they stay honest against a _partial_ local EGW
  library.
- **Partial-corpus degradation**: charter says undownloaded citations render as "get this
  book" affordances — define exactly what's shown (snippet from a precomputed excerpt?
  just the refcode?) and how download-on-tap flows through the existing
  `v1.reading.writingsPublication.download` RPC.
- Ordering/capping rules per section so pages stay readable (the teachings-format
  instinct: capped witnesses).

Section composition, ordering, caps, and missing-corpus states belong in core.
Web and desktop render the result. CLI can print the same section model as text
or JSON.

## Resolution

_Resolved 2026-08-16 by fable-main under the standing goal, per never-block-on-the-human.
Reversible on review._

**Everything is live-queried at view time.** No precomputed section bodies in the
artifact — [ticket 002](002-phrase-matching-feasibility.md) proved warm batched FTS5
runs 0.1–4.3 ms and precomputation breaks against partial libraries;
[ticket 004](004-wiki-domain-model.md) already routes flagship and catalog pages
through one core section composer. Live queries are automatically honest about what is
locally installed.

**Section lineup (in page order) and sources:**

1. **Key verses** — catalog `topic_references`, OSIS-normalized; **default-open** (the
   prototype showed a fully-collapsed page reads as a table of contents). Cap 8, "show
   all" expands.
2. **EGW statements** — batched FTS over `paragraphs_fts` for the topic's dictionary
   phrases, EGW/White-Estate scope, FTS rank order. Cap 5 + "search all appearances"
   handoff to hybrid search pre-filled with the canonical phrase.
3. **Commentary on the key verses** — `egw-commentary` service entries, verse order.
   Cap 5.
4. **Pioneer witnesses** — same FTS, pioneer book scope, rank order. Cap 5, same search
   handoff. (Teachings-format instinct: capped witnesses.)
5. **Cross-references** — `cross_refs` radiating from the key verses, cap 10.
6. **Related topics** — authored edges first, then backlinks; no cap needed (graph
   degree stays small).

The "everywhere this phrase appears" long tail is **not a section** — it is the search
handoff in sections 2/4, landing in the hybrid search UI scoped to the phrase.

**Partial-corpus degradation.** A hit in an uninstalled book renders **refcode + book
title + "get this book"** — no text snippet (snippets would need precomputed excerpts,
reintroducing staleness; and FTS cannot hit uninstalled books anyway — these entries
come from citations in authored cores and commentary indexes). Tap fires the existing
`v1.reading.writingsPublication.download` RPC; the checkpoint-2 Reactivity keys already
invalidate the writings library on download, so the section refreshes itself.

**Caps and ordering live in core** as constants of the section composer; web/desktop
render the composed model, CLI prints it (`bible wiki topic <slug>` shows the same
sections as text/JSON).
