---
id: 006
title: Topic page and rabbit-hole navigation prototype
labels: [wayfinder:prototype]
status: open
assignee:
blocked-by: []
---

## Question

Raise the fidelity of the navigation discussion with a throwaway prototype (use the
`prototype` skill; fake data is fine). Questions the artifact must let the user react to:

- **Peek card**: hover/tap a hot phrase → card with the topic's thesis paragraph +
  click-through. What's on the card besides the thesis? How does it behave on touch?
- **Full topic page**: the layered anatomy — thesis up top, expandable sections (key
  verses, EGW statements, pioneer witnesses, related topics). Does it read well arriving
  mid-rabbit-hole?
- **Sliding panes** (Andy Matuschak-style stacked panes) vs plain navigation + back:
  charter deferred this to prototype judgment. Try it on dense scripture text and a
  narrow viewport before deciding.
- How the rabbit-hole trail is kept/shown (breadcrumb? history stack? panes themselves?).

Existing UI context: Solid 2, `@bible/app` primitives (split panes, popover, command
palette) in `packages/app/src/`. The prototype is throwaway — do not wire it into the
app. Resolution = the navigation decisions, with the prototype linked as an asset.
