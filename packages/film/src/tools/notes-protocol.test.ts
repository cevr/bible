// `film notes` as an agent reads it: the open notes and the cursor, a reply
// that prints what the user said since the agent last replied, and `--watch`
// printing each new note and user reply once, never the agent's own, from
// the cursor a list printed. In process over the memory store; the lines are
// what the command logs to its console.

import { BunServices } from '@effect/platform-bun';
import { describe, expect, it } from 'effect-bun-test';
import {
  ConfigProvider,
  Console,
  Duration,
  Effect,
  Exit,
  Layer,
  Option,
  Path,
  Queue,
  References,
} from 'effect';
import { Command } from 'effect/cli';
import { ContentStore } from './content-store.ts';
import { FilmFolder, FilmName } from './film-repo.ts';
import { notes } from './notes-cli.ts';
import { NotesStore } from './notes-store.ts';
import { memoryFileSystem, text } from './testing.ts';

const film = FilmName.make('tiny');
const LAB = '/lab';
const png = text('png');

/** One film, `tiny`, under `/films`; its notes under `/lab`, in memory. */
const World = Layer.unwrap(
  Effect.sync(() => {
    const files = new Map<string, Uint8Array>([
      ['/films/tiny/scenes/index.ts', text('export default []')],
    ]);
    return Layer.mergeAll(NotesStore.layer, FilmFolder.layer('/films')).pipe(
      Layer.provide(ContentStore.layer),
      Layer.provideMerge([
        memoryFileSystem(files, new Set()),
        Path.layer,
        ConfigProvider.layer(ConfigProvider.fromUnknown({ FILMS_LAB: LAB })),
      ]),
    );
  }),
);

/** The console a run prints to: each line it logs, offered to `lines`. */
const printingTo = (lines: Queue.Queue<string>): Console.Console => ({
  ...globalThis.console,
  log: (...args: ReadonlyArray<unknown>) => {
    Queue.offerUnsafe(lines, args.map(String).join(' '));
  },
});

/**
 * `film notes …args`, its printed lines offered to `lines`. Its log events
 * go to stderr in the CLI; here they are dropped, so `lines` is its stdout.
 */
const notesPrinting = (lines: Queue.Queue<string>, args: ReadonlyArray<string>) =>
  Command.runWith(notes, { version: '0' })(args).pipe(
    Effect.provideService(Console.Console, printingTo(lines)),
    Effect.provideService(References.MinimumLogLevel, 'None'),
  );

/** `film notes …args` run to its end: whether it succeeded, and the lines it printed. */
const cli = (...args: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    const lines = yield* Queue.unbounded<string>();
    const exit = yield* Effect.exit(notesPrinting(lines, args));
    return { ok: Exit.isSuccess(exit), lines: yield* Queue.clear(lines) };
  });

/**
 * `film notes tiny --watch …flags`, running until the test's scope ends:
 * `next(n)` is the next `n` lines it prints, as it prints them.
 */
const watching = Effect.fn('test.watching')(function* (...flags: ReadonlyArray<string>) {
  const lines = yield* Queue.unbounded<string>();
  yield* Effect.forkScoped(notesPrinting(lines, ['tiny', '--watch', ...flags]));
  const next = (count: number) =>
    Effect.replicateEffect(Queue.take(lines), count).pipe(
      Effect.timeoutOption(Duration.seconds(5)),
      Effect.map(Option.getOrThrow),
    );
  return { next };
});

/** A line's first three fields: its kind, id or cursor, and change number. */
const head3 = (line: string) => line.split(' ').slice(0, 3).join(' ');

/** A note as the lab saves one: in the turn scene, boxed, nearest the fold cue. */
const cardNote = Effect.fn('test.cardNote')(function* (words: string) {
  return yield* (yield* NotesStore).add(
    film,
    {
      scene: 'turn',
      T: 5.35,
      frame: 160,
      cue: { name: 'fold', edge: 'end' },
      mark: 'page',
      box: { x: 860, y: 640, w: 200, h: 120 },
      text: words,
    },
    png,
  );
});

/** Each test over its own memory store, and Bun's terminal for the command line. */
const Fresh = Layer.merge(BunServices.layer, World);

