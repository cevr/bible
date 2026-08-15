---
id: 010
title: Authoring workflow spec
labels: [wayfinder:grilling]
status: open
assignee:
blocked-by: [004]
---

## Question

Define the markdown source format and the generation/review loop for authored topic
cores.

- **File format**: frontmatter (slug, title, aliases, related topics, catalog-overlay
  key) + body (thesis, section markers). Where files live in the repo (a `content/topics/`
  root? `packages/cli/outputs/` is workflow scratch, probably not it).
- **Generation**: a Claude workflow mass-produces drafts from the pioneer/EGW corpus —
  reuse the patterns from project memory (batched fan-out ~8-10 agents per run,
  args-subsettable; `bible egw study <subject> --pioneers` builds topical corpora;
  the universal teachings format is NOT the page format, but its sourcing discipline is).
  EGW quotes must be refcode-cited and verifiable against the local DB (no hallucinated
  citations — spec a verification pass).
- **Review loop**: user reviews git diffs; what makes a page "approved" and eligible for
  the compiled artifact (frontmatter flag? separate manifest?).
- **Compilation**: the build command that turns approved markdown into the artifact
  (schema from [Wiki domain model](004-wiki-domain-model.md); pipeline fit from
  [Corpus-supply fit for a topics artifact](001-corpus-supply-fit.md)).
