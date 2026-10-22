import { readFileSync } from 'node:fs';

import { loudness, type Pcm } from '@bible/film/measure';
import { Effect, Option, Schema } from 'effect';
import { describe, expect, it } from 'effect-bun-test';

import { ManifestJson } from '../../src/recording-manifest.js';
import { chosenOf, hymnsOf } from './hymns.js';
import { addStem, emptyMix, fitted, panGains } from './mix.js';
import { hashOf, resumeOf } from './resume.js';
import { roomOf } from './run.js';
import { STYLE } from './style.js';
import { readWav, writeWav } from './wav.js';

const RATE = 44100;

/** One channel of a 330 Hz tone at `amp`, `seconds` long. */
const tone = (seconds: number, amp: number): Float32Array =>
  Float32Array.from(
    { length: Math.round(seconds * RATE) },
    (_, i) => amp * Math.sin((2 * Math.PI * 330 * i) / RATE),
  );

const mono = (plane: Float32Array): Pcm => ({
  rate: RATE,
  frames: plane.length,
  channels: [plane],
});

describe('the hymns a run names', () => {
  it.effect('reads unpadded numbers once each, and --all as every hymn', () =>
    Effect.gen(function* () {
      expect(yield* hymnsOf('1, 46,663,46')).toEqual([1, 46, 663]);
      expect((yield* chosenOf(Option.none(), true)).length).toBe(695);
    }),
  );

  for (const text of ['0', '696', '12a', '', '1,,2'])
    it.effect(`refuses ${JSON.stringify(text)}`, () =>
      Effect.gen(function* () {
        expect((yield* Effect.flip(hymnsOf(text))).step).toBe('arguments');
      }),
    );

  it.effect('refuses both flags and neither', () =>
    Effect.gen(function* () {
      expect((yield* Effect.flip(chosenOf(Option.some('1'), true))).reason).toContain('not both');
      expect((yield* Effect.flip(chosenOf(Option.none(), false))).reason).toContain('--all');
    }),
  );
});

describe('the resume', () => {
  const record = { key: 'k', passed: true, sha256: 'mp3' };

  it.effect('keeps a passed hymn whose key and MP3 are unchanged', () =>
    Effect.sync(() => {
      expect(resumeOf(record, 'k', 'mp3')).toBe('keep');
    }),
  );

  const renders = [
    ['no record', undefined, 'k', 'mp3'],
    ['a changed key', record, 'k2', 'mp3'],
    ['a failed record', { ...record, passed: false }, 'k', 'mp3'],
    ['a changed MP3', record, 'k', 'other'],
    ['a missing MP3', record, 'k', undefined],
  ] as const;
  for (const [name, kept, key, sha] of renders)
    it.effect(`renders on ${name}`, () =>
      Effect.sync(() => {
        expect(resumeOf(kept, key, sha)).toBe('render');
      }),
    );

  it.effect('hashes a list by its names, values and order', () =>
    Effect.sync(() => {
      const ab = [
        ['a', '1'],
        ['b', '2'],
      ] as const;
      const base = hashOf(ab);
      expect(base).toMatch(/^[0-9a-f]{64}$/);
      expect(hashOf([...ab])).toBe(base);
      expect(hashOf([...ab].reverse())).not.toBe(base);
      expect(hashOf([['ab', '12']])).not.toBe(hashOf([['a', 'b12']]));
    }),
  );
});

describe('the mix', () => {
  it.effect('keeps the centre at unity and never lifts a side', () =>
    Effect.sync(() => {
      expect(panGains(0)).toEqual([1, 1]);
      const [left, right] = panGains(0.25);
      expect(right).toBe(1);
      expect(left).toBeLessThan(1);
      expect(panGains(-0.3)[0]).toBe(1);
    }),
  );

  it.effect('cuts, pads and doubles a stem to the mix', () =>
    Effect.sync(() => {
      const fit = fitted(mono(tone(0.5, 0.5)), RATE);
      expect(fit.frames).toBe(RATE);
      expect(fit.channels[1]?.[100]).toBe(fit.channels[0]?.[100]);
      expect(fit.channels[0]?.[RATE - 1]).toBe(0);
      expect(fitted(mono(tone(2, 0.5)), RATE).channels[0]?.length).toBe(RATE);
    }),
  );

  it.effect('levels a stem to its loudness and adds a silent stem as nothing', () =>
    Effect.sync(() => {
      const mix = emptyMix(RATE, 2 * RATE);
      addStem(mix, mono(tone(2, 0.5)), -23, 0);
      expect(loudness(mix).integrated).toBeCloseTo(-23, 1);
      expect(Number.isFinite(addStem(mix, mono(tone(2, 0)), -23, 0))).toBe(false);
      expect(loudness(mix).integrated).toBeCloseTo(-23, 1);
    }),
  );
});

describe('the float WAV', () => {
  it.effect('reads back what it writes', () =>
    Effect.sync(() => {
      const pcm: Pcm = { rate: RATE, frames: 4410, channels: [tone(0.1, 0.3), tone(0.1, -0.2)] };
      expect(readWav(writeWav(pcm))).toEqual(pcm);
    }),
  );

  it.effect('refuses a WAV that is not 32-bit float, and a file that is not a WAV', () =>
    Effect.sync(() => {
      const bytes = writeWav(mono(tone(0.01, 0.1)));
      new DataView(bytes.buffer).setUint16(20, 1, true);
      expect(() => readWav(bytes)).toThrow();
      expect(() => readWav(new Uint8Array(12))).toThrow();
    }),
  );
});

describe('the room', () => {
  it.effect(
    "is the pilot's impulse response: wide, at unit energy, silent through the predelay",
    () =>
      Effect.sync(() => {
        const room = readWav(new Uint8Array(readFileSync(roomOf(STYLE))));
        expect([room.rate, room.channels.length]).toEqual([STYLE.rate, 2]);
        expect(room.frames).toBe(Math.floor(STYLE.rate * (1.3 * 1.1 + 0.01)));
        expect(room.channels[0]).not.toEqual(room.channels[1]);
        for (const plane of room.channels) {
          expect(plane.subarray(0, Math.floor(STYLE.rate * 0.01)).every((x) => x === 0)).toBe(true);
          expect(plane.reduce((sum, x) => sum + x * x, 0)).toBeCloseTo(1, 4);
        }
      }),
  );
});

describe('the manifest', () => {
  const manifest = {
    set: 'warm-1',
    style: 'C Warm band',
    platform: 'darwin-arm64',
    configHash: 'c'.repeat(64),
    tools: { sfizz: { version: '1.2.3', sha256: 's' }, nodeAv: { version: '6.1.1' } },
    hymns: [
      {
        hymn: 663,
        key: 'sdah/663.mp3',
        file: '663.mp3',
        bytes: 431_000,
        sha256: 'a'.repeat(64),
        md5: 'b'.repeat(32),
        seconds: 17.95,
        lufs: -16.02,
        truePeak: -2.4,
        lagMs: 3.2,
        passed: true,
      },
    ],
  };

  it.effect('reads back what it writes', () =>
    Effect.gen(function* () {
      const text = yield* Schema.encodeEffect(ManifestJson)(manifest);
      expect(yield* Schema.decodeEffect(ManifestJson)(text)).toEqual(manifest);
    }),
  );

  it.effect('refuses a hymn without its hashes', () =>
    Effect.gen(function* () {
      const broken = JSON.stringify({ ...manifest, hymns: [{ hymn: 663, key: 'sdah/663.mp3' }] });
      yield* Effect.flip(Schema.decodeEffect(ManifestJson)(broken));
    }),
  );
});
