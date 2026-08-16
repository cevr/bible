---
id: 006
title: Topic page and rabbit-hole navigation prototype
labels: [wayfinder:prototype]
status: closed
assignee: fable-main
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

This is a web/desktop UI ticket. CLI pane, hover, and touch parity do not apply.
The prototype must still consume host-neutral topic identities and navigation
targets from core. Any topic read operation must have a direct CLI form.

## Resolution

_Resolved 2026-08-16 by fable-main under the standing goal, per never-block-on-the-human:
the prototype's evidence made the recommendation one-sided. Reversible on review._

**Adopt Mode A — peek card + full navigation + breadcrumb trail — and reject sliding
panes.** On narrow viewports the peek card becomes a bottom sheet; the model otherwise
needs no change anywhere. Prototype (the decision asset): `prototypes/rabbit-hole/`
(`bun install && bun run dev` → http://localhost:5199, `?mode=A` / `?mode=B`).

Evidence from building and measuring both modes:

- **Sliding panes underdeliver their own promise.** Collapsed-pane spines cost 44 px
  each; at 1440 px with five hops open only ~1.7 panes stay legible, and dense scripture
  wants ~460 px per pane — the honest desktop ceiling is **two** readable panes plus a
  rail. Below ~620 px the model breaks outright and needs a Mode-A fallback anyway.
- **Panes lose random access.** Mode A's breadcrumb jumps from hop 5 straight to hop 1;
  Mode B can only pop or hit a visible spine.
- One navigation model across web and desktop; no per-viewport model swap; the
  breadcrumb gives the trail cheaper than panes do. No desktop-only pane setting — a
  second navigation model is permanent UI-parity surface for a payoff the geometry
  disproves.

**Peek card contents:** topic title + thesis paragraph + click-through; nothing else on
the card. **Trail:** a breadcrumb history stack of hops, tap-to-jump, cleared on leaving
the wiki surface.

**Findings forwarded elsewhere:**

- Layered anatomy reads well arriving mid-rabbit-hole **only with "Key verses"
  defaulting open**; fully collapsed it reads as a table of contents. The thesis carries
  the arrival. (→ rendering rules in the spec.)
- The charter's "first occurrence per section is hot" rule, literally implemented,
  killed _pleasant land_ in Daniel 8:9 because _little horn_ took the section's slot —
  the rule must be scoped **per phrase**. (→
  [Phrase dictionary model](005-phrase-dictionary-model.md).)
