import * as BunServices from '@effect/platform-bun/BunServices';
import { Effect, FileSystem } from 'effect';
import { describe, expect, it } from 'effect-bun-test';

import * as Midi from './midi.js';
import * as Fixture from './midi-fixture.js';

describe('Midi.parse', () => {
  it.effect('reads notes, programs, meter and key by track', () =>
    Effect.gen(function* () {
      const bytes = Fixture.write({
        ticksPerBeat: 480,
        meter: [6, 8],
        fifths: -2,
        tracks: [
          {
            name: 'S A T B',
            program: 5,
            voices: [
              [
                [60, 1],
                [0, 1],
                [62, 0.5],
              ],
              [[48, 2.5]],
            ],
          },
        ],
      });
      const midi = yield* Midi.parse(bytes);
      expect(midi.ticksPerBeat).toBe(480);
      expect(midi.timeSignatures).toEqual([{ tick: 0, numerator: 6, denominator: 8 }]);
      expect(midi.keySignatures).toEqual([{ tick: 0, fifths: -2, minor: false }]);
      const track = midi.tracks[1];
      expect(track?.name).toBe('S A T B');
      expect(track?.program).toBe(5);
      expect(track?.notes.map((n) => [n.start, n.end, n.key])).toEqual([
        [0, 2 * 480 + 240, 48],
        [0, 480, 60],
        [960, 960 + 240, 62],
      ]);
    }),
  );

  it.effect('reads every tempo event and plays the file to its latest track end', () =>
    Effect.gen(function* () {
      const chunk = (id: string, body: readonly number[]) => [
        ...[...id].map((c) => c.charCodeAt(0)),
        0,
        0,
        (body.length >> 8) & 0xff,
        body.length & 0xff,
        ...body,
      ];
      const tempo = (micros: number) => [
        0xff,
        0x51,
        3,
        (micros >> 16) & 0xff,
        (micros >> 8) & 0xff,
        micros & 0xff,
      ];
      const bytes = new Uint8Array([
        ...chunk('MThd', [0, 1, 0, 2, 0, 96]),
        // Tick 0 at 500 000 µs a quarter, tick 96 at 1 000 000, ending at tick 96.
        ...chunk('MTrk', [0, ...tempo(500_000), 0x60, ...tempo(1_000_000), 0, 0xff, 0x2f, 0]),
        // A second tempo at tick 96, later in the file, so it wins; 250 000 from 192; the end at 288.
        ...chunk('MTrk', [
          0,
          0x90,
          60,
          80,
          0x60,
          ...tempo(2_000_000),
          0x60,
          ...tempo(250_000),
          0,
          0x80,
          60,
          0,
          0x60,
          0xff,
          0x2f,
          0,
        ]),
      ]);
      const midi = yield* Midi.parse(bytes);
      expect(midi.tempos).toEqual([
        { tick: 0, microsPerQuarter: 500_000 },
        { tick: 96, microsPerQuarter: 1_000_000 },
        { tick: 96, microsPerQuarter: 2_000_000 },
        { tick: 192, microsPerQuarter: 250_000 },
      ]);
      expect(midi.lastTick).toBe(288);
      const at = Midi.secondsAt(midi);
      expect(at(96)).toBeCloseTo(0.5, 12);
      expect(at(150)).toBeCloseTo(0.5 + (54 / 96) * 2, 12);
      expect(Midi.secondsOf(midi)).toBeCloseTo(0.5 + 2 + 0.25, 12);
    }),
  );

  it.effect('plays a hymnal file as long as mido reads it', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      // mido 1.3.3's MidiFile.length for each file.
      const lengths = [
        [663, 15.945102],
        [1, 130.38190799999998],
        [93, 188.80603206249998],
      ] as const;
      for (const [n, seconds] of lengths) {
        const path = new URL(`../data/midi/${String(n).padStart(3, '0')}.mid`, import.meta.url)
          .pathname;
        const midi = yield* Midi.parse(yield* fs.readFile(path));
        expect(Math.abs(Midi.secondsOf(midi) - seconds)).toBeLessThan(1e-6);
      }
    }).pipe(Effect.provide(BunServices.layer)),
  );

  it.effect('fails with the offset where a file stops making sense', () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(Midi.parse(new Uint8Array([0x4d, 0x54, 0x68, 0x64, 0, 0])));
      expect(error._tag).toBe('MidiParseError');
      expect(error.reason).toBe('unexpected end of file');
      const notMidi = yield* Effect.flip(Midi.parse(new TextEncoder().encode('RIFF....')));
      expect(notMidi.reason).toBe('not a MIDI file');
    }),
  );
});
