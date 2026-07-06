/**
 * Content manifest for The Sure Word. Paths are relative to the repo root.
 * Card copy (title/subtitle/description) is curated here so the build stays a
 * pure function of this file + the markdown sources.
 */

import type { ComparisonCard, StudyMeta } from './render.js';

const STUDIES_DIR = 'packages/cli/outputs/studies';

export const STUDIES: readonly StudyMeta[] = [
  {
    file: `${STUDIES_DIR}/2026-07-06-why-suffering-a-bible-handbook-study-series.md`,
    slug: 'why-suffering',
    title: 'Why <em>Suffering?</em>',
    subtitle: 'Ten short Bible studies on the oldest question in the world',
    description:
      'If God is good, why is there suffering? From the first rebellion in heaven to the day God wipes away the last tear — a war about the character of God, settled at a cross.',
    eyebrow: 'Handbook Study Series',
    date: '2026-07-06',
  },
  {
    file: `${STUDIES_DIR}/2026-06-10-daniel-and-the-revelation-a-bible-handbook-study.md`,
    slug: 'daniel-and-the-revelation',
    title: 'Daniel and the <em>Revelation</em>',
    subtitle: 'A Bible handbook study',
    description:
      'The prophetic books opened line upon line — every symbol defined from Scripture, every timeline anchored to its decree.',
    eyebrow: 'Bible Handbook Study',
    date: '2026-06-10',
  },
  {
    file: `${STUDIES_DIR}/2026-06-17-righteousness-by-faith-a-bible-handbook-study.md`,
    slug: 'righteousness-by-faith',
    title: 'Righteousness by <em>Faith</em>',
    subtitle: 'A Bible handbook study',
    description:
      'Justification, sanctification, and the faith of Jesus — the gospel traced ref by ref through the whole canon.',
    eyebrow: 'Bible Handbook Study',
    date: '2026-06-17',
  },
  {
    file: `${STUDIES_DIR}/2026-06-19-the-chain-of-truth-a-bible-handbook-study.md`,
    slug: 'chain-of-truth',
    title: 'The Chain of <em>Truth</em>',
    subtitle: 'A Bible handbook study',
    description:
      'The whole system of present truth as one connected chain — each link proven before the next is hung on it.',
    eyebrow: 'Bible Handbook Study',
    date: '2026-06-19',
  },
  {
    file: `${STUDIES_DIR}/2026-06-20-the-chain-of-truth-a-bible-only-handbook-study.md`,
    slug: 'chain-of-truth-bible-only',
    title: 'The Chain of Truth — <em>Bible Only</em>',
    subtitle: 'The same chain, proven from Scripture alone',
    description:
      'The Chain of Truth rebuilt with no authority outside the canon: every line is ref → text → gloss, KJV throughout.',
    eyebrow: 'Bible-Only Handbook Study',
    date: '2026-06-20',
  },
  {
    file: `${STUDIES_DIR}/2026-06-20-the-father-the-son-and-the-holy-spirit-a-bible-handbook-study.md`,
    slug: 'father-son-and-holy-spirit',
    title: 'The Father, the Son, and the <em>Holy Spirit</em>',
    subtitle: 'A Bible handbook study',
    description:
      'What Scripture actually says about the Godhead — gathered, defined, and weighed without a creed in hand.',
    eyebrow: 'Bible Handbook Study',
    date: '2026-06-20',
  },
  {
    file: `${STUDIES_DIR}/2026-06-20-four-and-three-how-scripture-divides-the-seven.md`,
    slug: 'four-and-three',
    title: 'Four and <em>Three</em>',
    subtitle: 'How Scripture divides the seven',
    description:
      'The seven churches, seals, and trumpets carry a built-in 4+3 divide — traced from the pattern itself.',
    eyebrow: 'Bible Handbook Study',
    date: '2026-06-20',
  },
  {
    file: `${STUDIES_DIR}/2026-06-22-the-seven-times-a-bible-handbook-study-of-the-2520.md`,
    slug: 'seven-times',
    title: 'The Seven <em>Times</em>',
    subtitle: 'A Bible handbook study of the 2520',
    description:
      "Leviticus 26's seven times of scattering, followed through Daniel and the pioneer charts to their terminus.",
    eyebrow: 'Bible Handbook Study',
    date: '2026-06-22',
  },
  {
    file: `${STUDIES_DIR}/2026-06-26-why-he-tarries-country-living-and-the-third-angel-in-verity.md`,
    slug: 'why-he-tarries',
    title: 'Why He <em>Tarries</em>',
    subtitle: 'Country living and the third angel in verity',
    description:
      'What is Christ waiting for? The delay of the advent, the preparation of a people, and the call out of the cities.',
    eyebrow: 'Bible Handbook Study',
    date: '2026-06-26',
  },
  {
    file: `${STUDIES_DIR}/2026-06-20-peace-faith-and-works-a-sabbath-school-study-of-the-holy-place.md`,
    slug: 'peace-faith-and-works',
    title: 'Peace, Faith, and <em>Works</em>',
    subtitle: 'A Sabbath School study of the holy place',
    description:
      'The furniture of the holy place as the geography of the Christian life — peace, faith, and works in their sanctuary order.',
    eyebrow: 'Sabbath School Study',
    date: '2026-06-20',
  },
];

const COMPARISON_SRC_DIR =
  'packages/cli/outputs/studies/daniel-revelation/v3-the-sure-word/reference/_archive';

export interface ComparisonSource extends ComparisonCard {
  /** Directory (repo-relative) whose *.html files are copied verbatim. */
  readonly srcDir: string;
  /** Output directory under dist/comparisons/. */
  readonly outDir: string;
}

export const COMPARISONS: readonly ComparisonSource[] = [
  {
    srcDir: COMPARISON_SRC_DIR,
    outDir: 'bohr-vs-millers-rules',
    href: '/comparisons/bohr-vs-millers-rules/',
    title: "Bohr vs. Miller's Rules",
    subtitle: 'A verse-by-verse audit of Daniel 11 and Revelation 1–22',
    description:
      "Stephen Bohr's published interpretations weighed against William Miller's 14 rules of interpretation (1842) — with the pioneer reading beside every verse.",
    eyebrow: 'Comparison · Audit',
  },
];
