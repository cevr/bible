---
id: 001
title: Corpus-supply fit for a topics artifact
labels: [wayfinder:research]
status: closed
assignee: research-agent
blocked-by: []
---

## Question

Topic pages will be authored as markdown in-repo and compiled into a versioned,
digest-verified artifact that web, desktop, and CLI install — the same flow `bible.db` uses.
What exactly does plugging a `topics.db`-style artifact into the existing corpus-supply
pipeline require, and what does the release/update flow look like end to end?

Read `packages/core/src/corpus-supply/` (Asset Source → Corpus Contribution → verified
Artifact → atomic Installation → Activation; `bible-artifact.ts` pins a GitHub release
URL + exact size + SHA-256; `writings-egw-source.ts` and `writings-library.ts` show the
second consumer). Also read how `apps/web/src/workers/database-file-downloader.ts` and
desktop provisioning (`apps/desktop/electron/main.ts`) consume artifacts.

Deliverables: (a) the minimal set of new modules/config a topics artifact needs;
(b) how activation/atomic-swap works when topic content updates independently of app
releases; (c) how a partial or missing topics artifact degrades; (d) any friction in
corpus-supply that would make a third corpus awkward (feeds the architecture audit).
Write findings to `docs/wayfinder/wiki-study-layer/research/001-corpus-supply-fit.md`.

## Resolution

A topics artifact is a clean second instance of the `bible.db` file-artifact
lifecycle — every hard mechanism (digest pin, streaming install, semantic
verification, atomic swap, browser generation rollback, stale-fallback) already
exists and is tested. New work is: a markdown→`topics.db` compiler script, a
`TOPICS_ARTIFACT_RELEASE` manifest + recipe/installer pair + semantic verifier,
widening the closed corpus enums in `model.ts`/`errors.ts`/`service.ts`, an
`ensureTopics` branch, a `/api/assets/topics` proxy route, and per-host wiring
(desktop, web worker, CLI init). Activation is already atomic and
update-safe: a failed install always leaves the previous verified artifact
active, so degradation is "stale or missing", never "partial" — wire topics
`ensure` writings-style (catch + warn), falling back to catalog-only landing
pages. Two audit flags: (1) the file-artifact machinery is bible-branded in
four files and should be generalized before a third copy-paste; (2) the
manifest is pinned in compiled code, so content updates ride app deploys —
true independent cadence needs a runtime-fetched manifest (a deliberate
deviation to decide on).

Findings: [research/001-corpus-supply-fit.md](../research/001-corpus-supply-fit.md)

The portable manifest, verifier, and policy belong in core. Browser and native
installers remain explicit adapters under the
[three-client compatibility contract](../client-compatibility.md).
