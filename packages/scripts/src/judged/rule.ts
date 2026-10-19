// A judged rule is data, written in the repo's `.oxlintrc.json` as the
// options of `judged/<id>`: which items it reads (its selector), one
// classify decision a model answers for each item, the label that reports,
// how sure the model must be, and what the report says. Its severity is its
// gate: `warn` reports, `error` fails the lint, and `off` judges nothing. The
// runner (`run.ts`) asks the model and keeps the answers; the oxlint plugin
// (`packages/scripts/lint/judged.ts`) reports the kept answers. A rule carries no code of its own.
//
// This module is read in Node (oxlint's plugin host) as well as in Bun, so it
// imports nothing of either.

import { Schema } from 'effect';

import { SELECTORS } from './items.ts';

/** A rule's options, as `.oxlintrc.json` writes them. */
export const RuleOptions = Schema.Struct({
  /** Raised when the decision's words change, so no cached answer outlives them. */
  version: Schema.Int,
  selector: Schema.Literals(SELECTORS),
  /** What one item is, as each item's instructions name it ("code comment"). */
  subject: Schema.String,
  instructions: Schema.String,
  /** Each label and what it means. */
  criteria: Schema.Record(Schema.String, Schema.String),
  /** The label whose probability reports. */
  reports: Schema.String,
  /** The probability of `reports` at and above which an item reports. */
  threshold: Schema.Finite.check(Schema.isBetween({ minimum: 0, maximum: 1 })),
  message: Schema.String,
}).check(
  Schema.makeFilter(
    (options) =>
      Object.hasOwn(options.criteria, options.reports) ||
      `reports names ${options.reports}, which is none of the criteria's labels`,
  ),
);

export type RuleOptions = typeof RuleOptions.Type;

/** A rule as a run reads it: its options, its id (`judged/<id>`), and whether it gates. */
export interface JudgedRule extends RuleOptions {
  /** The rule's name in its reports and its cache key. */
  readonly id: string;
  readonly severity: 'warn' | 'error';
}

/** The settings every judged rule shares (`settings.judged`). */
export const Settings = Schema.Struct({
  /** The TypeSafe model the rules ask; their thresholds were measured on it. */
  model: Schema.String,
  /** Where the answers are kept, from the repo's root. */
  cache: Schema.String,
});

export type Settings = typeof Settings.Type;

/** A rule's name in the cache's keys: its id and its version. */
export const versionedId = (rule: Pick<JudgedRule, 'id' | 'version'>) =>
  `${rule.id}@${rule.version}`;

/** A model's name in the cache's keys. */
export const cacheModel = (model: string) => `typesafe/${model}`;
