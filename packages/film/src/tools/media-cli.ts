// `film media`: review renders (share renders, montages, contact sheets) kept
// in the private store under `renders/`, so a render can go from the disk and
// come back when it is wanted. Free; nothing is deleted anywhere, and nothing
// kept is replaced unasked: a key the store holds with other bytes is refused
// (`--replace` sends them anyway).
//
//   film media push <file…> [--under dir] [--replace]
//       each as renders/<its path under FILMS_OUT> (or renders/<dir>/<name>),
//       read back by hash
//   film media pull <key…> [--to dir]        each into <FILMS_OUT>/renders (or dir), whole
//   film media list [prefix]                 size, when written and key, under renders/
//
// A review page reads the same store through `PrivateStore` (`list`, and
// `read` with a byte range), not through this command.

import { Config, Console, Effect, FileSystem, Option, Path } from 'effect';
import { Argument, Command, Flag } from 'effect/cli';
import { StoreCopyFailed } from './errors.ts';
import { sha256OfFile } from './digest.ts';
import { RENDERS, StoreKeyTaken, renderKey } from './media-store.ts';
import { PrivateStore } from './private-store.ts';

/** A key as given, under `renders/` (a bare name or path is taken as under it). */
const underRenders = (key: string): string => {
  if (key.startsWith(RENDERS)) return key;
  return `${RENDERS}${key.replace(/^\/+/, '')}`;
};

/** `1.2 MB`: a size as a person reads it. */
const sizeLabel = (bytes: number): string => {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)} MB`;
  if (bytes >= 1e3) return `${(bytes / 1e3).toFixed(1)} kB`;
  return `${bytes} B`;
};

const push = Command.make(
  'push',
  {
    files: Argument.String('file').pipe(
      Argument.variadic({ min: 1 }),
      Argument.withDescription('renders, montages or sheets to keep'),
    ),
    under: Flag.String('under').pipe(
      Flag.optional,
      Flag.withDescription(
        'a folder under renders/ to keep them in by name (default: each by its path under FILMS_OUT)',
      ),
    ),
    replace: Flag.Boolean('replace').pipe(
      Flag.withDefault(false),
      Flag.withDescription(
        'send a file whose key the store holds with other bytes, replacing them',
      ),
    ),
  },
  Effect.fn('film.media.push')(function* (input) {
    const store = yield* (yield* PrivateStore).store;
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const outputs = yield* Config.String('FILMS_OUT').pipe(Config.withDefault(path.resolve('out')));
    for (const file of input.files) {
      const key = renderKey(path, outputs, path.resolve(file), input.under);
      const sha = yield* sha256OfFile(fs, file);
      const held = yield* store.hashOf(key);
      if (Option.contains(held, sha)) {
        yield* Console.log(`had  ${key}`);
        continue;
      }
      if (Option.isSome(held) && !input.replace)
        return yield* StoreKeyTaken.make({ key, file, store: store.where });
      yield* store.put(key, file);
      if (!Option.contains(yield* store.hashOf(key), sha))
        return yield* StoreCopyFailed.make({ file: key, store: store.where });
      yield* Effect.log(`media.push.sent key=${key}`);
      yield* Console.log(`sent  ${key}`);
    }
  }),
).pipe(
  Command.withDescription(
    'Keep renders in the private store under renders/, each read back by hash; the local copy stays',
  ),
);

const pull = Command.make(
  'pull',
  {
    keys: Argument.String('key').pipe(
      Argument.variadic({ min: 1 }),
      Argument.withDescription('keys as `media list` prints them (renders/ may be left off)'),
    ),
    to: Flag.String('to').pipe(
      Flag.optional,
      Flag.withDescription('the folder to bring them into (default <FILMS_OUT>/renders)'),
    ),
  },
  Effect.fn('film.media.pull')(function* (input) {
    const store = yield* (yield* PrivateStore).store;
    const path = yield* Path.Path;
    const outputs = yield* Config.String('FILMS_OUT').pipe(Config.withDefault(path.resolve('out')));
    const into = Option.getOrElse(input.to, () => path.join(outputs, 'renders'));
    for (const given of input.keys) {
      const key = underRenders(given);
      const to = path.join(into, key.slice(RENDERS.length));
      yield* store.get(key, to);
      yield* Console.log(`pulled  ${key}  ${to}`);
    }
  }),
).pipe(Command.withDescription('Bring renders back from the private store, whole'));

const list = Command.make(
  'list',
  {
    prefix: Argument.String('prefix').pipe(
      Argument.optional,
      Argument.withDescription('just the keys under this (a film, a review folder)'),
    ),
  },
  Effect.fn('film.media.list')(function* (input) {
    const store = yield* (yield* PrivateStore).store;
    const prefix = Option.match(input.prefix, { onNone: () => RENDERS, onSome: underRenders });
    const found = yield* store.list(prefix);
    for (const object of found)
      yield* Console.log(
        `${sizeLabel(object.size).padStart(9)}  ${object.modified.slice(0, 19).padEnd(19)}  ${object.key}`,
      );
    const bytes = found.reduce((sum, object) => sum + object.size, 0);
    yield* Console.log(`${found.length} renders, ${sizeLabel(bytes)} in ${store.where}`);
  }),
).pipe(Command.withDescription('The renders the private store keeps: size, when written, key'));

/** `film media`, over the app's private store (`PrivateStore`). */
export const media = Command.make('media').pipe(
  Command.withDescription(
    'Review renders in the private store: push them before trashing the local copy, pull them back, list them',
  ),
  Command.withSubcommands([push, pull, list]),
);
