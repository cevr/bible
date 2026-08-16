---
id: 009
title: Study-pane seam spec (Strong's, cross-refs, commentary, parallel EGW)
labels: [wayfinder:grilling]
status: closed
assignee: fable-main
blocked-by: []
---

## Question

The richest half-built seam: `packages/core/src/bible-db/bible-database.ts` fully
implements Strong's entries, `verse_words` with Strong's mapping, cross-references,
margin notes, and reverse concordance — but no RPC in
`packages/core/src/procedure/group.ts` exposes any of it, and
`packages/app/src/reading/bible-reader.tsx` has no UI for it.
`docs/architecture/feature-parity.md` already lists "Verse and paragraph study" as
Required for both visual hosts. Its domain operations also require CLI access.

Spec the seam (decisions, not code):

- **RPC family shape**: one `v1.study.*` group? Granularity (per-verse bundle vs
  per-resource calls)? What the parallel-EGW view needs (`paragraph_bible_refs` reverse
  lookup + `egw-commentary` service). Heads-up from
  [Pioneer corpus inventory](../research/003-pioneer-inventory.md): `paragraph_bible_refs`
  is populated for only 45 of 648 local books — the parallel-EGW view needs a plan for
  the sparse case (FTS fallback? ref extraction pass?).
- **UI surface**: contextual study pane (the feature-parity doc's phrase) — per-verse
  tap? word-level tap for Strong's (`verse_words` has the mapping)? How it coexists with
  the wiki peek card so the two link layers don't fight (this is the one place this
  ticket touches the wiki layer).
- **Scope**: margin notes and Scripture comparison are in the parity doc's Required list
  but not in the charter v1 bar — in or out?
- v1 charter features this must cover: Strong's on tap, cross-refs, parallel EGW view.

Specify one portable study service. Procedure handlers expose it to web and
desktop. CLI commands call it directly and keep stable JSON output. The pane is
UI-only. Its query and result models are not UI-only.

## Resolution

_Resolved 2026-08-16 by fable-main under the standing goal, per never-block-on-the-human:
recommended options adopted. Reversible on review._

**RPC shape — one bundle.** `v1.study.verse.get(ref)` returns, in one MessagePort
round-trip: the verse's words with Strong's numbers (`verse_words`), classified
cross-references, margin notes, commentary entries, and parallel writings. A second RPC
`v1.study.strongs.get(number)` serves word-tap lexicon + reverse concordance. The pane
always wants the whole bundle and it is small; granular per-resource RPCs buy nothing
but chatter. Both are backed by one portable `StudyService` in core; CLI commands
(`bible study verse "Dan 8:13" --json`, `bible study strongs H8548 --json`) call it
directly with stable JSON.

**Scope.** Margin notes **in** (the data ships already; zero marginal cost). Scripture
comparison **out** of this seam — the parity doc lists it but the charter v1 bar does
not; it gets its own ticket if wanted later.

**Parallel-EGW sparseness.** v1 rides `paragraph_bible_refs` + the EGW Bible Commentary,
accepting the documented sparseness (45/648 books, per
[Pioneer corpus inventory](003-pioneer-corpus-inventory.md)); the FTS-mined wiki
sections are the broad net. A reference-extraction backfill pass is recorded as future
work, not v1.

**UI coexistence rule.** Verse tap opens the study pane; wiki phrase tap opens the peek
card. The two link layers never claim the same gesture: phrases are inline spans, the
verse surface owns the tap outside a phrase span.
