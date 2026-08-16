---
id: 012
title: Assemble the buildable spec
labels: [wayfinder:task]
status: closed
assignee: fable-main
blocked-by: [004, 005, 006, 007, 008, 009, 010, 011, 014, 015]
---

## Question

The destination. Synthesize every closed ticket's resolution into one buildable spec
document: domain model + artifact schema, content pipeline and authoring workflow,
phrase dictionary + rendering rules, navigation UX (peek/full/panes verdict), auto-mined
section composition with partial-corpus behavior, select-to-lookup design, study-pane
RPC + UI seam, and the hybrid search architecture — sequenced into implementation
milestones (each independently shippable, gate-green, parity-preserving).

The spec must apply the
[three-client compatibility contract](../client-compatibility.md) to every
milestone. It must list core tests, three adapter checks, three builds, and one
CLI JSON workflow. It must separate web/desktop UI parity from three-client
domain parity.

The spec lives in `docs/architecture/` and supersedes nothing — it references the map
for decision provenance. Closing this ticket closes the map.

## Resolution

_Resolved 2026-08-16 by fable-main under the standing goal, per never-block-on-the-human.
Closing this ticket closes the map._

**The spec is written: [`docs/architecture/wiki-study-layer.md`](../../../architecture/wiki-study-layer.md)**
(1,089 lines). It synthesizes every closed ticket's resolution into: vocabulary; domain
model + full `topics.db` DDL; content pipeline (authoring → citation-verified compile →
corpus-supply lifecycle → hybrid release cadence); phrase dictionary + rendering rules;
Mode-A navigation; auto-mined section composition; select-to-lookup; study-pane seam;
hybrid search architecture; **nine implementation milestones**, each independently
shippable and gate-green, each carrying the three-client contract's core tests, three
adapter checks, three builds, and one CLI JSON workflow, with UI parity tracked
separately from domain parity; future-work list; open implementation details;
provenance table back to these tickets.

**Spec-assembly addenda — facts found while grounding the spec in real code, and the
stances taken (each user-overridable):**

1. **`v1.wiki.*` collides with the existing `v1.topics.*`** (`procedure/group.ts:198,206`
   already serves the catalog via `TopicService`). No resolution anticipated this.
   Stance taken in spec §2.5: `WikiService` **composes over** `TopicService`; both RPC
   families remain. If one family is wanted instead, §2.5 re-cuts.
2. **Ticket 008 assumed FTS scope + rank order that the code lacks**:
   `searchParagraphs` (`egw-db/book-database.ts:209-220`) has no `ORDER BY rank` and no
   author/corpus scope. Recorded as spec §6.4; delivery assigned to Milestone 3.
3. **The `paragraph_bible_refs` sparseness figure (45/648) predates the 2026-08-15
   sync** (now 1,486 books). The spec cites it as a dated snapshot figure; current
   sparseness is unmeasured.
4. **Milestone 1 (generalize the bible-branded artifact machinery) is the spec's own
   sequencing** — ticket 001 flagged the work but no ticket scheduled it; it goes first
   because Milestones 2 and 8 both add file artifacts.
5. `CorpusName` widening touches five sites, not the four research 001 listed (the
   `Target` constructor at `local-first/model.ts:107` is the fifth).
