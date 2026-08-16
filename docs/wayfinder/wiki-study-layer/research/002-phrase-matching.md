# 002 — Phrase matching and live-query feasibility

Resolves [ticket 002](../tickets/002-phrase-matching-feasibility.md). All benchmarks ran on
an Apple M4 Pro, Bun 1.4.0, `bun:sqlite` (native SQLite), against the live local databases
`~/.bible/bible.db` (156 MB, 31,102 KJV verses) and `~/.bible/egw-paragraphs.db` (1.2 GB,
613,974 paragraphs across 648 books, avg 495 chars of `content_text` per paragraph), opened
read-only. Browser numbers will be slower — see the wa-sqlite section. Throwaway benchmark
scripts lived in the session scratchpad; they are reproduced in outline below, not committed.

## 2026-08-15 three-client and corpus-size note

The benchmark snapshot below is historical. The current local database has
3,012,004 paragraphs across 1,486 books. Of these, 961,761 paragraphs belong to
Ellen Gould White or the Ellen G. White Estate. New performance tests must state
whether they use the EGW-only scope or the full writings corpus.

The matching algorithm, normalization, overlap resolution, and match result
must remain pure TypeScript in core. Web and desktop can render those matches as
links. CLI can return the same match records as JSON. FTS execution stays behind
the portable writings database service, with wa-sqlite, sqlite-node, and
sqlite-bun supplied by the three composition roots.

## (a) Realistic dictionary size

