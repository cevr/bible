import { z } from 'zod';

export const RuleNumber = z.enum([
  'I',
  'II',
  'III',
  'IV',
  'V',
  'VI',
  'VII',
  'VIII',
  'IX/X',
  'XI',
  'XII',
  'XIII',
  'XIV',
]);
export type RuleNumber = z.infer<typeof RuleNumber>;

export const RULE_NAMES: Record<RuleNumber, string> = {
  I: 'every word bears',
  II: 'all scripture necessary',
  III: 'nothing hidden from faith',
  IV: 'no contradiction',
  V: 'Scripture is its own expositor',
  VI: 'recapitulation',
  VII: 'Bible-fixed symbols',
  VIII: 'parables as figures',
  'IX/X': 'multiple significations',
  XI: 'literal first',
  XII: 'trace the figure',
  XIII: 'every word must be fulfilled',
  XIV: 'willingness to lose all',
};

export const RULE_ORDER: Record<RuleNumber, number> = {
  I: 1,
  II: 2,
  III: 3,
  IV: 4,
  V: 5,
  VI: 6,
  VII: 7,
  VIII: 8,
  'IX/X': 9,
  XI: 11,
  XII: 12,
  XIII: 13,
  XIV: 14,
};

export const Violation = z.object({
  ruleNumber: RuleNumber,
  ruleName: z.string(),
  ruleOrder: z.number(),
  body: z.string(),
});
export type Violation = z.infer<typeof Violation>;

export const Reading = z.object({
  citation: z.string().nullable(),
  html: z.string(),
});
export type Reading = z.infer<typeof Reading>;

export const LabeledBlock = z.object({
  label: z.string(),
  html: z.string(),
});
export type LabeledBlock = z.infer<typeof LabeledBlock>;

export const Verse = z.object({
  ref: z.string(),
  num: z.union([z.number(), z.string()]),
  slug: z.string(),
  text: z.string(),
  pioneerReading: Reading.nullable(),
  bohrReading: Reading.nullable(),
  warrant: LabeledBlock.nullable(),
  violations: z
    .object({
      scope: z.enum(['verse', 'broader-use']),
      label: z.string(),
      items: z.array(Violation),
    })
    .nullable(),
  status: LabeledBlock.nullable(),
  symbols: LabeledBlock.nullable(),
  notes: z.array(LabeledBlock),
  extensions: z.array(LabeledBlock),
  unclassified: z.array(z.string()),
});
export type Verse = z.infer<typeof Verse>;

export const Chapter = z.object({
  slug: z.string(),
  ref: z.string(),
  title: z.string(),
  intro: z.string().nullable(),
  verses: z.array(Verse),
  summaryHtml: z.string().nullable(),
});
export type Chapter = z.infer<typeof Chapter>;

export const ChapterIndexEntry = z.object({
  slug: z.string(),
  ref: z.string(),
  title: z.string(),
  verseCount: z.number(),
  addressed: z.number(),
  violations: z.number(),
  density: z.number(),
});
export type ChapterIndexEntry = z.infer<typeof ChapterIndexEntry>;

export const SeriesMeta = z.object({
  slug: z.string(),
  title: z.string(),
  subtitle: z.string(),
  eyebrow: z.string(),
  lede: z.string(),
  source: z.object({
    path: z.string(),
    extractedAt: z.string(),
  }),
});
export type SeriesMeta = z.infer<typeof SeriesMeta>;
