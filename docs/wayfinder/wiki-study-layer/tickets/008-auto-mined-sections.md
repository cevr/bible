---
id: 008
title: Auto-mined section composition
labels: [wayfinder:grilling]
status: open
assignee:
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
