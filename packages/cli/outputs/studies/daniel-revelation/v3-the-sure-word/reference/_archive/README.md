# `_archive/`

Frozen HTML artifacts from the previous `build-html.ts` single-page renderer.

These were the canonical published output before the Bohr-vs-Miller audit moved
into `apps/studies/` as a proper Astro app. They are kept here only as a visual
reference for the original layout — they do NOT round-trip with the current
JSON content tree.

## What replaced them

| Old file                             | Replaced by                                                          |
| ------------------------------------ | -------------------------------------------------------------------- |
| `bohr-vs-millers-rules.html`         | `apps/studies/src/pages/bohr-vs-millers-rules/audit/[chapter].astro` |
| `bohr-vs-millers-rules-summary.html` | `apps/studies/src/pages/bohr-vs-millers-rules/summary.astro`         |
| `bohr-vs-millers-rules-heatmap.html` | `apps/studies/src/pages/bohr-vs-millers-rules/heatmap.astro`         |
| `index.html` (landing)               | `apps/studies/src/pages/bohr-vs-millers-rules/index.astro`           |
| `build-html.ts` (renderer)           | `apps/studies/scripts/extract.ts` (markdown→JSON) + Astro pages      |

## Source of truth

The three companion markdown files in the parent directory remain canonical
for re-extraction:

- `bohr-vs-millers-rules.md` — verse-by-verse audit (read by `extract.ts`)
- `bohr-vs-millers-rules-summary.md` — executive summary (rendered by Astro)
- `bohr-vs-millers-rules-heatmap.md` — density heatmap (rendered by Astro)

To regenerate the JSON content tree from the markdown source, run:

```sh
cd apps/studies && bun run extract
```
