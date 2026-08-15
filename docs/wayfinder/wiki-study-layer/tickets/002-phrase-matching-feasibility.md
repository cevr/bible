---
id: 002
title: Phrase matching and live-query feasibility
labels: [wayfinder:research]
status: open
assignee:
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
