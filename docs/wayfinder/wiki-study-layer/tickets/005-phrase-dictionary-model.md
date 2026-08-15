---
id: 005
title: Phrase dictionary model and rendering rules
labels: [wayfinder:grilling]
status: open
assignee:
blocked-by: [002, 004]
---

## Question

Decide how the curated phrase dictionary is structured and how hot phrases render.

- **Alias model**: canonical phrase + variants (KJV wording like "two thousand and three
  hundred days", EGW variants), case/punctuation normalization, overlap resolution when
  two topics' phrases collide or nest ("sanctuary" inside "heavenly sanctuary").
- **Matching point**: precomputed spans in the artifact vs render-time matching — decided
  on the facts from [Phrase matching and live-query feasibility](002-phrase-matching-feasibility.md).
- **Rendering rules**: first-occurrence-per-section is the charter default — define
  "section" precisely for Bible chapters (paragraph? pericope?) and EGW pages; how links
  interact with existing segment types (`packages/core/src/bible-rendering/segments.ts`)
  and EGW AST nodes (`packages/core/src/egw/ast.ts` — a phrase span must not cross a
  `ScriptureRef`/`BookRef` node); link styling restraint (no blue soup).
- **Dictionary authoring loop**: workflow generates aliases, user reviews — file format
  and where review happens (git diff of the markdown source, per charter).
