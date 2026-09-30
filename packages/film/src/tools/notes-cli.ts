// `film notes`: the lab's notes on frames, read and answered from the
// terminal. Each note and each event is one line (`notes-lines.ts`), so an
// agent reads them, and a Monitor streams `--watch`.
//
//   film notes <film> [--watch] [--since n]
//       the open notes and the cursor; --watch streams each new note and
//       user reply, once
//   film notes reply <film> <id> <text> [--still file.png] [--since n]
//       reply as the agent, then print what the user said since
//   film notes resolve <film> <id>

import { Argument, Command, Flag } from 'effect/cli';
import { Console, Effect, FileSystem, Option } from 'effect';
import { eventsSince } from '../core/notes.ts';
import type { StoreError } from './content-store.ts';
import { NotesStore } from './notes-store.ts';
import { agentCursor, cursorLine, eventLine, noteLine, watchLine } from './notes-lines.ts';

const film = Argument.String('film').pipe(
  Argument.withDescription('the film, a folder under src/films'),
);

const noteId = Argument.String('id').pipe(Argument.withDescription('the note, e.g. n3'));

const notesReply = Command.make(
  'reply',
  {
    film,
    id: noteId,
    text: Argument.String('text').pipe(Argument.withDescription('the reply')),
    still: Flag.String('still').pipe(
      Flag.optional,
      Flag.withDescription('a PNG to show with the reply: the frame after the change'),
    ),
    since: Flag.Int('since').pipe(
      Flag.optional,
      Flag.withDescription(
        "print what came past this cursor instead of past the agent's previous reply",
      ),
    ),
  },
  Effect.fn('film.notes.reply')(function* (input) {
    const fs = yield* FileSystem.FileSystem;
    const store = yield* NotesStore;
    const at = store.paths(input.film);
    const still = yield* Option.match(input.still, {
      onNone: () => Effect.succeedNone,
      onSome: (file) => Effect.asSome(fs.readFile(file)),
    });
    // Where the agent left off, read before its reply moves it.
    const cursor = yield* Option.match(input.since, {
      onNone: () => Effect.map(store.read(input.film), agentCursor),
      onSome: (since) => Effect.succeed(since),
    });
    const note = yield* store.reply(input.film, input.id, { by: 'agent', text: input.text, still });
    yield* Console.log(noteLine(at, note, note.changed));
    // What the user said while the agent worked: new notes and user replies past its cursor,
    // but the note it just answered, whose line is above.
    const news = eventsSince(yield* store.read(input.film), cursor);
    for (const event of news.events)
      if (!(event._tag === 'NoteAdded' && event.note.id === note.id))
        yield* Effect.forEach(Option.toArray(eventLine(at, event)), (line) => Console.log(line));
    yield* Console.log(cursorLine(news.cursor));
  }),
).pipe(
  Command.withDescription(
    "Reply to a note as the agent (it shows in the lab's thread); then print the new notes and user replies since the agent's previous reply, and the cursor",
  ),
);

const notesResolve = Command.make(
  'resolve',
  { film, id: noteId },
  Effect.fn('film.notes.resolve')(function* (input) {
    const note = yield* (yield* NotesStore).resolve(input.film, input.id);
    yield* Console.log(noteLine((yield* NotesStore).paths(input.film), note, note.changed));
  }),
).pipe(Command.withDescription('Mark a note resolved'));

/** How long one wait of `--watch` holds before it asks again. */
const WATCH_WAIT = '30 seconds';

/** `film notes`, with `reply` and `resolve`. */
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
    const at = store.paths(input.film);
    const file = yield* store.read(input.film);
    if (!input.watch) {
      const open = file.notes.filter((n) => n.status !== 'resolved');
      for (const note of open) yield* Console.log(noteLine(at, note, note.changed));
      // The cursor this list saw: a watch started past it misses nothing made since.
      yield* Console.log(cursorLine(file.seq));
      yield* Effect.log(`notes.list film=${input.film} open=${open.length} cursor=${file.seq}`);
      return;
    }
    const start = Option.getOrElse(input.since, () => file.seq);
    yield* Console.log(watchLine(start));
    yield* Effect.log(`notes.watch film=${input.film} since=${start}`);
    // Each wait passes the cursor on, so every change prints once.
    const watch = (since: number): Effect.Effect<never, StoreError> =>
      store.wait(input.film, since, WATCH_WAIT).pipe(
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
    "List a film's open notes from the lab (id, scene, time, nearest cue, still, text), or --watch for new ones",
  ),
  Command.withSubcommands([notesReply, notesResolve]),
);