describe('film notes, as an agent reads it', () => {
  it.live('lists open notes, replies with a still, resolves, and fails on an unknown id', () =>
    Effect.gen(function* () {
      const empty = yield* cli('tiny');
      // No notes: only the cursor a watch resumes from.
      expect(empty).toEqual({ ok: true, lines: ['cursor seq=0'] });

      yield* cardNote('the card sits too low');
      expect((yield* cli('tiny')).lines).toEqual([
        `note id=n1 seq=1 status=open scene=turn T=5.35 frame=160 cue=fold:end mark=page box=860,640,200x120 replies=0 still=${LAB}/tiny/stills/n1.png text="the card sits too low"`,
        'cursor seq=1',
      ]);

      const replied = yield* cli('reply', 'tiny', 'n1', 'raised it 40px');
      expect(replied.ok).toBe(true);
      expect(replied.lines[0]).toContain('status=replied');
      expect(replied.lines[0]).toContain('replies=1');

      expect((yield* cli('resolve', 'tiny', 'n9')).ok).toBe(false);
      expect((yield* cli('resolve', 'tiny', 'n1')).ok).toBe(true);
      expect((yield* cli('tiny')).lines).toEqual(['cursor seq=3']);
    }).pipe(Effect.provide(Fresh)),
  );

  it.live("prints a note's scene-local seconds, the time a re-take of an earlier scene keeps", () =>
    Effect.gen(function* () {
      yield* (yield* NotesStore).add(
        film,
        { scene: 'turn', T: 5.35, local: 1.2, frame: 160, text: 'later in the turn' },
        png,
      );
      expect((yield* cli('tiny')).lines[0]).toBe(
        `note id=n1 seq=1 status=open scene=turn T=5.35 local=1.20 frame=160 replies=0 still=${LAB}/tiny/stills/n1.png text="later in the turn"`,
      );
    }).pipe(Effect.provide(Fresh)),
  );

  it.live(
    'a reply prints what the user said since the agent last replied: new notes and user replies',
    () =>
      Effect.gen(function* () {
        const store = yield* NotesStore;
        yield* cardNote('the card sits too low');
        // The agent's first reply: the only note is the one it answers, whose line it prints.
        const first = yield* cli('reply', 'tiny', 'n1', 'raised it');
        expect(first.lines.map(head3)).toEqual(['note id=n1 seq=2', 'cursor seq=2']);
        // While the agent worked: a user reply on the first note, and two new notes (a note's
        // id is its change number: n4, n5).
        yield* store.reply(film, 'n1', { by: 'user', text: 'lower still', still: Option.none() });
        yield* cardNote('and the cup');
        yield* cardNote('and the saucer');
        const second = yield* cli('reply', 'tiny', 'n4', 'moved the cup');
        // The note it answered, then what came past its last reply (seq 2) but that one, then
        // the cursor.
        expect(second.lines.map(head3)).toEqual([
          'note id=n4 seq=6',
          'reply id=n1 seq=3',
          'note id=n5 seq=5',
          'cursor seq=6',
        ]);
        // Whole lines: each ends at its text, with nothing printed after it.
        expect(second.lines[1]).toMatch(
          /^reply id=n1 seq=3 by=user scene=.* still=\S+ text="lower still"$/,
        );
        expect(second.lines[2]).toMatch(
          /^note id=n5 seq=5 status=open scene=.* text="and the saucer"$/,
        );
        // --since picks the cursor instead: past 6, nothing new.
        const since = yield* cli('reply', 'tiny', 'n1', 'ok', '--since', '6');
        expect(since.lines.map(head3)).toEqual(['note id=n1 seq=7', 'cursor seq=7']);
      }).pipe(Effect.provide(Fresh)),
  );

  it.live('--watch prints each new note and user reply once, and not the agent’s', () =>
    Effect.gen(function* () {
      const store = yield* NotesStore;
      // One note before the watch starts: it is not new, so it is not printed.
      yield* cardNote('before');
      const watch = yield* watching();
      // The cursor it starts from, read before anything changes.
      expect(yield* watch.next(1)).toEqual(['watch since=1']);
      yield* cardNote('after');
      yield* store.reply(film, 'n1', { by: 'agent', text: 'mine', still: Option.none() });
      yield* store.reply(film, 'n2', { by: 'user', text: 'and lower', still: Option.none() });
      const got = yield* watch.next(2);
      expect(got.map(head3)).toEqual(['note id=n2 seq=2', 'reply id=n2 seq=4']);
      expect(got[0]).toMatch(/^note id=n2 seq=2 status=open scene=.* text="after"$/);
      expect(got[1]).toMatch(/^reply id=n2 seq=4 by=user scene=.* still=\S+ text="and lower"$/);
    }).pipe(Effect.scoped, Effect.provide(Fresh)),
  );

  it.live(
    'list, then watch from the cursor it printed: a note made between the two is not lost',
    () =>
      Effect.gen(function* () {
        const store = yield* NotesStore;
        yield* cardNote('seen by the list');
        const listed = yield* cli('tiny');
        expect(listed.lines.at(-1)).toBe('cursor seq=1');
        // Made after the list, before the watch starts: a note in this gap still reaches it.
        yield* cardNote('made in the gap');
        yield* store.reply(film, 'n2', { by: 'user', text: 'and this', still: Option.none() });
        const watch = yield* watching('--since', '1');
        expect((yield* watch.next(3)).map(head3)).toEqual([
          'watch since=1',
          'note id=n2 seq=2',
          'reply id=n2 seq=3',
        ]);
        // A watcher that restarts resumes past the last seq it printed: nothing twice, nothing lost.
        const resumed = yield* watching('--since', '2');
        expect((yield* resumed.next(2)).map(head3)).toEqual(['watch since=2', 'reply id=n2 seq=3']);
      }).pipe(Effect.scoped, Effect.provide(Fresh)),
  );
});
