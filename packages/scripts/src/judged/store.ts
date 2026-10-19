// The judged rules' kept answers, as one JSON file under the repo's ignored
// `tmp/`, addressed by content: each answer keyed by a hash of the words the
// model reads for the rule (its subject, instructions and criteria), the
// model, and the item's text with its whitespace folded, so a moved, copied
// or re-indented item keeps its answer and a rule whose words change asks
// again. No path is kept: the oxlint plugin hashes each item of the file it
// lints and reports the answer kept for that text, wherever it now lives.
// The runner (`cache.ts`) writes it; the plugin reads it. The model is not
// deterministic at temperature 0, so the kept answer is what keeps a rule's
// verdict on an item from moving between runs. The hash is node's sha256,
// which Bun provides too: oxlint runs its plugins in Node.

import { createHash } from 'node:crypto';
import { Schema } from 'effect';

const Answer = Schema.Struct({
  label: Schema.String,
  probabilities: Schema.Record(Schema.String, Schema.Finite),
});

/** A model's answer for one item: its label and each label's probability. */
export type Answer = typeof Answer.Type;

/** The file's shape: the answers by key. */
export const Store = Schema.fromJsonString(
  Schema.Struct({ answers: Schema.Record(Schema.String, Answer) }),
);

export type Store = typeof Store.Type;

/**
 * `text` as its key reads it: each run of whitespace one space, none beside
 * a mark that is not a letter, a digit or `_`, and none at the edges, so
 * indenting, re-wrapping or re-spacing an item changes no key.
 */
const folded = (text: string) =>
  text
    .replace(/\s+/g, ' ')
    .replace(/ ?([^\p{L}\p{N}_ ]) ?/gu, '$1')
    .trim();

/** The key of `text` judged by the rule whose words hash to `rule` on `model`. */
export const cacheKey = (rule: string, model: string, text: string) =>
  createHash('sha256')
    .update(`${rule}\0${model}\0${folded(text)}`)
    .digest('hex');
