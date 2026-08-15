---
id: 015
title: Content release cadence
labels: [wayfinder:grilling]
status: open
assignee:
blocked-by: []
---

## Question

The charter wants topic content updates decoupled from app releases. The
[corpus-supply research](../research/001-corpus-supply-fit.md) found the artifact
manifest pin (URL + revision + size + SHA-256) lives in compiled code — so as built,
new topic content ships only when the app ships.

Decide: (a) accept ride-along cadence for v1 (content updates = app updates; simplest,
and the artifact machinery stays untouched); (b) runtime-fetched manifest — the app
checks a stable manifest URL, verifies digests, and offers/installs updates in-app
(defines a small trust surface: who signs the manifest, offline behavior, update
prompts); (c) hybrid — compiled-in pin as the floor, optional runtime check on top.

Also settle where releases live (GitHub release per content version, like
`bible-artifact.ts` pins today) and what the user-facing update affordance is on each
host. Feeds [Assemble the buildable spec](012-assemble-spec.md).
