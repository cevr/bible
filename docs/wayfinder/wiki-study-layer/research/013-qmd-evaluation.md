# 013 — qmd evaluation for hybrid EGW search

Ticket: [`../tickets/013-qmd-evaluation.md`](../tickets/013-qmd-evaluation.md)
Repo cache: `~/.cache/repo/tobi/qmd` (fetched 2026-08-14 via `okra repo fetch tobi/qmd`, v2.6.3)

## Recommendation: learnings-only

Do not use or fork qmd. Its engine is welded to three Node-native components —
`better-sqlite3`, the `sqlite-vec` native extension, and `node-llama-cpp` GGUF
inference — none of which runs in a browser worker, so direct use fails the parity
rule (`docs/architecture/feature-parity.md`, "Search: Required / Required"). A fork
does not help: the runtime layer IS most of the code; the transferable value is the
retrieval pipeline design (~a few hundred lines of fusion/expansion/blending logic),
which is cheaper to re-implement over the existing `paragraphs_fts` FTS5 index and
Effect services than to excise from a 6,000-line Node store. License is MIT, so
borrowing the design (and even code fragments) is unencumbered.

## (a) What qmd is

- **Language/runtime**: TypeScript, ESM, `engines.node >= 22`, tested under both Node
  (vitest) and Bun. Ships as a CLI (`bin/qmd`), an MCP server (`src/mcp/`), and a
  library SDK (`src/index.ts`). Receipts: `~/.cache/repo/tobi/qmd/package.json`,
  `~/.cache/repo/tobi/qmd/README.md`.
- **Storage**: one SQLite DB via `better-sqlite3` (native). Content-addressed
  `content` table, `documents`, `content_vectors` (embedding chunks keyed
  `hash+seq`), `llm_cache` (expansion cache), and two virtual tables:
  - `documents_fts` — FTS5 BM25 index (`src/store.ts:1010`, `:1235`)
  - `vectors_vec` — `vec0` table from the **sqlite-vec native extension**, created
    lazily with dimensions taken from the first embedding:
    `CREATE VIRTUAL TABLE vectors_vec USING vec0(hash_seq TEXT PRIMARY KEY, embedding float[N] distance_metric=cosine)`
    (`src/store.ts:1447`; extension loading in `src/db.ts:48-157`).
- **Hybrid pipeline** (README "Score Normalization & Fusion" + `src/store.ts`):
  1. **Typed query expansion** by a local LLM into `lex` / `vec` / `hyde`
     sub-queries, routed exclusively — `lex` → FTS5, `vec`+`hyde` → vector; the
     original query goes to both (`src/store.ts:424-432`, `4430-4480`). Expansion is
     **skipped when the BM25 top hit is strong and clearly separated** from the
     runner-up (`src/store.ts:416`), and expansions are cached in `llm_cache`.
  2. **Reciprocal Rank Fusion**: `score = Σ weight/(k+rank+1)`, k=60; original query
     weighted ×2; top-rank bonus +0.05 for any list's #1, +0.02 for #2–3; top 30 kept
     (`src/store.ts:4537-4582`).
  3. **LLM rerank**: qwen3-reranker scores yes/no with logprobs
     (`src/llm.ts:177-291`).
  4. **Position-aware blend**: RRF rank 1–3 keeps 75% retrieval / 25% reranker,
     4–10 60/40, 11+ 40/60 — so the reranker cannot destroy exact-match hits
     (`src/store.ts:2422`, README).
