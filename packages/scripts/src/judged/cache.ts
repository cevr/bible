// The judged rules' answers, kept in one JSON file under the repo's ignored
// `tmp/` and keyed by a hash of (the rule's id and version, the model, the
// item's text): a rerun asks only for text it has not seen, and says what it
// said before. The model is not deterministic at temperature 0, so the cache
// is what keeps a rule's verdict on a comment from moving between runs. A
// missing or unreadable file is an empty cache.

import { CryptoHasher } from 'bun';
import { Effect, FileSystem, Option, Path, Schema } from 'effect';

const Answer = Schema.Struct({
  label: Schema.String,
  probabilities: Schema.Record(Schema.String, Schema.Finite),
});

/** A model's answer for one item: its label and each label's probability. */
export type Answer = typeof Answer.Type;

const Entries = Schema.fromJsonString(Schema.Record(Schema.String, Answer));

/** The cache's key for `text` judged by the rule `rule` (`<id>@<version>`) on `model`. */
export const cacheKey = (rule: string, model: string, text: string) =>
  new CryptoHasher('sha256').update(`${rule}\0${model}\0${text}`).digest('hex');

/** The answers kept in `file`; none when it is missing or does not read. */
export const readCache = Effect.fn('judged.readCache')(function* (file: string) {
  const fs = yield* FileSystem.FileSystem;
  const text = yield* fs.readFileString(file).pipe(Effect.option);
  const entries = yield* Option.match(text, {
    onNone: () => Effect.succeed({}),
    onSome: (json) => Schema.decodeEffect(Entries)(json).pipe(Effect.orElseSucceed(() => ({}))),
  });
  return new Map(Object.entries(entries));
});

/** Adds `fresh` to the answers in `file`, written whole through a temporary file beside it. */
export const keepAnswers = Effect.fn('judged.keepAnswers')(function* (
  file: string,
  fresh: ReadonlyMap<string, Answer>,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const kept = yield* readCache(file);
  for (const [key, answer] of fresh) kept.set(key, answer);
  const json = yield* Schema.encodeEffect(Entries)(Object.fromEntries(kept));
  yield* fs.makeDirectory(path.dirname(file), { recursive: true });
  const partial = `${file}.${process.pid}.partial`;
  yield* fs.writeFileString(partial, json);
  yield* fs.rename(partial, file);
});
