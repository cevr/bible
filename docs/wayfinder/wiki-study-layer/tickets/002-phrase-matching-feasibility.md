---
id: 002
title: Phrase matching and live-query feasibility
labels: [wayfinder:research]
status: closed
assignee: research-agent
blocked-by: []
---

## Question

The phrase dictionary must render curated phrases as links inside KJV verses and EGW
paragraphs (first occurrence per section), on both desktop (better-sqlite3) and web
(wa-sqlite over OPFS in a worker). Two candidate strategies:

1. **Precompute at artifact build time**: match every dictionary phrase against the
   corpus offline; ship match spans (verse/paragraph → [start, end, topic] spans) in the
   topics artifact. Deterministic, zero runtime cost, but spans must survive corpus
   updates and partial EGW libraries.
2. **Match at render time**: multi-phrase matching (Aho-Corasick or similar) over the
   text of whatever is on screen, against a dictionary of ~50 topics × N aliases.

Gather the facts a decision needs: (a) realistic dictionary size (topics × aliases);
(b) render-time matching cost for that size on paragraph-sized text (benchmark a quick
Aho-Corasick or regex-alternation implementation in Bun); (c) FTS5 phrase-query
performance in the existing DBs for the auto-mined "everywhere this appears" sections —
benchmark against local `~/.bible/bible.db` and `~/.bible/egw-paragraphs.db` if present;
(d) any wa-sqlite/OPFS-specific constraints (read `apps/web/src/workers/`).

Relevant existing machinery: `packages/core/src/bible-rendering/segments.ts` (segment
model, `applySearchHighlights`, phrase-anchored margin notes), EGW AST in
`packages/core/src/egw/ast.ts` (`nodes_json` — matching must respect node boundaries).
Write findings to `docs/wayfinder/wiki-study-layer/research/002-phrase-matching.md`.

## Resolution

Match at render time (strategy 2). A realistic v1 dictionary is 250–400 phrases (~50
topics × 4–8 aliases); a naive JS Aho-Corasick automaton over even 1,000 phrases builds in
~1 ms and matches an EGW paragraph in ~15 µs — a 30-paragraph screenful costs 0.38 ms
(M4 Pro, Bun 1.4.0). Live FTS5 phrase queries power the auto-mined sections: warm counts
run 0.1–4.3 ms against the full 614k-paragraph `paragraphs_fts`, top-50 with snippet
≤2.2 ms, cold ~12 ms; the cevr wa-sqlite fork used on web has FTS5 compiled in and already
serves `paragraphs_fts MATCH` today. Precompute (strategy 1) is cheap to run (~7.4 s per
full corpus) but ships spans that break on partial EGW libraries and per-book revisions,
and its offsets still need AST re-projection at render time — no win. Full numbers and
receipts: [research/002-phrase-matching.md](../research/002-phrase-matching.md).
