// The lab's change feed over its files: the first read is the baseline (a
// note made before the lab started is not news), a board first written after
// it tells its tries, and a cursor from another run is answered with every
// change kept, said as a reset. A production's ledger is read too, and a
// reader is answered only the events it names (globs) about the film it names.
// A change to a film's source through the lab's writer (the studio's beat
// move, an agent's undo) is told as it landed: written, undone, redone.

import { describe, expect, it } from 'effect-bun-test';
import { Effect, Fiber, FileSystem, Option, Result, Schema } from 'effect';
import { type BoardFile, BoardFileJson, BoardName } from '../core/board.ts';
import { Segment } from '../core/segment.ts';
import { LabEvents } from './lab-events.ts';
import { NotesStore } from './notes-store.ts';
import { ProductionStore } from './production-store.ts';
import { BoardStore } from './board-store.ts';
import { filmNamed } from './film-repo.ts';
import { SourceWriter } from './source-writer.ts';
import { echoPages, labInMemory, text, writesInMemory } from './testing.ts';

const board: BoardFile = {
  film: 'f',
  panels: [
    {
      id: 'cold.judge',
      beat: BoardName.make('cold'),
      at: BoardName.make('judge'),
      tries: [
        {
          n: 1,
          file: Segment.make('cold.judge.1.png'),
          sha256: 's1',
          made: 'import',
          refs: [],
          at: '2026-10-14T00:00:00.000Z',
        },
      ],
    },
  ],
  approvals: [],
};

const boardJson = Schema.encodeSync(BoardFileJson)(board);

const files = () =>
  new Map<string, Uint8Array>([['/films/f/scenes/index.ts', text('export {};\n')]]);

