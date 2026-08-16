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

A buildable spec for the wiki study layer of the EGW Reader app and CLI: every
decision locked — data model, content pipeline, navigation UX, rendering rules, the
study-pane seam, and a fast hybrid EGW search engine (natural + precise queries) — so
implementation sessions can build one portable domain in `packages/core`, the shared
web/desktop UI in `packages/app`, and thin CLI commands with no open questions. Every
ticket inherits the [three-client compatibility contract](client-compatibility.md).
The spec is assembled by
[Assemble the buildable spec](tickets/012-assemble-spec.md).

## Notes

- Domain: bible-tools monorepo. KJV + EGW + pioneer writings, historic-SDA framing.
- Skills every session should consult: `grilling`, `domain-modeling` (HITL tickets),
  `prototype` (prototype tickets), `architecture`, `effect`, `bible` (source material).
- Standing preferences: Solid 2 + Effect v4; thin hosts over shared `@bible/app`;
  procedure-only GUI transport; direct CLI access to the same core services; capability
  adapters; web/desktop UI parity and web/desktop/CLI core parity are enforced rules
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
  hosts over `@bible/app`), not a new app. Full web/desktop UI parity stands. The CLI
  uses the same core domain and storage contracts through direct commands.
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
  WebGPU (~100–400 ms class). Native query embedding is an adapter for desktop and CLI.
- [Phrase matching and live-query feasibility](tickets/002-phrase-matching-feasibility.md) —
  match at render time: Aho-Corasick over a 1,000-phrase dictionary costs ~15 µs per EGW
  paragraph (~0.4 ms per screenful, M4 Pro/Bun; web a small multiple slower), and warm
  FTS5 phrase queries over all 613,974 paragraphs run 0.1–4.3 ms (the web wa-sqlite fork
  has FTS5 compiled in). Precomputed spans lose: they break on partial libraries and
  per-book revisions and still need AST re-projection. Ship the alias dictionary in the
  artifact; use live batched FTS5 for auto-mined sections.
- [Pioneer corpus inventory](tickets/003-pioneer-corpus-inventory.md) — one supply
  channel: the EGW platform API. The 2026-08-14 snapshot held 648 local books. The
  2026-08-15 post-sync database holds 1,486 books and 3,012,004 paragraphs, so the old
  remote-only counts no longer describe the local corpus. TRMC is actually platform
  book 1635 (mangled author), so the "manual import" channel is empty.
  Unobtainable: Hiram Edson's manuscript, Midnight Cry run, Snow beyond TRMC no. 1,
  Voice of Truth / Western Midnight Cry / Day-Star runs, prophetic charts. AST/FTS parity
  is full; caveat: `paragraph_bible_refs` is sparse (45 of 648 books) — verse-linking
  cannot rely on it alone.
- [Wiki domain model](tickets/004-wiki-domain-model.md) — artifact stores flagship
  content only (authored cores as portable AST, phrase dictionary, authored edges,
  backlinks, overlay keying); catalog long tail assembled live via the same section
  composer; one `WikiService` in core, `v1.wiki.*` RPCs, `bible wiki *` CLI; overlay
  keying resolved at compile time with name-match fallback.
- [Topic page and rabbit-hole navigation prototype](tickets/006-navigation-prototype.md) —
  Mode A adopted (peek card + breadcrumb trail, bottom-sheet on narrow); sliding panes
  rejected on measured geometry (two-legible-pane desktop ceiling). Per-phrase hot-link
  scope rule forwarded to the phrase dictionary ticket.
- [Select-to-lookup fallback design](tickets/007-select-to-lookup.md) — one combined
  panel fed by `LookupService.resolve` typed resolver groups in core; CLI
  `bible wiki lookup`; no lookup persistence in v1.
- [Study-pane seam spec](tickets/009-study-pane-seam.md) — one bundle RPC
  `v1.study.verse.get` + `v1.study.strongs.get` over a portable `StudyService`; margin
  notes in, Scripture comparison out; parallel-EGW accepts `paragraph_bible_refs`
  sparseness for v1; phrase spans and verse taps never share a gesture.
