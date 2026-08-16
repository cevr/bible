---
id: 007
title: Select-to-lookup fallback design
labels: [wayfinder:grilling]
status: closed
assignee: fable-main
blocked-by: []
---

## Question

Charter: curated phrases render as visible links, but any text selection can be looked up
on demand. Define that fallback: what does selecting "the daily" in Daniel 8 offer?

- Which resolvers run on a selection: FTS search (Bible + EGW), Strong's (via
  `verse_words` mapping when the selection is inside a verse), topic-dictionary fuzzy
  match, catalog topical index?
- One combined lookup panel vs a menu of actions ("Search EGW", "Strong's", "Topics")?
- Where results render (the study pane from
  [Study-pane seam spec](009-study-pane-seam.md)? the peek card surface from
  [the navigation prototype](006-navigation-prototype.md)?).
- Does a successful lookup leave a trail (recently looked up, promote-to-topic-candidate
  signal for future authoring)?

Define selection as a portable lookup input. The web and desktop build it from
selected text. The CLI accepts the same text as an argument and returns the
same resolver groups in stable JSON.

## Resolution

_Resolved 2026-08-16 by fable-main under the standing goal, per never-block-on-the-human:
recommended option adopted. Reversible on review._

**One combined panel, resolver groups in core.** `LookupService.resolve({text, context?})`
in `@bible/core` returns typed resolver groups: topic matches (dictionary + fuzzy),
Strong's (via `verse_words` when `context` locates the selection inside a verse), Bible
FTS hits, EGW FTS hits, and catalog topical-index entries. Selection is a **portable
lookup input** — web/desktop build it from the DOM selection plus reading context; the
CLI accepts the same text as an argument: `bible wiki lookup "<text>"
[--context "Dan 8:13"] --json`, returning the same groups in stable JSON.

**Rendering:** one combined panel in the study-pane surface
([Study-pane seam spec](009-study-pane-seam.md)); a lone topic hit gets the peek-card
treatment from [the navigation decision](006-navigation-prototype.md). No action menu —
the panel shows all groups, empty groups collapsed.

**No persistence in v1.** No lookup history and no promote-to-topic-candidate store;
the AI-assisted-linking fog item owns that trail when it graduates.
