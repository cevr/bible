---
id: 009
title: Study-pane seam spec (Strong's, cross-refs, commentary, parallel EGW)
labels: [wayfinder:grilling]
status: open
assignee:
blocked-by: []
---

## Question

The richest half-built seam: `packages/core/src/bible-db/bible-database.ts` fully
implements Strong's entries, `verse_words` with Strong's mapping, cross-references,
margin notes, and reverse concordance — but no RPC in
`packages/core/src/procedure/group.ts` exposes any of it, and
`packages/app/src/reading/bible-reader.tsx` has no UI for it.
`docs/architecture/feature-parity.md` already lists "Verse and paragraph study" as
Required for both hosts.

Spec the seam (decisions, not code):

- **RPC family shape**: one `v1.study.*` group? Granularity (per-verse bundle vs
  per-resource calls)? What the parallel-EGW view needs (`paragraph_bible_refs` reverse
  lookup + `egw-commentary` service).
- **UI surface**: contextual study pane (the feature-parity doc's phrase) — per-verse
  tap? word-level tap for Strong's (`verse_words` has the mapping)? How it coexists with
  the wiki peek card so the two link layers don't fight (this is the one place this
  ticket touches the wiki layer).
- **Scope**: margin notes and Scripture comparison are in the parity doc's Required list
  but not in the charter v1 bar — in or out?
- v1 charter features this must cover: Strong's on tap, cross-refs, parallel EGW view.
