---
id: 015
title: Content release cadence
labels: [wayfinder:grilling]
status: closed
assignee: fable-main
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
client. Web and desktop can show an update prompt. CLI must offer an explicit status and
update command with stable JSON and no hidden mutation. Feeds
[Assemble the buildable spec](012-assemble-spec.md).

## Resolution

_Resolved 2026-08-16 by fable-main under the standing goal, per never-block-on-the-human:
recommended option adopted. Reversible on review._

**(c) Hybrid.** The compiled-in manifest pin (URL + revision + size + SHA-256) stays as
the offline-safe floor — an app build always has a content version it can install with
no network. On top, a lightweight runtime check against a stable manifest URL on GitHub
releases (one release per content version, like `bible-artifact.ts` pins today) offers
in-app updates with the same SHA-256 + size verification as the pin. Trust surface for
v1 is HTTPS + digest — no signing; revisit if distribution ever leaves GitHub.

**Update affordances.** Web/desktop: non-blocking toast + a settings entry
("Topic content: v3 installed, v4 available"). CLI: `bible topics status` and
`bible topics update` — stable JSON, explicit invocation, no hidden mutation.

**Cadence rule:** schema-bearing changes (new tables/columns) ride the compiled pin and
therefore an app release; content-only refreshes ship via the runtime manifest at any
time. The artifact schema version gates the runtime path — an app never installs an
artifact whose schema major exceeds what it compiled against.
