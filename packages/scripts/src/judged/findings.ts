// The findings of the checkout's last judged run, file by file, for the
// oxlint plugin (`packages/scripts/lint/judged.ts`): the runner has read
// every item and its kept answer, so the plugin reports a file's findings
// from here when the file's text hashes as it did then, and parses nothing.
// A file whose text has changed since, or a rule whose words, label,
// threshold, selector or model have, is not answered here: the plugin reads
// its items and the store, as it does with no file at all. So is every file
// when the code that makes the items and their keys (`makersHash`) is not
// the code the run read them with, or when the run is older than the store
// keeps an answer no run reads (`MAX_AGE_DAYS`): the store may have dropped
// the answers its findings came from; and when the checkout's settings name
// another store than the run read (`settings.judged.store`): its findings
// are that store's answers, not this one's.
//
// Each file the run read holds the findings of each rule whose every item
// in it has an answer the store keeps, as the store held it after the run's
// write; a rule with an item there the store keeps no answer for (none came,
// or the write failed) is left out of that file, so the plugin reads the
// store for it. A finding holds its item's offset and the probability of the
// rule's reporting label, as the plugin would find them in the store.
//
// The file is the checkout's own (`settings.judged.checkout`, from its
// root): it says what this tree held at the run. The plugin runs in Node, so
// this module imports nothing of Bun, only node's crypto, fs, module, path
// and url.

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Schema } from 'effect';

import { type RuleOptions, ruleKey } from './rule.ts';

const Finding = Schema.Struct({
  /** The item's offset in its file, where the plugin reports it. */
  start: Schema.Finite,
  /** The probability of the rule's reporting label. */
  p: Schema.Finite,
});

/**
 * The file's shape: the day of the run (whole days since 1970, UTC), the
 * store it read its answers from (`settings.judged.store`), the hash of the
 * code that made its items, each rule's signature, and each file's hash and
 * each rule's findings in it.
 */
export const Findings = Schema.fromJsonString(
  Schema.Struct({
    day: Schema.Finite,
    store: Schema.String,
    makers: Schema.String,
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
 * its selector, its reporting label and its threshold. The plugin reads a
 * rule's findings only under the signature it computes from its own options.
 */
export const ruleSignature = (
  model: string,
  rule: Pick<
    RuleOptions,
    'subject' | 'instructions' | 'criteria' | 'selector' | 'reports' | 'threshold'
  >,
) =>
  createHash('sha256')
    .update([model, ruleKey(rule), rule.selector, rule.reports, String(rule.threshold)].join('\0'))
    .digest('hex');

/** The code that makes the items and their keys, by its files beside this one, and the parser it reads them with. */
const MAKERS = ['sources.ts', 'items.ts', 'store.ts'];

/** The hash of the makers, computed once a process. */
let makers = '';

/**
 * A hash of the code that makes the items and their keys: the makers' texts
 * and the parser's `package.json`. A findings file or an items memo made by
 * other code is read as none.
 */
export const makersHash = () => {
  if (makers !== '') return makers;
  const here = dirname(fileURLToPath(import.meta.url));
  const parser = createRequire(import.meta.url).resolve('oxc-parser/package.json');
  makers = textHash(
    [...MAKERS.map((file) => join(here, file)), parser]
      .map((file) => textHash(readFileSync(file, 'utf8')))
      .join('\0'),
  );
  return makers;
};

/** The findings file of the checkout at `root`: `checkout` (`settings.judged.checkout`) from its root. */
export const findingsFileOf = (root: string, checkout: string) =>
  join(root, checkout, 'findings.json');
