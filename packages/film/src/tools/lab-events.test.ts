// The lab's change feed over its files: the first read is the baseline (a
// note made before the lab started is not news), a board first written after
// it tells its tries, and a cursor from another run is answered with every
// change kept, said as a reset. A production's ledger is read too, and a
// reader is answered only the events it names (globs) about the film it names.

import { describe, expect, it } from 'effect-bun-test';
import { Effect, Fiber, FileSystem, Option, Schema } from 'effect';
import { type BoardFile, BoardFileJson, BoardName } from '../core/board.ts';
import { Segment } from '../core/segment.ts';
import { LabEvents } from './lab-events.ts';
import { NotesStore } from './notes-store.ts';
import { ProductionStore } from './production-store.ts';
import { BoardStore } from './board-store.ts';
import { filmNamed } from './film-repo.ts';
import { labInMemory, text } from './testing.ts';

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
});
