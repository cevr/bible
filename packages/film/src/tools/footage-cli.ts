// `film footage`: the app's footage library from the command line
// (`footage.ts`), shared by its talks. Every command but a first hearing is
// free: `import` keeps an original by its hash under a name, `make` derives
// its copies and a take's voice where they are stale, `push` and `pull` sync
// the originals with the private store, and `list` reads the lock. `make`
// hears a take (`ElevenLabs.stt`, the one paid call) only when it has no
// transcript yet, or when `--hear-again` asks for a second one.
//
//   film footage import <file> --as <name> [--take] [--licence l] [--credit c] [--source url] [--tags a,b]
//   film footage make [name…] [--hear-again]
//   film footage push             film footage pull
//   film footage list

import { Console, Effect, Option } from 'effect';
import { Argument, Command, Flag } from 'effect/cli';
import { ElevenLabs } from './elevenlabs.ts';
import { FootageLibrary, footageLine, printSynced } from './footage.ts';

const importFile = Command.make(
  'import',
  {
    file: Argument.String('file').pipe(
      Argument.withDescription("the camera's file, read in place"),
    ),
    name: Flag.String('as').pipe(
      Flag.withDescription('the name it is kept under (a second recording is a second name)'),
    ),
    take: Flag.Boolean('take').pipe(
      Flag.withDefault(false),
      Flag.withDescription('a take of the owner speaking: it must have sound, and `make` hears it'),
    ),
    licence: Flag.String('licence').pipe(
      Flag.optional,
      Flag.withDescription("a clip's licence, as its source grants it"),
    ),
    credit: Flag.String('credit').pipe(
      Flag.optional,
      Flag.withDescription('who the credits name for it'),
    ),
    source: Flag.String('source').pipe(
      Flag.optional,
      Flag.withDescription('where it came from (a URL)'),
    ),
    tags: Flag.String('tags').pipe(
      Flag.optional,
      Flag.map(Option.map((given: string) => given.split(',').filter((tag) => tag !== ''))),
      Flag.withDescription('words to find it by (a,b)'),
    ),
  },
  Effect.fn('film.footage.import')(function* (input) {
    const library = yield* FootageLibrary;
    const done = yield* library.importFile(input.file, {
      name: input.name,
      kind: (['clip', 'take'] as const)[Number(input.take)] ?? 'clip',
      licence: input.licence,
      credit: input.credit,
      source: input.source,
      tags: Option.getOrElse(input.tags, () => []),
    });
    const verb = ['had ', 'kept'][Number(done.fresh)] ?? 'kept';
    yield* Console.log(`${verb}  ${footageLine(done.name, done.entry)}`);
    if (done.fresh) yield* Console.log(`next: film footage make ${done.name}`);
  }),
).pipe(
  Command.withDescription(
    'Keep a camera file whole by its hash under a name, once it is probed and found one the render can conform',
  ),
);

const make = Command.make(
  'make',
  {
    names: Argument.String('name').pipe(
      Argument.variadic(),
      Argument.withDescription('the names to make (default: every name in the lock)'),
    ),
    hearAgain: Flag.Boolean('hear-again').pipe(
      Flag.withDefault(false),
      Flag.withDescription(
        'hear each take again into a second transcript, which the lock then names (a paid call per take)',
      ),
    ),
  },
  Effect.fn('film.footage.make')(function* (input) {
    const library = yield* FootageLibrary;
    const lock = yield* library.lock;
    const names = [input.names, Object.keys(lock.footage).toSorted()][
      Number(input.names.length === 0)
    ];
    const entries = yield* Effect.forEach(names ?? [], (name) =>
      Effect.map(library.entry(name), (entry) => ({ name, entry })),
    );
    // A take to hear is a paid call: the CLI must be logged in before any copy is made.
    const hearing = entries.some(
      ({ entry }) =>
        entry.kind === 'take' &&
        (input.hearAgain || Option.isNone(Option.fromUndefinedOr(entry.transcript))),
    );
    if (hearing) yield* (yield* ElevenLabs).ready;
    for (const { name } of entries) {
      const done = yield* library.make(name, { hearAgain: input.hearAgain });
      const made = [done.made.join(', '), 'current'][Number(done.made.length === 0)];
      const heard = Option.match(done.transcript, {
        onNone: () => '',
        onSome: (file) => `  ${file}`,
      });
      yield* Console.log(`${name.padEnd(24)}  ${made}${heard}`);
    }
  }),
).pipe(
  Command.withDescription(
    "Derive each original's mezzanine and proxy, and a take's voice and transcript, where they are stale",
  ),
);

const push = Command.make(
  'push',
  {},
  Effect.fn('film.footage.push')(function* () {
    yield* printSynced(yield* (yield* FootageLibrary).push);
  }),
).pipe(
  Command.withDescription(
    'Send every original on this machine to the private store, each read back by its hash',
  ),
);

const pull = Command.make(
  'pull',
  {},
  Effect.fn('film.footage.pull')(function* () {
    yield* printSynced(yield* (yield* FootageLibrary).pull);
  }),
).pipe(
  Command.withDescription(
    'Bring every original the lock names from the private store, unless it is here',
  ),
);

const list = Command.make(
  'list',
  {},
  Effect.fn('film.footage.list')(function* () {
    const lock = yield* (yield* FootageLibrary).lock;
    const named = Object.entries(lock.footage).toSorted(([a], [b]) => a.localeCompare(b));
    for (const [name, entry] of named) yield* Console.log(footageLine(name, entry));
    yield* Console.log(`${named.length} in the footage library`);
  }),
).pipe(
  Command.withDescription(
    'Every name in the footage library: what it is, how long, its picture, its transcript',
  ),
);

/** `film footage`, over the app's footage library (`FootageLibrary`). */
export const footage = Command.make('footage').pipe(
  Command.withDescription(
    "The app's camera footage: import an original, make its copies and a take's transcript, sync the originals with the private store, list them",
  ),
  Command.withSubcommands([importFile, make, push, pull, list]),
);
