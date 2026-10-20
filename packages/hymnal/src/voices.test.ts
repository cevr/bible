import * as BunServices from '@effect/platform-bun/BunServices';
import { Effect, FileSystem } from 'effect';
import { describe, expect, it } from 'effect-bun-test';

import * as Midi from './midi.js';
import * as Fixture from './midi-fixture.js';
import { voices } from './voices.js';

const [soprano, alto, tenor, bass] = Fixture.praiseToTheLord;

/** A voice's notes as the parser reads them: [start, end, key] ticks at 384 a beat. */
const ticks = (voice: Fixture.Voice | undefined) => {
  let at = 0;
  return (voice ?? []).flatMap(([key, beats]) => {
    const start = at;
    at += Math.round(beats * 384);
    return key > 0 ? [[start, at, key]] : [];
  });
};

const keys = (notes: readonly Midi.Note[]) => notes.map((note) => [note.start, note.end, note.key]);

const read = (fixture: Fixture.Fixture) => Midi.parse(Fixture.write(fixture));

describe('voices', () => {
  it.effect('reads four keyboard tracks as soprano, alto, tenor and bass', () =>
    Effect.gen(function* () {
      const midi = yield* read({
        tracks: [soprano, alto, tenor, bass].map((voice) => ({
          program: 5,
          voices: [voice ?? []],
        })),
      });
      const parts = voices(midi);
      expect(keys(parts.S)).toEqual(ticks(soprano));
      expect(keys(parts.A)).toEqual(ticks(alto));
      expect(keys(parts.T)).toEqual(ticks(tenor));
      expect(keys(parts.B)).toEqual(ticks(bass));
    }),
  );

  it.effect('splits two paired tracks into the upper and lower voice of each', () =>
    Effect.gen(function* () {
      const midi = yield* read({
        tracks: [
          { program: 5, voices: [soprano ?? [], alto ?? []] },
          { program: 5, voices: [tenor ?? [], bass ?? []] },
        ],
      });
      const parts = voices(midi);
      expect(keys(parts.S)).toEqual(ticks(soprano));
      expect(keys(parts.A)).toEqual(ticks(alto));
      expect(keys(parts.T)).toEqual(ticks(tenor));
      expect(keys(parts.B)).toEqual(ticks(bass));
    }),
  );

  it.effect('puts the first two of three tracks in the upper half', () =>
    Effect.gen(function* () {
      const midi = yield* read({
        tracks: [
          { program: 5, voices: [soprano ?? []] },
          { program: 5, voices: [alto ?? []] },
          { program: 5, voices: [tenor ?? [], bass ?? []] },
        ],
      });
      const parts = voices(midi);
      expect(keys(parts.A)).toEqual(ticks(alto));
      expect(keys(parts.T)).toEqual(ticks(tenor));
      expect(keys(parts.B)).toEqual(ticks(bass));
    }),
  );

  it.effect('drops a harmony note that doubles the tune of a unison setting', () =>
    Effect.gen(function* () {
      // The tune on its own track first (no keyboard program), then a keyboard
      // track that doubles it and carries the alto, and one with tenor and bass.
      const midi = yield* read({
        tracks: [
          { program: 0, voices: [soprano ?? []] },
          { program: 5, voices: [soprano ?? [], alto ?? []] },
          { program: 5, voices: [tenor ?? [], bass ?? []] },
        ],
      });
      const parts = voices(midi);
      expect(keys(parts.S)).toEqual(ticks(soprano));
      expect(keys(parts.A)).toEqual(ticks(alto));
      expect(keys(parts.T)).toEqual(ticks(tenor));
      expect(keys(parts.B)).toEqual(ticks(bass));
    }),
  );

  it.effect('reads hymn 1 as the pilot the owner heard did', () =>
    Effect.gen(function* () {
      const path = new URL('../data/midi/001.mid', import.meta.url).pathname;
      const midi = yield* Midi.parse(yield* (yield* FileSystem.FileSystem).readFile(path));
      const parts = voices(midi);
      expect([parts.S.length, parts.A.length, parts.T.length, parts.B.length]).toEqual([
        163, 184, 182, 177,
      ]);
    }).pipe(Effect.provide(BunServices.layer)),
  );
});
