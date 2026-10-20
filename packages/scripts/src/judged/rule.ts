// A judged rule is data, written in the repo's `.oxlintrc.json` as the
// options of `judged/<id>`: which items it reads (its selector), one
// classify decision a model answers for each item, the label that reports,
// how sure the model must be, and what the report says. Its severity is its
// gate: `warn` reports, `error` fails the lint, and `off` judges nothing. The
// runner (`run.ts`) asks the model and keeps the answers; the oxlint plugin
// (`packages/scripts/lint/judged.ts`) reports the kept answers. A rule carries no code of its own.
//
// This module is read in Node (oxlint's plugin host) as well as in Bun, so it
// imports nothing of either but node's crypto, which Bun provides.

import { createHash } from 'node:crypto';
import { Schema } from 'effect';

import { SELECTORS } from './items.ts';

/** A rule's options, as `.oxlintrc.json` writes them. */
export const RuleOptions = Schema.Struct({
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
  /** The rule's name in its reports. */
  readonly id: string;
  readonly severity: 'warn' | 'error';
}

/** The settings every judged rule shares (`settings.judged`). */
export const Settings = Schema.Struct({
  /** The TypeSafe model the rules ask, by its exact id: their thresholds were measured on it. */
  model: Schema.String,
  /** Where the answers are kept, from git's common dir, so every checkout shares them (`store.ts`). */
  store: Schema.String,
});

export type Settings = typeof Settings.Type;

/**
 * A rule's part of the cache's keys: a hash of the words the model reads for
 * it, its subject, its instructions and each label and its meaning, so an
 * edit to any of them asks again. Its id, selector, threshold, reporting
 * label and message are no part of it: the model reads none of them.
 */
export const ruleKey = (rule: Pick<RuleOptions, 'subject' | 'instructions' | 'criteria'>) =>
  createHash('sha256')
    .update(
      [
        rule.subject,
        rule.instructions,
        ...Object.entries(rule.criteria)
          .toSorted(([a], [b]) => a.localeCompare(b))
          .flatMap(([label, words]) => [label, words]),
      ].join('\0'),
    )
    .digest('hex');

/** A model's name in the cache's keys. */
export const cacheModel = (model: string) => `typesafe/${model}`;
