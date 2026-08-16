---
id: 004
title: Wiki domain model
labels: [wayfinder:grilling]
status: closed
assignee: fable-main
blocked-by: [001]
---

## Question

Define the wiki layer's domain model and artifact schema. A grilling + domain-modeling
session (update `CONTEXT.md` as terms crystallise) covering:

- The **topic page entity**: identity (slug), authored core, sections, status
  (flagship/authored vs catalog-only landing page).
- **Artifact tables** for the compiled `topics` artifact: topics, authored content
  (rendered markdown? AST?), phrase dictionary + aliases, related-topic edges,
  precomputed appearance/backlink data (informed by whatever
  [Phrase matching and live-query feasibility](002-phrase-matching-feasibility.md)
  found, but the schema decision may precede the render-rule decision).
- **Overlay keying** to the existing catalog (`topics`/`topic_sections`/
  `topic_references` in `packages/core/src/bible-db/schema.ts:81-100`): how a wiki slug
  matches a catalog topic, what happens on ambiguity, whether catalog ids are stable
  across `bible.db` releases.
- **The graph**: related-topics edges — authored, mined, or both; backlink semantics.
- Service surface: what a `WikiService` (name TBD) exposes; which new RPCs join
  `packages/core/src/procedure/group.ts`; which CLI commands call the same service
  directly and expose stable JSON.

Charter constraints: layered page anatomy; overlay model (catalog = long-tail fallback);
markdown → corpus-supply artifact pipeline (fit documented by
[Corpus-supply fit for a topics artifact](001-corpus-supply-fit.md)).
The model and service must follow the
[three-client compatibility contract](../client-compatibility.md).

## Resolution

_Resolved 2026-08-16 by fable-main under the standing goal ("complete the wayfinder"),
per the never-block-on-the-human principle: the recommended options from the Round-A
decision package are adopted. Every point is reversible — override any of it and the
dependent tickets/spec get re-cut._

**What the artifact stores — flagship content only.** The compiled `topics` artifact
carries: authored cores as a compiled **portable AST** (never HTML — the CLI must
text-render per the three-client contract), the phrase dictionary with aliases, authored
related-topic edges, compile-derived backlinks between flagship pages, and the
catalog-overlay keying table. Landing pages for the catalog long tail are **assembled
live** from catalog data + batched FTS5 (proven 0.1–4.3 ms warm by
[Phrase matching and live-query feasibility](002-phrase-matching-feasibility.md)).
Live assembly is the same code path flagship pages use for their auto-mined sections, so
there is one section composer, the artifact stays small and stable, and partial-corpus
honesty ("get this book") falls out for free.

**Topic page entity.** Identity is the **slug**. Status is `flagship` (authored core in
the artifact) or `catalog` (live-assembled landing page). Page anatomy is the charter's
layered form: thesis, then expandable sections (key verses, EGW statements, pioneer
witnesses, related topics).

**Overlay keying.** Resolved at **compile time**: the topics compiler pins the
`bible.db` release it matched against and records catalog-topic id ↔ wiki slug pairs in
the keying table. At runtime, if the installed `bible.db` revision differs from the
compile pin, the reader falls back to case-insensitive name matching and logs the drift;
ambiguity (two catalog topics, one slug) is a compile-time error, never a runtime guess.

**The graph.** Related-topic edges are **authored** (explicit in the topic markdown)
plus **rendered** links from dictionary hits inside topic bodies. Backlinks are
compile-derived for flagship→flagship edges and live-computed for catalog pages.

**Service surface.** One `WikiService` in `@bible/core`:
`topic(slug)` (the composed layered page — authored core + assembled sections),
`list(query?)`, `dictionary()` (the phrase dictionary for client-side render-time
matching). RPCs: `v1.wiki.topic.get`, `v1.wiki.topics.list`, `v1.wiki.dictionary.get`.
CLI: `bible wiki topic <slug> --json`, `bible wiki topics`. Section composition lives in
core, per the [three-client compatibility contract](../client-compatibility.md).
