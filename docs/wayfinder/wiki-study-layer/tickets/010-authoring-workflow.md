---
id: 010
title: Authoring workflow spec
labels: [wayfinder:grilling]
status: closed
assignee: fable-main
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

The compiler is Bun build tooling. It does not enter the portable runtime core.
The compiled schema, verifier, and reader contract must work in web, desktop,
and CLI adapters.

## Resolution

_Resolved 2026-08-16 by fable-main under the standing goal, per never-block-on-the-human.
Reversible on review._

**File format and location.** Authored topic sources live at **`content/topics/*.md`**
(repo root — reviewable content, not `packages/cli/outputs/` scratch). Frontmatter:
`slug`, `title`, `status: draft | approved`, `aliases: [...]`, `related: [...]`
(slugs), optional `catalog: <topic name>` overlay-key override. Body: the thesis
paragraph(s) first, then optional authored sections as `##` headings; auto-mined
sections are never written into the file — the composer appends them at view time.

**Generation.** A Claude workflow mass-produces drafts: corpus per topic via
`bible egw study <subject> --pioneers --export` (the canonical topical-corpus builder),
batched fan-out ~8–10 agents per run and args-subsettable (the proven workflow
pattern). Every EGW/pioneer quote must carry a refcode citation. The universal
teachings format is **not** the page format; its sourcing discipline (ref-first,
capped witnesses) is.

**Citation verification is part of compilation, not review.** The compiler verifies
every cited refcode + quoted text against the local database (normalized substring
match against the book's paragraphs) and **fails the compile** on any miss — no
hallucinated citation can reach the artifact. Review is for content judgment, not
citation policing.

**Review loop.** `status: draft` pages are inert; the user reviews the git diff and
flips to `status: approved`. Only approved pages compile into the artifact. Drafts stay
in-repo harmlessly.

**Compilation.** A Bun build command (`bun run build:topics`, living with the build
tooling — not in the portable runtime core) turns approved markdown into the `topics`
artifact per [ticket 004](004-wiki-domain-model.md)'s schema: markdown → portable AST,
alias dictionary, edges, backlinks, overlay keying pinned to the `bible.db` release it
matched. Output: `topics.db` + manifest (revision, size, SHA-256) following the
corpus-supply lifecycle from
[Corpus-supply fit for a topics artifact](001-corpus-supply-fit.md); released per
[Content release cadence](015-content-release-cadence.md).
