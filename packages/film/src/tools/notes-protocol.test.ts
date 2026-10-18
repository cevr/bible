// `film notes` as an agent reads it: the open notes and the cursor, and
// `--watch` printing each new note and user reply once, never the agent's own, from
// the cursor a list printed. In process over the memory store; the lines are
// what the command logs to its console.

import { BunServices } from '@effect/platform-bun';
import { describe, expect, it } from 'effect-bun-test';
import { Duration, Effect, Layer, Option, Queue } from 'effect';
import { FilmName } from './film-repo.ts';
import { NotesStore } from './notes-store.ts';
import {
  NOTES_LAB as LAB,
  notesCli as cli,
  notesInMemory,
  notesPrinting,
  text,
} from './testing.ts';

const film = FilmName.make('tiny');
const png = text('png');

/** One film, `tiny`, under `/films`; its notes under `/lab`, in memory. */
const World = notesInMemory('tiny');

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
  it.live('lists open notes and the cursor, and none once each is done', () =>
    Effect.gen(function* () {
      const empty = yield* cli('tiny');
      // No notes: only the cursor a watch resumes from.
      expect(empty).toEqual({ ok: true, lines: ['cursor seq=0'] });

      yield* cardNote('the card sits too low');
      expect((yield* cli('tiny')).lines).toEqual([
        `note id=n1 seq=1 status=open scene=turn T=5.35 frame=160 cue=fold:end mark=page box=860,640,200x120 replies=0 still=${LAB}/tiny/stills/n1.png text="the card sits too low"`,
        'cursor seq=1',
      ]);

      yield* (yield* NotesStore).resolve(film, 'n1');
      expect((yield* cli('tiny')).lines).toEqual(['cursor seq=2']);
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

  it.live('prints the stretch of its scene a note is about', () =>
    Effect.gen(function* () {
      yield* (yield* NotesStore).add(
        film,
        {
          scene: 'turn',
          T: 5.35,
          frame: 160,
          range: { from: 3.2, to: 4 },
          text: 'the turn drags here',
        },
        png,
      );
      expect((yield* cli('tiny')).lines[0]).toBe(
        `note id=n1 seq=1 status=open scene=turn T=5.35 frame=160 range=3.20-4.00 replies=0 still=${LAB}/tiny/stills/n1.png text="the turn drags here"`,
      );
    }).pipe(Effect.provide(Fresh)),
  );

  it.live('prints the line of the scene’s file a note cites, with its text as it stood', () =>
    Effect.gen(function* () {
      yield* (yield* NotesStore).add(
        film,
        {
          scene: 'turn',
          T: 5.35,
          frame: 160,
          source: { file: 'scenes/turn.ts', line: 118, text: 'if (f.at("push") > 0.5) {' },
          text: 'this branch fires late',
        },
        png,
      );
      expect((yield* cli('tiny')).lines[0]).toBe(
        `note id=n1 seq=1 status=open scene=turn T=5.35 frame=160 source=scenes/turn.ts:118 line="if (f.at(\\"push\\") > 0.5) {" replies=0 still=${LAB}/tiny/stills/n1.png text="this branch fires late"`,
      );
    }).pipe(Effect.provide(Fresh)),
  );

  it.live(
    'prints the words of a line a note is about, as they read, what it asks of them and a correction’s words instead',
    () =>
      Effect.gen(function* () {
        const store = yield* NotesStore;
        const words = { beat: 'turn', from: 4, to: 6, text: 'the page "turns"' };
        yield* store.add(
          film,
          {
            scene: 'turn',
            T: 5.35,
            frame: 160,
            words,
            kind: 'correction',
            replace: 'the page folds',
            text: 'say “the page folds” for “the page "turns"”',
          },
          png,
        );
        yield* store.add(
          film,
          { scene: 'turn', T: 6, frame: 180, words, kind: 'removal', text: 'cut it' },
          png,
        );
        const lines = (yield* cli('tiny')).lines;
        expect(lines[0]).toBe(
          `note id=n1 seq=1 status=open scene=turn T=5.35 frame=160 words=turn:4-6 said="the page \\"turns\\"" kind=correction replace="the page folds" replies=0 still=${LAB}/tiny/stills/n1.png text="say “the page folds” for “the page \\"turns\\"”"`,
        );
        expect(lines[1]).toBe(
          `note id=n2 seq=2 status=open scene=turn T=6.00 frame=180 words=turn:4-6 said="the page \\"turns\\"" kind=removal replies=0 still=${LAB}/tiny/stills/n2.png text="cut it"`,
        );
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
