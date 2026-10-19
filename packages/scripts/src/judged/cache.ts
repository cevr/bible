// The runner's side of the kept answers (`store.ts` holds their shape and
// key): read whole, and written whole through a temporary file beside it. A
// missing or unreadable file is an empty store.

import { Effect, FileSystem, Option, Path, Schema } from 'effect';

import { type Answer, Store } from './store.js';

/** The answers kept in `file`, and the rules judged in each file; none when it is missing or does not read. */
export const readCache = Effect.fn('judged.readCache')(function* (file: string) {
  const fs = yield* FileSystem.FileSystem;
  const text = yield* fs.readFileString(file).pipe(Effect.option);
  const store = yield* Option.match(text, {
    onNone: () => Effect.succeed<Store>({ answers: {}, files: {} }),
    onSome: (json) =>
      Schema.decodeEffect(Store)(json).pipe(
        Effect.orElseSucceed((): Store => ({ answers: {}, files: {} })),
      ),
  });
  return {
    answers: new Map(Object.entries(store.answers)),
    files: new Map(Object.entries(store.files).map(([path, rules]) => [path, new Set(rules)])),
  };
});

/**
 * Adds `fresh` to the answers in `file`, and each of `judged`'s rules to its
 * file's, written whole through a temporary file beside it.
 */
export const keepAnswers = Effect.fn('judged.keepAnswers')(function* (
  file: string,
  fresh: ReadonlyMap<string, Answer>,
  judged: ReadonlyMap<string, ReadonlySet<string>>,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const kept = yield* readCache(file);
  for (const [key, answer] of fresh) kept.answers.set(key, answer);
  for (const [source, rules] of judged)
    kept.files.set(source, new Set([...(kept.files.get(source) ?? []), ...rules]));
  const json = yield* Schema.encodeEffect(Store)({
    answers: Object.fromEntries(kept.answers),
    files: Object.fromEntries(
      [...kept.files].map(([source, rules]) => [source, [...rules].toSorted()]),
    ),
  });
  yield* fs.makeDirectory(path.dirname(file), { recursive: true });
  const partial = `${file}.${process.pid}.partial`;
  yield* fs.writeFileString(partial, json);
  yield* fs.rename(partial, file);
});
