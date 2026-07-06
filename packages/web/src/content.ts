/**
 * Content manifest for The Sure Word. Paths are relative to the repo root.
 *
 * Studies are NOT listed here — any markdown in STUDIES_DIR whose frontmatter
 * carries a `site:` block (see study.ts) is discovered and published by the
 * builder. Comparisons are prebuilt HTML sets, so they stay hand-curated.
 * Entries are validated by the domain schemas at module load.
 */

import { Comparison } from './comparison.js';

/** Directory (repo-relative) scanned for publishable study markdowns. */
export const STUDIES_DIR = 'packages/cli/outputs/studies';

export const COMPARISONS: ReadonlyArray<Comparison.Source> = [
  Comparison.make({
    srcDir: 'packages/cli/outputs/studies/daniel-revelation/v3-the-sure-word/reference/_archive',
    outDir: 'bohr-vs-millers-rules',
    href: '/comparisons/bohr-vs-millers-rules/',
    title: "Bohr vs. Miller's Rules",
    subtitle: 'A verse-by-verse audit of Daniel 11 and Revelation 1–22',
    description:
      "Stephen Bohr's published interpretations weighed against William Miller's 14 rules of interpretation (1842) — with the pioneer reading beside every verse.",
    eyebrow: 'Comparison · Audit',
  }),
];
