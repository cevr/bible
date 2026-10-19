// The judged rules' kept answers, as one JSON file under the repo's ignored
// `tmp/`: each answer keyed by a hash of (the rule's id and version, the
// model, the item's text), and for each file the rules whose items in it the
// runner has judged, so the oxlint plugin reads a file only when it may hold
// an answer. The runner (`cache.ts`) writes it; the plugin reads it. The model
// is not deterministic at temperature 0, so the kept answer is what keeps a
// rule's verdict on an item from moving between runs. The hash is node's
// sha256, which Bun provides too: oxlint runs its plugins in Node.

import { createHash } from 'node:crypto';
import { Schema } from 'effect';

const Answer = Schema.Struct({
  label: Schema.String,
  probabilities: Schema.Record(Schema.String, Schema.Finite),
});

/** A model's answer for one item: its label and each label's probability. */
export type Answer = typeof Answer.Type;

/** The file's shape: the answers by key, and the rules judged in each file. */
export const Store = Schema.fromJsonString(
  Schema.Struct({
    answers: Schema.Record(Schema.String, Answer),
    files: Schema.Record(Schema.String, Schema.Array(Schema.String)),
  }),
);

export type Store = typeof Store.Type;

/** The key of `text` judged by the rule `rule` (`<id>@<version>`) on `model`. */
export const cacheKey = (rule: string, model: string, text: string) =>
  createHash('sha256').update(`${rule}\0${model}\0${text}`).digest('hex');