- Charter scopes the curated dictionary at ~50 topics. Workflow-generated, user-reviewed
  aliases realistically land at 4–8 per topic (canonical name, plural/possessive forms,
  KJV phrasing vs EGW phrasing, e.g. "third angel's message" / "third angel" / "message of
  the third angel"). That is **250–400 phrases for v1**.
- The long-tail catalog in `bible.db` has 5,322 `topics` rows (76,957 `topic_references`),
  but those are single-token proper-noun entries (AARON, ABADDON, …) that get landing pages
  for free — they do not enter the phrase dictionary.
- Benchmarks below cover 100–2,000 phrases, so there is ~5x headroom over the realistic
  ceiling before any number below moves meaningfully.

## (b) Render-time matching cost

Two implementations, both case-insensitive with word-boundary filtering, matched against
400 real EGW paragraphs (avg 619 chars — the sample skews long because it excludes
sub-200-char paragraphs) and 400 real KJV verses (avg 132 chars). Dictionary = 50 realistic
doctrinal phrases + frequent real corpus bigrams/trigrams to pad to size. Median of 5 passes
after warmup.

| dict size | AC build | regex build | AC / EGW para | regex / EGW para | AC / verse | regex / verse |
| --------: | -------: | ----------: | ------------: | ---------------: | ---------: | ------------: |
|       100 |   0.5 ms |     0.12 ms |       11.9 µs |          13.1 µs |     2.0 µs |        3.0 µs |
|       250 |   0.5 ms |     0.09 ms |       13.6 µs |          29.2 µs |     2.4 µs |        7.0 µs |
|       500 |   0.8 ms |     0.17 ms |       13.1 µs |          58.6 µs |     2.9 µs |       12.6 µs |
|      1000 |   1.0 ms |     0.29 ms |       14.5 µs |         139.0 µs |     3.0 µs |       30.3 µs |
|      2000 |   2.0 ms |     0.59 ms |       16.3 µs |         602.7 µs |     3.7 µs |      125.2 µs |

- A **screenful (30 EGW paragraphs) against a 1,000-phrase Aho-Corasick automaton costs
  0.38 ms** — under 1% of a 60 fps frame budget, in plain JS with a naive Map-based
  automaton. At the realistic 250–400 phrase size it is even cheaper.
- Aho-Corasick is flat in dictionary size (11.9 → 16.3 µs per paragraph across 100 → 2,000
  phrases); regex alternation degrades superlinearly (13 → 603 µs). At v1 size (≤400
  phrases) **either strategy is fast enough**; Aho-Corasick is the safe choice if the
  dictionary grows.
- AC reports overlapping matches (8,759 raw hits vs regex's 5,884 leftmost-longest at size
  2,000 — e.g. "third angel" inside "third angel's message"), so a leftmost-longest filter
  pass is needed; its cost is negligible. The charter's "first occurrence per section is
  hot" rule further caps work — matching a topic can stop at its first accepted hit per
  section.
- Existing machinery fits: `packages/core/src/bible-rendering/segments.ts` already does
  phrase-anchored span insertion (`segmentVerseText` margin-note anchors, lines 160–206)
  and highlight overlay that only splits `text` segments (`applySearchHighlights`, lines
  114–152). Phrase-link segments are a new `TextSegment` variant applied with the same
  discipline. For EGW, matching runs over per-`Text`-node text from the AST in
  `packages/core/src/egw/ast.ts` (`parseParagraphContent` / `nodesToText`, lines 190–271) —
  matching within `Text` nodes (optionally spanning adjacent ones inside the same block)
  respects node boundaries by construction and never links inside an existing
  `ScriptureRef`/`BookRef`.

## (b′) Precompute-at-build-time cost, for comparison

A 1,000-phrase AC scan over 50,000 real paragraphs (25.6M chars) took 600 ms single-threaded
— **~7.4 s extrapolated for the full 614k-paragraph corpus**. So the precompute strategy is
also cheap to _produce_. Its costs are structural, not computational:

- Spans must be keyed to paragraph identity and book revision. The web copy of
  `egw-paragraphs.db` is built incrementally per book (`sync_status` with per-book
  `revision`/`digest` — see `packages/core/src/egw-db/book-database.ts`), and a schema bump
  drops and rebuilds `paragraphs` + `paragraphs_fts` wholesale (same file, lines ~495–503).
  Shipped spans for the full corpus would mostly reference paragraphs not present in a
  partial library and go stale per-book, forcing artifact/corpus version coupling that
  ticket 001's corpus-supply pipeline would have to carry.
- Rendered EGW text comes from the HTML AST, not `content_text`, so precomputed
  character offsets against `content_text` still need re-projection through node
  boundaries at render time — the offsets don't shortcut the hard part.
- KJV offsets additionally shift under the pilcrow strip and `[bracket]`/`‹›` handling in
  `segmentVerseText`.

Given (b), precompute buys ~15 µs per paragraph at the price of that coupling.

## (c) FTS5 phrase-query performance (auto-mined "everywhere this appears")

Median of 7 runs, warm, prepared statements. KJV = `verses_fts` (fts5, content=verses,
unicode61 remove_diacritics); EGW = `paragraphs_fts` (fts5, content=paragraphs, default
tokenizer). Phrase queries quoted (`"latter rain"`).

| phrase                  | KJV hits | KJV count | KJV top-50 | EGW hits | EGW count | EGW top-50 + snippet |
| ----------------------- | -------: | --------: | ---------: | -------: | --------: | -------------------: |
| latter rain             |        7 |   0.01 ms |    0.01 ms |      529 |   0.12 ms |              0.34 ms |
| loud cry                |        1 |   0.01 ms |    0.01 ms |      412 |   0.14 ms |              0.35 ms |
| third angel             |        3 |   0.01 ms |    0.01 ms |    3,986 |   0.40 ms |              0.27 ms |
| time of trouble         |        8 |   0.06 ms |    0.06 ms |    1,299 |   2.45 ms |              0.45 ms |
| mark of the beast       |        2 |   0.05 ms |    0.06 ms |      529 |   2.53 ms |              0.76 ms |
| righteousness of Christ |        0 |   0.04 ms |    0.03 ms |    1,780 |   4.29 ms |              0.60 ms |
| king of the north       |        7 |   0.15 ms |    0.14 ms |      114 |   2.07 ms |              2.17 ms |
| sanctuary (single word) |      132 |   0.01 ms |    0.02 ms |    5,712 |   0.11 ms |              0.24 ms |
| love (worst case)       |      281 |   0.01 ms |    0.02 ms |   58,453 |   0.83 ms |              0.26 ms |

- Worst warm phrase count over 614k paragraphs: **4.3 ms**. Top-50 retrieval with
  `snippet()` never exceeded 2.2 ms. First-run cold query ("cleansing of the sanctuary",
  426 hits): **12.3 ms**. A 12-phrase batch of EGW counts: 19.3 ms/pass — so mining a whole
  50-topic section set live is tens of milliseconds native.
- Conclusion: live FTS5 comfortably powers the auto-mined sections on demand — no need to
  ship precomputed occurrence lists; at most cache per-topic results.

## (d) wa-sqlite / OPFS constraints (web)

Receipts: `apps/web/src/workers/db-worker.ts`, `apps/web/src/workers/sqlite-database.ts`,
`apps/web/src/workers/procedure-server.ts`, `apps/web/package.json` (line 30).

- The web app uses a **custom wa-sqlite fork** (`wa-sqlite: https://github.com/cevr/wa-sqlite.git`),
  async build (`wa-sqlite-async.mjs`). **FTS5 is compiled in** — `strings` on the installed
  fork's `wa-sqlite-async.wasm` shows fts5 symbols, and the shared search code in
  `packages/core/src/egw-db/book-database.ts` (`paragraphs_fts MATCH`, lines 857–873)
  already runs on web today. So strategy 2's FTS leg has no capability gap.
- All SQL runs inside one worker (`db-worker.ts` lines 108–155): `OPFSAdaptiveVFS`
  (requires readwrite-unsafe access handles) with `IDBBatchAtomicVFS` fallback. Every query
  crosses the procedure/postMessage boundary once; per-message overhead makes **one batched
  query per topic page** the right shape, not per-phrase chatter.
- Expect the browser numbers to be a low single-digit multiple slower than the native
  table above (async VFS round trips per page read; the IndexedDB fallback slower still) —
  the ~0.1–4 ms native range stays interactive even at 10x.
- Render-time phrase matching (strategy 2's other leg) touches no SQL at all — it runs on
  text already delivered to the UI, so wa-sqlite/OPFS imposes zero constraint on it. The
  automaton builds in ~1 ms and can live on the main thread or in the worker.
- Partial-library reality (web syncs books one at a time; desktop may lack books too)
  affects only _data presence_, which render-time matching handles for free: it matches
  whatever text is actually on screen.

## Recommendation

**Strategy 2 — match at render time.** Ship the alias dictionary (phrases → topic ids) in
the topics artifact, not spans. Build one Aho-Corasick automaton per dictionary load (~1 ms),
match per paragraph/verse over `Text`-segment text (~15 µs each, 0.4 ms per screenful),
apply leftmost-longest + first-occurrence-per-section filtering, and emit a new phrase-link
`TextSegment` variant / AST overlay. Use live FTS5 phrase queries (batched per topic page,
optionally cached) for the auto-mined "everywhere this appears" sections — warm native cost
0.1–4.3 ms against the full 614k-paragraph corpus, and the wa-sqlite fork already carries
FTS5. Precompute (strategy 1) is computationally cheap (~7.4 s/corpus) but buys nothing the
render path needs while coupling the artifact to per-book corpus revisions and breaking on
partial libraries.
