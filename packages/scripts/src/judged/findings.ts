// The findings of the checkout's last judged run, file by file, for the
// oxlint plugin (`packages/scripts/lint/judged.ts`): the runner has read
// every item and its kept answer, so the plugin reports a file's findings
// from here when the file's text hashes as it did then, and parses nothing.
// A file whose text has changed since, or a rule whose words, label,
// threshold or model have, is not answered here: the plugin reads its items
// and the store, as it does with no file at all.
//
// Each file the run read holds the findings of each rule that judged all
// its items; a rule the run could not finish on a file (an item no answer
// came for) is left out of that file, so the plugin reads the store for it.
// A finding holds its item's offset and the probability of the rule's
// reporting label; only findings whose answers the store keeps are here, as
// the plugin would find them in the store.
//
// The file is the checkout's own (`settings.judged.checkout`, from its
// root): it says what this tree held at the run. The plugin runs in Node, so
// this module imports nothing of Bun but node's crypto and path.

import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { Schema } from 'effect';

import { type RuleOptions, ruleKey } from './rule.ts';

const Finding = Schema.Struct({
  /** The item's offset in its file, where the plugin reports it. */
  start: Schema.Finite,
  /** The probability of the rule's reporting label. */
  p: Schema.Finite,
});

/** The file's shape: each rule's signature, and each file's hash and each rule's findings in it. */
export const Findings = Schema.fromJsonString(
  Schema.Struct({
    rules: Schema.Record(Schema.String, Schema.String),
    files: Schema.Record(
      Schema.String,
      Schema.Struct({
        hash: Schema.String,
        rules: Schema.Record(Schema.String, Schema.Array(Finding)),
      }),
    ),
  }),
);

export type Findings = typeof Findings.Type;

/** A file's text as the findings name it: its sha256. */
export const textHash = (text: string) => createHash('sha256').update(text).digest('hex');

/**
 * What a rule's findings depend on: the model, the rule's words (`ruleKey`),
 * its reporting label and its threshold. The plugin reads a rule's findings
 * only under the signature it computes from its own options.
 */
export const ruleSignature = (
  model: string,
  rule: Pick<RuleOptions, 'subject' | 'instructions' | 'criteria' | 'reports' | 'threshold'>,
) =>
  createHash('sha256')
    .update([model, ruleKey(rule), rule.reports, String(rule.threshold)].join('\0'))
    .digest('hex');

/** The findings file of the checkout at `root`: `checkout` (`settings.judged.checkout`) from its root. */
export const findingsFileOf = (root: string, checkout: string) =>
  join(root, checkout, 'findings.json');
