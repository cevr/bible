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

## Not yet specified

- Public deployment shape: hosting the web app publicly, where artifacts are served from,
  when "public-ready" actually gets exercised.
- Wiki pages in global search: whether/how topic pages join the FTS surface (depends on
  the artifact schema).
- AI-assisted linking beyond the curated dictionary: suggested topics, auto-detected
  phrases, "what should be a topic next" mining.
- Fate of the existing `/topics` route UX once the overlay lands (merge, redirect, keep).
- Embeddings distribution for hybrid search: index size, on-device inference for query
  embedding (desktop vs browser worker), whether an embeddings artifact ships through
  corpus-supply like `bible.db` (sharpens after the qmd evaluation closes).
- Topic content release cadence and how in-app update prompts work (remnant after
  [Corpus-supply fit for a topics artifact](tickets/001-corpus-supply-fit.md) closes).

## Out of scope

- User annotations and reading plans for v1 of the wiki layer — deferred by charter;
  the app's existing annotation features continue untouched.
- Additional Bible translations — the vision is KJV-only (the `versions` table's
  generality notwithstanding).
- Breaking web/desktop parity for any wiki feature.
