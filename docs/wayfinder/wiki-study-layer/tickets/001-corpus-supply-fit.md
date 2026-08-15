---
id: 001
title: Corpus-supply fit for a topics artifact
labels: [wayfinder:research]
status: open
assignee:
blocked-by: []
---

## Question

Topic pages will be authored as markdown in-repo and compiled into a versioned,
digest-verified artifact that both hosts download — the same flow `bible.db` uses.
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
