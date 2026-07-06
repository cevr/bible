export * as Comparison from './comparison.js';

import { Schema } from 'effect';

/** Card copy for a comparison set, shown on the index pages. */
export interface Card extends Schema.Schema.Type<typeof Card> {}
export const Card = Schema.Struct({
  href: Schema.NonEmptyString,
  title: Schema.NonEmptyString,
  subtitle: Schema.NonEmptyString,
  description: Schema.NonEmptyString,
  eyebrow: Schema.NonEmptyString,
}).annotate({ identifier: 'Comparison.Card' });

/** A comparison set: prebuilt HTML pages copied verbatim into dist/comparisons/<outDir>/. */
export interface Source extends Schema.Schema.Type<typeof Source> {}
export const Source = Schema.Struct({
  ...Card.fields,
  /** Directory (repo-relative) whose *.html files are copied verbatim. */
  srcDir: Schema.NonEmptyString,
  /** Output directory under dist/comparisons/. */
  outDir: Schema.NonEmptyString,
}).annotate({ identifier: 'Comparison.Source' });

/** Validating constructor for manifest entries — throws at module load on bad copy. */
export const make = Schema.decodeUnknownSync(Source);
