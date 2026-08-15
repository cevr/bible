---
id: 014
title: Hybrid search design
labels: [wayfinder:grilling]
status: open
assignee:
blocked-by: [013]
---

## Question

Design the EGW hybrid search engine on the facts from
[qmd evaluation for hybrid EGW search](013-qmd-evaluation.md): natural-language and
precise queries mixed in one box, fast, parity across desktop and web.

- **Engine**: qmd direct / fork / learnings-only (per the evaluation's recommendation).
- **Query model**: how one input mixes modes — bare words (lexical), quoted phrases
  (exact), refcode filters (`GC 425`), natural questions routed to embeddings; is there
  visible syntax or automatic routing?
- **Index story**: what ships (embeddings artifact via corpus-supply? built locally after
  download?), how the index tracks a growing local EGW library
  (`sync_status`/`puborder`), size budget for OPFS on web.
- **Ranking**: lexical + vector fusion, rerank step or not, and how results interleave
  with the existing FTS search UI (`v1.reading.bibleSearch.get` pattern; Writings
  `search`/`locate` in `packages/core/src/writings/service.ts`).
- **Relationship to the wiki layer**: search results as a rabbit-hole entry point; do
  topic pages rank in the same results?

Depending on the evaluation's confidence, this may spawn a prototype ticket (spike the
engine on the real corpus) before the design locks — create it then rather than now.
