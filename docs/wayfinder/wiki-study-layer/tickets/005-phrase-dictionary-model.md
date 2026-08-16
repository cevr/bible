---
id: 005
title: Phrase dictionary model and rendering rules
labels: [wayfinder:grilling]
status: closed
assignee: fable-main
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

The matcher, normalization, overlap result, and segment identity are portable
core values. Solid renders interactive links. CLI output can expose the same
matches without importing the UI.

## Resolution

_Resolved 2026-08-16 by fable-main under the standing goal, per never-block-on-the-human.
Reversible on review._

**Matching point: render-time, dictionary in the artifact** — locked by
[Phrase matching and live-query feasibility](002-phrase-matching-feasibility.md)
(Aho-Corasick ~15 µs/paragraph; precomputed spans lose on partial libraries and
revisions). One portable matcher in `@bible/core` builds the automaton once per
dictionary load and emits host-neutral `PhraseSpan` values; Solid renders them as
links, the CLI can print the same matches (`bible wiki matches <text> --json`).

**Alias model.** Each topic's markdown frontmatter carries `aliases:` — canonical
phrase + variants (KJV wording like "two thousand and three hundred days", EGW
variants). The compiler flattens all approved topics' aliases into one dictionary table
(alias → slug). Normalization: case-insensitive, whitespace-collapsed, soft punctuation
(commas, semicolons) transparent, matches only on word boundaries. An alias claimed by
two topics is a **compile-time error** — no runtime ambiguity.

**Overlap resolution.** Longest match wins at the same start ("heavenly sanctuary"
beats "sanctuary"); a span that starts inside an emitted span is suppressed for that
occurrence. The suppressed phrase is not penalized page-wide — its next clean
occurrence is still eligible (see the scope rule).

**Rendering rules.**

- **Per-phrase first occurrence per section is hot** — the prototype
  ([navigation ticket](006-navigation-prototype.md)) proved the charter's literal
  one-link-per-section reading wrong (_little horn_ starved _pleasant land_ in Dan 8).
  Each distinct phrase gets its first clean occurrence per section.
- **"Section" defined:** Bible = the chapter; EGW = the chapter/reading unit as
  rendered; topic pages = each layered section of the page.
- **Boundary rule:** a phrase span never crosses segment boundaries
  (`packages/core/src/bible-rendering/segments.ts`) and never enters
  `ScriptureRef`/`BookRef` AST nodes (`packages/core/src/egw/ast.ts`) — those nodes
  already have link semantics.
- **Styling restraint:** hot phrases render as a muted dotted underline taking the text
  color — no blue soup; hover/tap raises the peek card per the navigation decision.

**Authoring loop.** The authoring workflow generates alias candidates into the topic
file's frontmatter; the user reviews them as a git diff of that file
([Authoring workflow spec](010-authoring-workflow.md) owns the loop). No separate
dictionary file to drift — the dictionary is compiled from the same reviewed sources.
