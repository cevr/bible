// `film notes`: the lab's notes on frames, read and answered from the
// terminal. Each note and each event is one line (`notes-lines.ts`), so an
// agent reads them, and a Monitor streams `--watch`. Each command names its
// film first (`filmNamed`): a name that is not one of the films answers
// `FilmUnknown` with the films there are, before any notes file is read.
//
//   film notes <film> [--watch] [--since n]
//       the open notes and the cursor; --watch streams each new note and
//       user reply, once
//
// A reply and a note marked done are the lab's commands (`film lab
// reply|resolve`, the same as the lab's MCP tools: `lab-commands.ts`).

import { Argument, Command, Flag } from 'effect/cli';
import { Console, Effect, Option } from 'effect';
import { unresolved } from '../core/notes.ts';
import type { StoreError } from './content-store.ts';
import { filmNamed } from './film-repo.ts';
import { NotesStore } from './notes-store.ts';
import { cursorLine, eventLine, noteLine, watchLine } from './notes-lines.ts';

const film = Argument.String('film').pipe(
  Argument.withDescription('the film, a folder under src/films'),
);

/** How long one wait of `--watch` holds before it asks again. */
const WATCH_WAIT = '30 seconds';

/** `film notes`. */
export const notes = Command.make(
  'notes',
  {
    film,
    watch: Flag.Boolean('watch').pipe(
      Flag.withDefault(false),
      Flag.withDescription(
        'stream each new note, and each reply from the user, as one line, once (for a Monitor); prints `watch since=<seq>` first',
      ),
    ),
    since: Flag.Int('since').pipe(
      Flag.optional,
      Flag.withDescription(
        'with --watch: start past this cursor (from `cursor seq=` of a list, or the last `seq=` a watch printed) instead of the current one',
      ),
    ),
  },
  Effect.fn('film.notes')(function* (input) {
    const store = yield* NotesStore;
    const name = yield* filmNamed(input.film);
    const at = store.paths(name);
    const file = yield* store.read(name);
    if (!input.watch) {
      const open = unresolved(file);
      for (const note of open) yield* Console.log(noteLine(at, note, note.changed));
      // The cursor this list saw: a watch started past it misses nothing made since.
      yield* Console.log(cursorLine(file.seq));
      yield* Effect.log(`notes.list film=${name} open=${open.length} cursor=${file.seq}`);
      return;
    }
    const start = Option.getOrElse(input.since, () => file.seq);
    yield* Console.log(watchLine(start));
    yield* Effect.log(`notes.watch film=${name} since=${start}`);
    // Each wait passes the cursor on, so every change prints once.
    const watch = (since: number): Effect.Effect<never, StoreError> =>
      store.wait(name, since, WATCH_WAIT).pipe(
        Effect.tap((waited) =>
          Effect.forEach(waited.events, (event) =>
            Effect.forEach(Option.toArray(eventLine(at, event)), (line) => Console.log(line)),
          ),
        ),
        Effect.flatMap((waited) => watch(waited.cursor)),
      );
    return yield* watch(start);
  }),
).pipe(
  Command.withDescription(
    "List a film's open notes from the lab (id, scene, time, nearest cue, the words of a line and what it asks of them, still, text), or --watch for new ones",
  ),
);
