import * as BunServices from '@effect/platform-bun/BunServices';
import { Effect, FileSystem, Path } from 'effect';
import { describe, expect, it } from 'effect-bun-test';

import * as Midi from '../../src/midi.js';
import * as Fixture from '../../src/midi-fixture.js';
import { voices } from '../../src/voices.js';
import { keyedStyle, moveText, SAMPLED } from './keys.js';
import { planOf } from './plan.js';
import { stemMidi } from './stems.js';
import { STYLE } from './style.js';

const [soprano, alto, tenor, bass] = Fixture.praiseToTheLord;

/** The fixture's four voices on four tracks, with a tempo change at bar 2. */
const praise = Effect.map(
  Midi.parse(
    Fixture.write({
      tracks: [soprano, alto, tenor, bass].map((voice) => ({ program: 0, voices: [voice ?? []] })),
    }),
  ),
  (midi): Midi.Midi => ({
    ...midi,
    tempos: [
      { tick: 0, microsPerQuarter: 600000 },
      { tick: 3 * 384, microsPerQuarter: 500000 },
    ],
  }),
);

/** A stem's MIDI file as the sampler reads it: its notes as [start, end, key] and its tempo map. */
const sampled = (midi: Midi.Midi, notes: Parameters<typeof stemMidi>[1]) =>
  Effect.map(Midi.parse(stemMidi(midi, notes)), (read) => ({
    notes: read.tracks.flatMap((t) => t.notes).map((n) => [n.start, n.end, n.key]),
    tempos: read.tempos,
  }));

/** A voice's notes as [start, end, key] at 384 ticks a beat, each key moved `by`. */
const ticks = (voice: Fixture.Voice | undefined, by: number) => {
  let at = 0;
  return (voice ?? []).flatMap(([key, beats]) => {
    const start = at;
    at += Math.round(beats * 384);
    return key > 0 ? [[start, at, key + by]] : [];
  });
};

const read = (hymn: number) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const file = path.resolve(
      import.meta.dir,
      '../../data/midi',
      `${String(hymn).padStart(3, '0')}.mid`,
    );
    return voices(yield* Midi.parse(yield* fs.readFile(file)));
  });

describe('another key', () => {
  it.effect('moves every note t semitones and keeps its ticks and the tempo map', () =>
    Effect.gen(function* () {
      const midi = yield* praise;
      for (const t of [3, -5]) {
        const keyed = keyedStyle(STYLE, voices(midi), t);
        expect(keyed.moves).toEqual([]);
        const plan = planOf(voices(midi), keyed.style, 1);
        const melody = plan.find((p) => p.stem.name === 'violins-melody');
        const cellos = plan.find((p) => p.stem.name === 'cellos');
        const melodyFile = yield* sampled(midi, melody?.notes ?? []);
        expect(melodyFile.notes).toEqual(ticks(soprano, t));
        expect(melodyFile.tempos).toEqual(midi.tempos);
        expect((yield* sampled(midi, cellos?.notes ?? [])).notes).toEqual(ticks(tenor, t));
        // Velocities are the printed key's: the same seed draws them.
        const printed = planOf(voices(midi), STYLE, 1);
        expect(plan.map((p) => p.notes.map((n) => n.velocity))).toEqual(
          printed.map((p) => p.notes.map((n) => n.velocity)),
        );
      }
    }),
  );

  it.effect('is the printed style itself at transpose 0', () =>
    Effect.gen(function* () {
      const midi = yield* praise;
      const keyed = keyedStyle(STYLE, voices(midi), 0);
      expect(keyed.style).toBe(STYLE);
      expect(keyed.moves).toEqual([]);
    }),
  );

  it.scopedLive.layer(BunServices.layer)(
    "keeps the corpus's lowest bass and highest melody in range at -5 and +6, the part moved by a whole octave",
    () =>
      Effect.gen(function* () {
        // Hymn 33 holds the lowest bass note (the contrabass plays it at 21), hymn 305 the highest melody (88).
        const cases = [
          { hymn: 33, t: -5, stem: 'bass', octave: 12 },
          { hymn: 33, t: 6, stem: 'bass', octave: 0 },
          { hymn: 305, t: -5, stem: 'violins-melody', octave: 0 },
          { hymn: 305, t: 6, stem: 'violins-melody', octave: -12 },
        ];
        for (const { hymn, t, stem, octave } of cases) {
          const parts = yield* read(hymn);
          const keyed = keyedStyle(STYLE, parts, t);
          const plan = planOf(parts, keyed.style, hymn);
          const printed = planOf(parts, STYLE, hymn);
          for (const { stem: s, notes } of plan) {
            const range = SAMPLED.get(s.sfz);
            for (const n of notes) {
              expect(n.key).toBeGreaterThanOrEqual(range?.low ?? Number.NaN);
              expect(n.key).toBeLessThanOrEqual(range?.high ?? Number.NaN);
            }
          }
          const moved = plan.find((p) => p.stem.name === stem)?.notes ?? [];
          const before = printed.find((p) => p.stem.name === stem)?.notes ?? [];
          expect(moved.map((n, i) => n.key - (before[i]?.key ?? 0))).toEqual(
            before.map(() => t + octave),
          );
          const said = keyed.moves.filter((m) => m.stem === stem).map(moveText);
          expect(said).toEqual(octave === 0 ? [] : [`${stem} ${octave > 0 ? '+' : ''}${octave}`]);
        }
      }),
  );
});
