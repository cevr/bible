---
id: 013
title: qmd evaluation for hybrid EGW search
labels: [wayfinder:research]
status: open
assignee:
blocked-by: []
---

## Question

The app needs a fast hybrid search engine over the EGW corpus that mixes natural-language
and precise queries. Candidate: https://github.com/tobi/qmd — evaluate using it directly
versus borrowing its design.

Fetch and read the repo (the `repo` skill can cache it). Establish: (a) what qmd actually
is — language/runtime, index format, how it combines lexical (BM25/FTS) with embeddings
and reranking, which embedding models it uses and how it runs them (local inference?);
(b) license; (c) whether its engine could run inside BOTH hosts — desktop (Electron main
process, better-sqlite3, Bun-adjacent) and web (browser worker, wa-sqlite over OPFS) —
the parity rule (`docs/architecture/feature-parity.md`) forbids desktop-only search;
(d) if direct use fails parity, which of its design choices transfer to a from-scratch
hybrid layer over the existing `paragraphs_fts` FTS5 index; (e) index size implications
for a corpus of ~100k–1M paragraphs and whether an embeddings index could ship as a
corpus-supply artifact; (f) query-embedding at search time: what runs on-device in a
browser vs desktop (WASM inference? transformers.js-class options?), latency estimates.

Deliverable: a recommendation (direct / fork / learnings-only) with receipts.
Write findings to `docs/wayfinder/wiki-study-layer/research/013-qmd-evaluation.md`.