describe('the change feed', () => {
  it.effect('tells what changed after its baseline, and resets a cursor of another run', () =>
    Effect.gen(function* () {
      const notes = yield* NotesStore;
      const film = yield* filmNamed('f');
      const draft = { scene: 'cold', T: 1, frame: 30 };
      yield* notes.add(film, { ...draft, text: 'before the lab' }, text('png'));
      const events = yield* LabEvents.make({ links: { local: 'http://localhost:8229/' } });
      yield* events.look;
      const { cursor } = yield* events.since(Option.none());
      expect((yield* events.since(Option.some(cursor))).changes).toEqual([]);
      yield* notes.add(film, { ...draft, text: 'after it' }, text('png'));
      const fs = yield* FileSystem.FileSystem;
      yield* fs.writeFileString((yield* BoardStore).paths(film).record.file, boardJson);
      yield* events.look;
      const seen = yield* events.since(Option.some(cursor));
      expect(seen.changes.map((c) => [c.seq, c.kind, c.text ?? c.try])).toEqual([
        [1, 'note.added', 'after it'],
        [2, 'board.tried', 1],
      ]);
      // A note opens in the studio's inspector on its beat, a try in its viewer on its panel.
      expect(seen.changes.map((c) => c.links)).toEqual([
        { local: 'http://localhost:8229/films/f/studio?sel=beat%3Acold&note=n2' },
        { local: 'http://localhost:8229/films/f/studio?sel=panel%3Acold.judge&try=1' },
      ]);
      expect(seen.reset).toBe(false);
      // Read again with nothing new: nothing said twice.
      yield* events.look;
      expect((yield* events.since(Option.some(seen.cursor))).changes).toEqual([]);
      const other = yield* events.since(Option.some('zzz.1'));
      expect([other.reset, other.changes.length]).toEqual([true, 2]);
    }).pipe(Effect.provide(labInMemory(files()))),
  );

  it.effect('tells a note the owner withdrew, as the file no longer holds it', () =>
    Effect.gen(function* () {
      const notes = yield* NotesStore;
      const film = yield* filmNamed('f');
      const events = yield* LabEvents.make({ links: { local: 'http://localhost:8229/' } });
      yield* events.look;
      const { cursor } = yield* events.since(Option.none());
      yield* notes.add(film, { scene: 'cold', T: 1, frame: 30, text: 'taken back' }, text('png'));
      yield* events.look;
      yield* notes.withdraw(film, 'n1');
      yield* events.look;
      const told = (yield* events.since(Option.some(cursor))).changes;
      expect(told.map((c) => [c.kind, c.note, c.text])).toEqual([
        ['note.added', 'n1', 'taken back'],
        ['note.withdrawn', 'n1', 'taken back'],
      ]);
      expect(told[0]?.id).not.toBe(told[1]?.id);
    }).pipe(Effect.provide(labInMemory(files()))),
  );

  it.effect('wakes a wait on the change itself, with no clock passing', () =>
    Effect.gen(function* () {
      const notes = yield* NotesStore;
      const film = yield* filmNamed('f');
      const events = yield* LabEvents.make({ links: { local: 'http://localhost:8229/' } });
      yield* events.look;
      const { cursor } = yield* events.since(Option.none());
      const waiting = yield* Effect.forkChild(events.wait(Option.some(cursor), '5 seconds'));
      // The wait has heard nothing yet when the note lands.
      yield* Effect.repeat(Effect.yieldNow, { times: 10 });
      expect(waiting.pollUnsafe()).toBeUndefined();
      yield* notes.add(film, { scene: 'cold', T: 1, frame: 30, text: 'heard' }, text('png'));
      yield* events.look;
      // The test clock stands still: a wait that polled the clock would never answer.
      const heard = yield* Fiber.join(waiting);
      expect(heard.changes.map((change) => change.text)).toEqual(['heard']);
    }).pipe(Effect.provide(labInMemory(files()))),
  );

  it.effect(
    "tells a production's words and moves, and answers a reader the names and the film it asks for",
    () =>
      Effect.gen(function* () {
        const productions = yield* ProductionStore;
        const notes = yield* NotesStore;
        const film = yield* filmNamed('f');
        yield* productions.start('f', {
          title: 'F',
          film: Option.some('f'),
          blurb: Option.none(),
          first: 'v1',
          at: 1,
        });
        const events = yield* LabEvents.make({ links: { local: 'http://localhost:8229/' } });
        yield* events.look;
        const { cursor } = yield* events.since(Option.none());
        yield* productions.say('f', {
          _tag: 'Decided',
          at: 2,
          text: 'keep 9005',
          quote: Option.some('ok 9005'),
          set: Option.none(),
          point: Option.none(),
          variant: Option.none(),
          ask: Option.none(),
          by: Option.some('agent'),
        });
        yield* productions.forward('f', { after: 1, title: 'v2', because: Option.none() }, 3);
        yield* notes.add(film, { scene: 'cold', T: 1, frame: 30, text: 'a note' }, text('png'));
        yield* events.look;
        const kinds = (of: Parameters<typeof events.since>[1]) =>
          Effect.map(events.since(Option.some(cursor), of), (answer) =>
            answer.changes.map((change) => change.kind),
          );
        expect(yield* kinds({})).toEqual([
          'note.added',
          'production.decided',
          'production.forwarded',
        ]);
        expect(yield* kinds({ names: ['production.*'] })).toEqual([
          'production.decided',
          'production.forwarded',
        ]);
        expect(yield* kinds({ names: ['note.*'], film: 'g' })).toEqual([]);
        const decided = (yield* events.since(Option.some(cursor), { names: ['*.decided'] }))
          .changes[0];
        expect([decided?.production, decided?.film, decided?.read.cli]).toEqual([
          'f',
          'f',
          'bun cli.ts lab timeline --film f',
        ]);
      }).pipe(Effect.provide(labInMemory(files()))),
  );

  it.effect("tells each change to a film's source as it landed: written, undone, redone", () =>
    Effect.gen(function* () {
      const writer = yield* SourceWriter;
      const fs = yield* FileSystem.FileSystem;
      const scene = '/films/f/scenes/cold.ts';
      const events = yield* LabEvents.make({ links: { local: 'http://localhost:8229/' } });
      yield* events.look;
      const { cursor } = yield* events.since(Option.none());
      yield* writer.write({
        film: 'f',
        scene: Option.some('cold'),
        file: scene,
        target: 'knob palm',
        edit: (source) => Result.succeed(source.replace('1', '2')),
        verify: () => Result.succeed([]),
        check: () => Effect.void,
      });
      // A film's own file (no scene) is told on the film, its studio unselected.
      yield* writer.around(
        'f',
        '/films/f/sound.ts',
        'score play piano',
        fs.writeFileString('/films/f/sound.ts', 'export {};\n'),
      );
      yield* events.look;
      const filmWide = yield* events.since(Option.some(cursor));
      expect(
        filmWide.changes.map((c) => [c.kind, c.beat ?? 'the film', c.summary, c.links.local]),
      ).toEqual([
        [
          'source.written',
          'cold',
          'f changed: knob palm (cold)',
          'http://localhost:8229/films/f/studio?sel=beat%3Acold',
        ],
        [
          'source.written',
          'the film',
          'f changed: score play piano',
          'http://localhost:8229/films/f/studio',
        ],
      ]);
      yield* writer.step('undo', 'f');
      yield* writer.step('undo', 'f');
      yield* writer.step('redo', 'f');
      yield* events.look;
      const told = yield* events.since(Option.some(filmWide.cursor));
      expect(told.changes.map((c) => [c.kind, c.film, c.beat ?? 'the film', c.text])).toEqual([
        ['source.undone', 'f', 'the film', 'score play piano'],
        ['source.undone', 'f', 'cold', 'knob palm'],
        ['source.redone', 'f', 'cold', 'knob palm'],
      ]);
      // One change, each step its own id; read as its timeline.
      const knob = [filmWide.changes[0], ...told.changes.slice(1)].map((c) => c?.id);
      expect(new Set(knob).size).toBe(3);
      expect(told.changes[2]?.read.cli).toBe('bun cli.ts lab timeline --film f');
      // Read again with nothing new: nothing said twice.
      yield* events.look;
      expect((yield* events.since(Option.some(told.cursor))).changes).toEqual([]);
    }).pipe(
      Effect.provide(
        labInMemory(
          new Map([
            ...files(),
            ['/films/f/scenes/cold.ts', text('export const palm = 1;\n')],
            ['/films/f/sound.ts', text('export const score = 1;\n')],
          ]),
          echoPages,
          { writes: writesInMemory },
        ),
      ),
    ),
  );
});
