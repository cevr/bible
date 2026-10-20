// The judged rules' kept answers, as one JSON file under the repo's ignored
// `tmp/`, addressed by content: each answer keyed by a hash of the words the
// model reads for the rule (its subject, instructions and criteria), the
// model, and the item's key (`items.ts`: code by its parsed form, comments
// and prose by their words), so a moved, copied or re-indented item keeps
// its answer, an item that parses or reads differently asks again, and so
// does a rule whose words change. No path is kept: the oxlint plugin hashes
// each item of the file it lints and reports the answer kept for that key,
// wherever it now lives.
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
 * The form of the keys this module makes, hashed into each: an answer kept
 * under another form is never found, and is asked again.
 */
const KEY_FORM = 'items-parsed-2';

/** The store's key of the item whose key is `item`, judged by the rule whose words hash to `rule` on `model`. */
export const cacheKey = (rule: string, model: string, item: string) =>
  createHash('sha256').update(`${KEY_FORM}\0${rule}\0${model}\0${item}`).digest('hex');