- [Hybrid search design](tickets/014-hybrid-search-design.md) — learnings-only engine;
  EGW-scope ~246 MB int8 optional vector artifact; automatic routing (quotes/refcode/
  wordy) with strong-BM25 short-circuit; RRF k=60, no rerank v1; topics as a pinned
  group; EmbeddingGemma-300M 256-d fingerprint; golden-query acceptance across clients.
- [Content release cadence](tickets/015-content-release-cadence.md) — hybrid: compiled
  pin as offline floor + runtime GitHub-releases manifest check for content-only
  updates; toast/settings on visual hosts, `bible topics status|update` on CLI; schema
  changes ride app releases.
- [Phrase dictionary model and rendering rules](tickets/005-phrase-dictionary-model.md) —
  render-time Aho-Corasick over frontmatter-authored aliases; longest-match-wins
  overlap; **per-phrase** first-occurrence-per-section hot rule (section = chapter /
  reading unit / page section); spans never cross segments or ref nodes; muted dotted
  underline styling; duplicate alias = compile error.
- [Auto-mined section composition](tickets/008-auto-mined-sections.md) — all sections
  live-queried through one core composer; lineup key verses (default-open, cap 8) →
  EGW statements (cap 5) → commentary (cap 5) → pioneer witnesses (cap 5) →
  cross-refs (cap 10) → related topics; long tail = search handoff; uninstalled hits
  render refcode + "get this book" wired to the download RPC.
- [Authoring workflow spec](tickets/010-authoring-workflow.md) — sources in
  `content/topics/*.md` with `status: draft|approved` frontmatter; batched Claude
  workflow drafts from `bible egw study --pioneers` corpora; compiler verifies every
  citation against the local DB and fails on miss; `bun run build:topics` emits
  `topics.db` + manifest.
- [Flagship topic list v1](tickets/011-flagship-topic-list.md) — the mined top-40 cut
  adopted; 40 draft stubs committed at `content/topics/*.md` with candidate aliases
  (noise-flagged aliases excluded), initial related edges, and Nave's catalog
  overrides; all inert until each page is reviewed and flipped to `approved`.
- [Assemble the buildable spec](tickets/012-assemble-spec.md) — **the destination,
  reached**: [`docs/architecture/wiki-study-layer.md`](../../architecture/wiki-study-layer.md)
  synthesizes every resolution into the domain model, pipeline, rendering, navigation,
  lookup, study-pane, and hybrid-search designs plus nine gate-green milestones each
  carrying the three-client contract; five grounding addenda recorded on the ticket
  (`v1.wiki.*`/`v1.topics.*` composition stance, FTS scope gap, stale sparseness
  figure, Milestone-1 sequencing, fifth enum site).

**Map closed 2026-08-16.** No open tickets remain. Round-A/B and later resolutions
were adopted by the agent under the standing goal ("complete the wayfinder"), per
never-block-on-the-human — each is marked in its ticket and reversible; overriding one
re-cuts the affected spec section.

## Not yet specified

The remaining fog never sharpened before the destination was reached; each item is
carried in the spec's [future-work list](../../architecture/wiki-study-layer.md) so it
survives the map's closure:

- Public deployment shape: hosting the web app publicly, where artifacts are served from,
  when "public-ready" actually gets exercised.
- AI-assisted linking beyond the curated dictionary: suggested topics, auto-detected
  phrases, "what should be a topic next" mining.
- Fate of the existing `/topics` route UX once the overlay lands (merge, redirect, keep).

## Out of scope

- User annotations and reading plans for v1 of the wiki layer — deferred by charter;
  the app's existing annotation features continue untouched.
- Additional Bible translations — the vision is KJV-only (the `versions` table's
  generality notwithstanding).
- Breaking web/desktop UI parity or web/desktop/CLI core parity for any wiki feature.
