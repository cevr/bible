import { Effect } from 'effect';
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
