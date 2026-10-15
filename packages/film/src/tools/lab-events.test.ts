// The lab's change feed over its files: the first read is the baseline (a
// note made before the lab started is not news), a board first written after
// it tells its tries, and a cursor from another run is answered with every
// change kept, said as a reset.

import { describe, expect, it } from 'effect-bun-test';
import { Effect, Fiber, FileSystem, Option, Schema } from 'effect';
import { type BoardFile, BoardFileJson } from '../core/board.ts';
import { LabEvents } from './lab-events.ts';
import { NotesStore } from './notes-store.ts';
import { BoardStore } from './board-store.ts';
import { filmNamed } from './film-repo.ts';
import { labInMemory, text } from './testing.ts';

const board: BoardFile = {
  film: 'f',
  panels: [
    {
      id: 'cold.judge',
      beat: 'cold',
      at: 'judge',
      tries: [
        {
          n: 1,
          file: 'cold.judge.1.png',
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
      expect(seen.changes[0]?.links).toEqual({
        local: 'http://localhost:8229/films/f/lab/cold?note=n2',
      });
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
});