- **Chunking**: 900 tokens per chunk, 15% overlap, char-approximated ×4
  (`src/store.ts:103-112`). Embedding-model fingerprint stored per vector so a model
  swap forces re-embed (`src/store.ts:99-101`, README "you must re-index with
  `qmd embed -f`").
- **Models** (all local GGUF via `node-llama-cpp`, auto-downloaded from HF, cached in
  `~/.cache/qmd/models/`; `src/llm.ts:279-291`):
  - embed: `embeddinggemma-300M-Q8_0` (~300MB, 768-dim, MRL-truncatable to
    512/256/128); alt `Qwen3-Embedding-0.6B` for multilingual. Query vs document
    prompt prefixes are model-family-aware (`formatQueryForEmbedding`,
    `src/llm.ts:99-118`).
  - rerank: `qwen3-reranker-0.6b-q8_0` (~640MB).
  - generate (expansion): a **custom fine-tuned 1.7B model**
    (`hf:tobil/qmd-query-expansion-1.7B-gguf`), trained in `finetune/`.

## (b) License

MIT — `~/.cache/repo/tobi/qmd/LICENSE` (Copyright 2024–2026 Tobi Lutke). No
restriction on reuse of design or code.

## (c) Parity test: can the engine run in both hosts?

- **Desktop (Electron main, better-sqlite3)**: yes, near as-is. qmd already runs on
  Bun/Node with better-sqlite3; node-llama-cpp works in an Electron main process.
- **Web (browser worker, wa-sqlite over OPFS)**: no, on three counts.
  1. `better-sqlite3` is a native Node addon. The web worker uses `wa-sqlite`
     (forked: `apps/web/package.json:30` → `github.com/cevr/wa-sqlite`), loaded as
     `wa-sqlite-async.mjs` with `OPFSAdaptiveVFS`/`IDBBatchAtomicVFS`
     (`apps/web/src/workers/db-worker.ts:7-10`, `sqlite-host.ts`).
  2. `sqlite-vec` is a native extension; WASM SQLite cannot dynamically load
     extensions — sqlite-vec must be **statically compiled into a custom WASM
     build** ([alexgarcia.xyz/sqlite-vec/wasm.html](https://alexgarcia.xyz/sqlite-vec/wasm.html)).
     Possible (the wa-sqlite fork is already ours) but a real build-infra project,
     and unnecessary — see (d).
  3. `node-llama-cpp` has no browser story at all; GGUF-in-browser alternatives
     (wllama) are slow, and the practical browser path is transformers.js/ONNX
     Runtime Web — a different inference stack than desktop qmd would use.

Verdict: **direct use and fork both fail parity**; only the design transfers.

## (d) Design choices that transfer to a from-scratch layer over `paragraphs_fts`

The existing FTS5 index (`packages/core/src/egw-db/book-database.ts:575`,
`paragraphs_fts` over `paragraphs.content`) already provides the lexical leg. Adopt
from qmd:

1. **RRF fusion with qmd's exact constants** — k=60, original ×2, top-rank bonuses,
   position-aware rerank blend 75/60/40. This is pure arithmetic over two ranked
   lists; trivially portable to a worker.
2. **Exclusive routing of typed sub-queries** (`lex`→FTS, `vec`/`hyde`→vector) and
   the **strong-BM25-signal short-circuit** that skips expensive expansion when
   keyword search already nails it — this keeps precise queries fast and cheap.
3. **Model fingerprint on every stored vector** so shipping a new embedding model
   invalidates cleanly.
4. **Skip qmd's chunking**: EGW paragraphs are natural, citation-stable chunks well
   under 900 tokens — one paragraph = one vector, `para_id`-keyed. That removes the
   whole hash+seq chunk bookkeeping.
5. **Make reranking an optional quality tier**, as qmd's blend already implies:
   hybrid search must be correct without it (desktop can add a local reranker later;
   the browser skips it or uses a ~23M cross-encoder).
6. **Vector store: flat typed-array scan, not sqlite-vec.** sqlite-vec is itself
   brute-force KNN today (no ANN yet — [github.com/asg017/sqlite-vec](https://github.com/asg017/sqlite-vec)),
   so a `Float32Array`/`Int8Array` dot-product scan over a memory-loaded artifact is
   the same performance class, runs identically in a browser worker and Electron,
   and needs zero native/WASM SQLite work. Keep the vectors OUT of SQLite; join
   scan results to `paragraphs` by `para_id`.

## (e) Index size for ~100k–1M paragraphs; corpus-supply artifact

One vector per paragraph. Sizes for the embedding matrix alone (metadata ~4–8 bytes
per row extra):

| Corpus | 768-d f32 | 768-d int8 | 256-d int8 (MRL) | 128-d int8 (MRL) |
| ------ | --------- | ---------- | ---------------- | ---------------- |
| 100k   | 307 MB    | 77 MB      | 26 MB            | 13 MB            |
| 250k   | 768 MB    | 192 MB     | 64 MB            | 32 MB            |
| 1M     | 3.07 GB   | 768 MB     | 256 MB           | 128 MB           |

EmbeddingGemma's Matryoshka training makes 256-d truncation a supported,
low-loss operation ([huggingface.co/blog/embeddinggemma](https://huggingface.co/blog/embeddinggemma)).
At 256-d int8, even a 1M-paragraph corpus is a 256MB artifact — the same order as
the existing writings DB, so **yes: ship it as a digest-verified corpus-supply
artifact** (like `bible.db`), versioned with the embedding-model fingerprint.
Precompute embeddings at publish time on a real machine (Node + node-llama-cpp or
Python sentence-transformers); devices never embed the corpus, only queries.
Scan cost: 250k × 256-d ≈ 64M multiply-adds ≈ tens of ms in a worker with typed
arrays; 1M × 256-d ≈ 100–300 ms — acceptable, and shardable by book if not.

## (f) Query embedding at search time

Only ONE short text is embedded per search, and the doc/query models must match.

- **Desktop**: node-llama-cpp GGUF (qmd's exact path) or ONNX Runtime Node in the
  Electron main process. Latency: tens of ms once the model is resident; qmd keeps
  models loaded and reports ~1s recreate penalty after 5-min idle (README).
- **Browser**: transformers.js (ONNX Runtime Web) in the same worker family.
  - `onnx-community/embeddinggemma-300m-ONNX` exists; q4 footprint is under 200MB
    ([glaforge.dev in-browser semantic search](https://glaforge.dev/posts/2025/09/08/in-browser-semantic-search-with-embeddinggemma/),
    [HF model card](https://huggingface.co/onnx-community/embeddinggemma-300m-ONNX)).
  - Measured benchmark anchor (all-MiniLM-L6-v2, 23M params, seq 512, batch 1):
    **WASM ~507–532 ms, WebGPU ~15–46 ms**
    ([Xenova webgpu-embedding-benchmark results](https://huggingface.co/spaces/Xenova/webgpu-embedding-benchmark/discussions),
    [Chrome developers blog](https://developer.chrome.com/blog/io24-webassembly-webgpu-2)).
    Scaling ~linearly in parameters, EmbeddingGemma-300M estimates:
    **WebGPU ~100–400 ms per query (feasible); WASM fallback ~3–7 s (poor)**.
  - **Feasibility class**: feasible on WebGPU browsers; the WASM fallback forces a
    choice — either accept slow first-token on old browsers, or pick a smaller
    shared model (e.g. all-MiniLM-L6-v2 / bge-small, 384-d, WASM ~0.5 s) and trade
    embedding quality. Model choice is a corpus-wide decision (fingerprint), decided
    in ticket 014. One-time model download (~50–200 MB) should ride the same
    corpus-supply/download UX as book downloads.
  - Reranker in browser: qwen3-reranker-0.6B over 30 candidates would be multi-
    second even on WebGPU — confirm rerank as desktop-optional/deferred (see d.5).

## Receipts

- qmd cache: `~/.cache/repo/tobi/qmd/` — `LICENSE`, `package.json`, `README.md`,
  `src/store.ts` (schema :1010/:1158-1235/:1447; RRF :4537-4582; expansion
  :416/:4430; chunking :103-112), `src/llm.ts` (models :279-291, prompts :90-118),
  `src/db.ts` (sqlite-vec loading :48-157).
- This repo: `docs/architecture/feature-parity.md`,
  `apps/web/src/workers/db-worker.ts:7-10`, `apps/web/src/workers/sqlite-host.ts`,
  `apps/web/package.json:30`,
  `packages/core/src/egw-db/book-database.ts:13,575,859-870`.
- URLs: <https://github.com/tobi/qmd>, <https://alexgarcia.xyz/sqlite-vec/wasm.html>,
  <https://github.com/asg017/sqlite-vec>, <https://huggingface.co/blog/embeddinggemma>,
  <https://huggingface.co/onnx-community/embeddinggemma-300m-ONNX>,
  <https://glaforge.dev/posts/2025/09/08/in-browser-semantic-search-with-embeddinggemma/>,
  <https://huggingface.co/spaces/Xenova/webgpu-embedding-benchmark/discussions>,
  <https://developer.chrome.com/blog/io24-webassembly-webgpu-2>.
