---
id: 014
title: Hybrid search design
labels: [wayfinder:grilling]
status: closed
assignee: fable-main
blocked-by: [013]
---

## Question

Design the EGW hybrid search engine on the facts from
[qmd evaluation for hybrid EGW search](013-qmd-evaluation.md): natural-language and
precise queries mixed in one box, fast, with one domain contract across web, desktop,
and CLI.

- **Engine**: qmd direct / fork / learnings-only (per the evaluation's recommendation).
- **Query model**: how one input mixes modes — bare words (lexical), quoted phrases
  (exact), refcode filters (`GC 425`), natural questions routed to embeddings; is there
  visible syntax or automatic routing?
- **Index story**: what ships (embeddings artifact via corpus-supply? built locally after
  download?), how the index tracks a growing local EGW library
  (`sync_status`/`puborder`), size budget for OPFS on web. The current database has
  3,012,004 paragraphs. The EGW and White Estate scope has 961,761. At 256-dimensional
  int8, those scopes need about 771 MB and 246 MB before metadata. Choose the scope.
- **Ranking**: lexical + vector fusion, rerank step or not, and how results interleave
  with the existing FTS search UI (`v1.reading.bibleSearch.get` pattern; Writings
  `search`/`locate` in `packages/core/src/writings/service.ts`).
- **Relationship to the wiki layer**: search results as a rabbit-hole entry point; do
  topic pages rank in the same results?
- **Client adapters**: browser and native query embedding, web OPFS and native
  vector storage, CLI text/JSON output, and one shared model fingerprint. Keep
  query parsing, lexical/vector retrieval contracts, fusion, and fallback in core.
- **Acceptance**: run one golden query set through web, desktop, and CLI. The
  ordered result identities and fallback behavior must match within declared
  numeric tolerances.

Depending on the evaluation's confidence, this may spawn a prototype ticket (spike the
engine on the real corpus) before the design locks — create it then rather than now.

## Resolution

_Resolved 2026-08-16 by fable-main under the standing goal, per never-block-on-the-human:
recommended options adopted. Reversible on review._

**Engine: learnings-only** (locked by
[qmd evaluation for hybrid EGW search](013-qmd-evaluation.md) — Node-native deps fail
web parity). The design transfers qmd's shape onto our storage.

**Vector scope: EGW + White Estate (~246 MB int8), not full corpus (~771 MB).** Lexical
FTS already covers all 3,012,004 paragraphs; vectors cover the 961,761-paragraph
EGW/White-Estate scope. 246 MB is a defensible **optional** OPFS artifact; 771 MB is
not yet. The index format carries a per-book manifest so scope can grow incrementally
(pioneers later) without a format break.

**Query model: automatic routing, no new syntax.** Quotes = exact phrase; refcode
pattern (`GC 425`) = locate-jump; everything else always runs lexical, plus the vector
leg when the index is present and the query is wordy. qmd's strong-BM25 short-circuit
skips the vector leg when lexical is confidently strong.

**Ranking:** RRF fusion (k=60) + position-aware blending. **No cross-encoder rerank in
v1.** Topic pages surface as a **pinned group above** paragraph results — never fused
into the paragraph ranking.

**Embeddings:** one pinned model fingerprint — EmbeddingGemma-300M, 256-d MRL, int8.
Query embedding adapters: transformers.js WebGPU in the browser; native CPU on
desktop/CLI. The paragraph index ships as an **optional corpus-supply artifact**; an
absent index degrades to lexical-only with the same typed absence in all three clients.

**Acceptance (into the spec):** one golden query set runs on web, desktop, and CLI;
ordered result identities and fallback behavior must match within declared numeric
tolerances.

No spike ticket: the evaluation's latency and size numbers were measured on the real
corpus, so confidence is high enough to lock the design; the first implementation
session functions as the spike, and a format break before v1 costs nothing.
