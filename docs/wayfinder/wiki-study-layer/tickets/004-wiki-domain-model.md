---
id: 004
title: Wiki domain model
labels: [wayfinder:grilling]
status: open
assignee:
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
  `packages/core/src/procedure/group.ts`.

Charter constraints: layered page anatomy; overlay model (catalog = long-tail fallback);
markdown → corpus-supply artifact pipeline (fit documented by
[Corpus-supply fit for a topics artifact](001-corpus-supply-fit.md)).
