---
id: 013
title: qmd evaluation for hybrid EGW search
labels: [wayfinder:research]
status: closed
assignee: research-agent
blocked-by: []
---

## Question

The app needs a fast hybrid search engine over the EGW corpus that mixes natural-language
and precise queries. Candidate: https://github.com/tobi/qmd — evaluate using it directly
versus borrowing its design.

Fetch and read the repo (the `repo` skill can cache it). Establish: (a) what qmd actually
is — language/runtime, index format, how it combines lexical (BM25/FTS) with embeddings
and reranking, which embedding models it uses and how it runs them (local inference?);
(b) license; (c) whether its engine could run inside all three clients — desktop
(Electron main process, better-sqlite3), web (browser worker, wa-sqlite over OPFS), and
CLI (Bun, sqlite-bun) — the parity rule (`docs/architecture/feature-parity.md`) forbids
host-only search;
(d) if direct use fails parity, which of its design choices transfer to a from-scratch
hybrid layer over the existing `paragraphs_fts` FTS5 index; (e) index size implications
for a corpus of ~100k–1M paragraphs and whether an embeddings index could ship as a
corpus-supply artifact; (f) query-embedding at search time: what runs on-device in a
browser vs desktop (WASM inference? transformers.js-class options?), latency estimates.

Deliverable: a recommendation (direct / fork / learnings-only) with receipts.
Write findings to `docs/wayfinder/wiki-study-layer/research/013-qmd-evaluation.md`.

## Resolution

**Learnings-only.** qmd (MIT, TypeScript/Node>=22) is welded to better-sqlite3, the
sqlite-vec native extension, and node-llama-cpp GGUF inference — none runs in the web
worker's wa-sqlite/OPFS host, so direct use and fork both fail parity; the transferable
value is its retrieval design (RRF k=60 with original-query ×2 and top-rank bonuses,
typed lex/vec/hyde expansion with a strong-BM25 short-circuit, position-aware 75/60/40
rerank blend, per-vector model fingerprints), re-implemented over `paragraphs_fts` plus
a flat quantized embeddings artifact scanned in a worker (parity-safe, same performance
class as sqlite-vec's brute-force KNN). Query embedding is browser-feasible via
transformers.js on WebGPU (~100–400 ms est. for EmbeddingGemma-300M; WASM fallback slow),
and a 256-d int8 MRL corpus index ships through corpus-supply at ~26 MB per 100k
paragraphs. Full findings:
[research/013-qmd-evaluation.md](../research/013-qmd-evaluation.md).

The qmd rejection is driven by the browser adapter. The transferred parser,
fusion, scan, and fallback design must stay in portable core. Desktop and CLI
can share a native query-embedding adapter only if it returns the same pinned
model fingerprint and vector contract as the browser adapter.
