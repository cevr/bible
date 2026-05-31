# DAR pilot: chapters are DAR's own, sourced via existing `bible egw` tooling

The first Study Guide Series is Uriah Smith's _Daniel and the Revelation_ (DAR). A
Chapter is one of DAR's **own book chapters**. The verbatim Source Text per chapter
is exported from the EGW FTS index (book code `DAR`, 3555 paragraphs, refcode
`DAR <page>.<para>`) by reusing the existing `@bible/cli` egw service
(`getChapters(bookCode)` for boundaries + per-chapter paragraph reads), not by
standing up new FTS plumbing.

## Why

- **Own chapters over the 21-study structure.** A pre-existing 21-study split and
  topic-mined excerpts (`reference/uriah-smith/study-NN.md`) already exist and would
  be less authoring, but they are derived "observation tracks," not the book's
  structure. The guide should be faithful to the actual book.
- **Reuse egw tooling.** `packages/cli/src/commands/egw.ts` already exposes
  `service.getChapters('DAR')` (chapter list + headings) and verbatim per-chapter
  paragraph reads with `--json`. The export is a thin script over existing core
  service methods — consistent with the studies repo's verbatim-extraction
  discipline (`scripts/extract.ts`).

## Considered and rejected

- **Reuse the existing 21 studies as the unit.** Least authoring, proven structure,
  excerpts ready — but not faithful to DAR's own chapter divisions.
- **Bible-passage chapters (Daniel 1 … Rev 22).** Finest granularity, most sessions,
  and DAR commentary doesn't divide evenly by Bible chapter.

## Consequences

- More authoring than reusing the 21 studies: questions + Key Points are derived per
  real DAR chapter (the study-NN excerpts help but aren't the spine).
- Source Text files are server-only (Private tier) and re-runnable from the FTS
  export script; committing them pins the ground truth the Grader sees.
