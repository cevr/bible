---
id: 011
title: Flagship topic list v1
labels: [wayfinder:task]
status: closed
assignee: fable-main
blocked-by: [005, 010]
---

## Question

Pick the initial ~30–50 flagship topics that get authored cores, with their aliases.
This is a task, not a decision-from-nothing: generate candidates mechanically (catalog
topic frequency, phrase frequency across the EGW corpus, the user's existing teaching
docs in `packages/cli/outputs/teachings/` and studies — sanctuary, 2300 days, latter
rain, Eastern Question, etc. are obvious seeds), then the user curates the list.

Resolution = the approved list committed in whatever source format
[Authoring workflow spec](010-authoring-workflow.md) defined, each topic with its
reviewed alias set per [Phrase dictionary model](005-phrase-dictionary-model.md).

The approved source and compiled topic identity are client-neutral. No flagship
topic can require a host-only field.

## Resolution

_Resolved 2026-08-16 by fable-main under the standing goal, per never-block-on-the-human.
The list is fully reversible: every stub is `status: draft`, which by
[the authoring workflow](010-authoring-workflow.md) compiles to nothing — deleting or
editing a stub before approval costs zero._

**The flagship v1 list is the recommended top-40 cut** from the mined evidence
([flagship topic candidates](../research/011-topic-candidates.md)) — ranked by the
user's own teaching material, catalog reference weight, and corpus phrase frequency.
Committed as 40 draft stubs in **`content/topics/*.md`** in the ticket-010 source
format: slug, title, `status: draft`, alias candidates from the observed-alias FTS
probes, initial related-topic edges, and `catalog:` overrides where Nave's names an
exact match (JUDGMENT, DEATH, SEAL, ROME, BABYLON, TEMPERANCE, LAW, COVENANT,
ATONEMENT, INTERCESSION).

The list: sanctuary, sabbath, three-angels-messages, great-controversy, 2300-days,
investigative-judgment, second-coming, righteousness-by-faith, state-of-the-dead,
latter-rain, loud-cry, mark-of-the-beast, seal-of-god, sunday-law, papacy, babylon,
little-horn, the-daily, seven-trumpets, eastern-question, king-of-the-north, michael,
seven-times-2520, 1260-years, seventy-weeks, day-year-principle, midnight-cry,
advent-movement, shut-door, spirit-of-prophecy, present-truth, health-reform,
law-of-god, two-covenants, atonement, christ-our-high-priest, time-of-trouble,
seven-last-plagues, close-of-probation, 144000.

**Noise-flagged aliases were excluded** per the research's curation notes (bare
`judgment`, bare `Babylon`, `1843`, `the bridegroom`), with the exclusion recorded as a
comment in the affected stub; `the daily` and `seven times` carry context-restriction
notes for the ticket-005 matcher. Alias sets are marked as workflow candidates pending
user review — review happens on the same git diff that approves each page.
