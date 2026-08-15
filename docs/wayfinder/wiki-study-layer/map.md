---
title: Wiki Study Layer
labels: [wayfinder:map]
tracker: local-markdown
---

# Wiki Study Layer

Local-markdown tracker conventions: tickets are files in [`tickets/`](tickets/).
A ticket's frontmatter carries `id`, `title`, `labels` (`wayfinder:research|prototype|grilling|task`),
`status` (`open|closed`), `assignee` (empty = unclaimed; set it to claim BEFORE working),
and `blocked-by` (ticket ids). A ticket is unblocked when every `blocked-by` id is closed.
The frontier = open + unblocked + unassigned. Resolutions are appended to the ticket body
under `## Resolution`, then `status: closed`, then one line added to Decisions-so-far here.

## Destination

A buildable spec for the wiki study layer of the EGW Reader app (web + desktop): every
decision locked — data model, content pipeline, navigation UX, rendering rules, the
study-pane seam, and a fast hybrid EGW search engine (natural + precise queries) — so
implementation sessions can build it in `packages/core` + `packages/app`
with no open questions. The spec is assembled by
[Assemble the buildable spec](tickets/012-assemble-spec.md).

## Notes

- Domain: bible-tools monorepo. KJV + EGW + pioneer writings, historic-SDA framing.
- Skills every session should consult: `grilling`, `domain-modeling` (HITL tickets),
  `prototype` (prototype tickets), `architecture`, `effect`, `bible` (source material).
- Standing preferences: Solid 2 + Effect v4; thin hosts over shared `@bible/app`;
  procedure-only transport; capability adapters; web/desktop parity is an enforced rule
  (`docs/architecture/feature-parity.md`). Personal-first, public-ready. Commit straight
  to main, never push without an ask, no branches.
- One ticket per session (research tickets excepted).
- Prior survey receipts live throughout the tickets; key seam: Strong's/cross-refs/
  commentary services are complete in `packages/core/src/bible-db/bible-database.ts` but
  have no RPC in `packages/core/src/procedure/group.ts` and no UI in `packages/app`.

## Decisions so far

Charter decisions (from the charting session, 2026-08-14 — no ticket, decided in-session):

- Destination is a buildable spec, not a working v1 — build happens after the map closes.
- The app is an evolution of the existing EGW Reader (`apps/desktop` + `apps/web` thin
  hosts over `@bible/app`), not a new app. Full web/desktop parity stands.
- Audience: personal-first, public-ready architecture; no accounts in v1.
- Topic pages are hybrid: authored core + auto-mined sections. Page anatomy is layered —
  short authored thesis up top, then structured expandable sections (key verses, EGW
  statements, pioneer witnesses, related topics).
- Phrase linking: curated phrase dictionary renders visible wiki links; any text selection
  can be looked up on demand as fallback. Aliases are workflow-generated, user-reviewed.
  Default rendering rule: first occurrence per section is hot.
- Corpus scope for the wiki layer: KJV + EGW + pioneer corpus, with graceful degradation
  over a partial local EGW library (undownloaded citations render as "get this book").
- Topics link topics — the dictionary applies inside topic pages too, plus an explicit
  related-topics section, so topics form a graph.
- v1 feature bar: full-text search (exists), Strong's on tap, cross-refs, parallel EGW
  view. Deferred: user annotations, reading plans (already exist app-wide; no wiki work).
- The EGW corpus gets a first-class hybrid search engine: natural-language and precise
  queries mixed in one box. Candidate approach: `tobi/qmd` (direct use or its design —
  hybrid lexical + embedding + rerank); resolved by
  [qmd evaluation for hybrid EGW search](tickets/013-qmd-evaluation.md) and
  [Hybrid search design](tickets/014-hybrid-search-design.md).
- Content pipeline: topic pages authored as markdown in-repo (Claude workflows produce,
  user reviews, git-diffable), compiled into a versioned digest-verified artifact shipped
  through the existing corpus-supply pipeline (`packages/core/src/corpus-supply/`).
- Wiki pages overlay the existing read-only topic catalog: matching catalog topics
  contribute an auto-mined references section; the catalog stays as the long-tail
  fallback so every catalog topic gets a landing page for free.

<!-- closed tickets append below: - [<title>](tickets/<file>) — <one-line gist> -->

- [Corpus-supply fit for a topics artifact](tickets/001-corpus-supply-fit.md) — clean
  fit as a second `bible.db`-style lifecycle (pinned digest manifest, atomic swap on both
  hosts); minimal new work is a markdown→`topics.db` compiler + manifest/verifier + enum
  widening + three composition-root wirings; adopt writings-style catch-and-warn, not
  Bible's fail-closed startup. Flags: file-artifact machinery is bible-branded (~600
  lines to generalize), and the compiled-in manifest pin ties content updates to app
  deploys — graduated to
  [Content release cadence](tickets/015-content-release-cadence.md).
- [qmd evaluation for hybrid EGW search](tickets/013-qmd-evaluation.md) — learnings-only:
  qmd (MIT) rides better-sqlite3 + sqlite-vec + node-llama-cpp, all Node-native, so
  direct use or fork fails web parity (wa-sqlite/OPFS cannot load native extensions).
  Its design transfers: RRF fusion, typed lex/vec/hyde expansion with strong-BM25
  short-circuit, position-aware rerank blending, per-vector model fingerprints — over
  `paragraphs_fts` + a flat quantized embeddings artifact (~26 MB int8 per 100k
  paragraphs, corpus-supply-shippable); browser query embedding via transformers.js on
  WebGPU (~100–400 ms class).
- [Phrase matching and live-query feasibility](tickets/002-phrase-matching-feasibility.md) —
  match at render time: Aho-Corasick over a 1,000-phrase dictionary costs ~15 µs per EGW
  paragraph (~0.4 ms per screenful, M4 Pro/Bun; web a small multiple slower), and warm
  FTS5 phrase queries over all 613,974 paragraphs run 0.1–4.3 ms (the web wa-sqlite fork
  has FTS5 compiled in). Precomputed spans lose: they break on partial libraries and
  per-book revisions and still need AST re-projection. Ship the alias dictionary in the
  artifact; use live batched FTS5 for auto-mined sections.
- [Pioneer corpus inventory](tickets/003-pioneer-corpus-inventory.md) — one supply
  channel: the EGW platform API. Local library already holds 111 pioneer works (of 648
  books); ~233 more pioneer books + 262 periodical volumes are downloadable; TRMC is
  actually platform book 1635 (mangled author), so the "manual import" channel is empty.
  Unobtainable: Hiram Edson's manuscript, Midnight Cry run, Snow beyond TRMC no. 1,
  Voice of Truth / Western Midnight Cry / Day-Star runs, prophetic charts. AST/FTS parity
  is full; caveat: `paragraph_bible_refs` is sparse (45 of 648 books) — verse-linking
  cannot rely on it alone.

## Not yet specified

- Public deployment shape: hosting the web app publicly, where artifacts are served from,
  when "public-ready" actually gets exercised.
- Wiki pages in global search: whether/how topic pages join the FTS surface (depends on
  the artifact schema).
- AI-assisted linking beyond the curated dictionary: suggested topics, auto-detected
  phrases, "what should be a topic next" mining.
- Fate of the existing `/topics` route UX once the overlay lands (merge, redirect, keep).

## Out of scope

- User annotations and reading plans for v1 of the wiki layer — deferred by charter;
  the app's existing annotation features continue untouched.
- Additional Bible translations — the vision is KJV-only (the `versions` table's
  generality notwithstanding).
- Breaking web/desktop parity for any wiki feature.
