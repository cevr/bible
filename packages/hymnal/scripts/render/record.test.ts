import { readFileSync } from 'node:fs';

import { Effect, Schema } from 'effect';
import { describe, expect, it } from 'effect-bun-test';

import * as Midi from '../../src/midi.js';
import { checksOf, passed } from './checks.js';
import {
  expectedOf,
  HymnRecordJson,
  measuredOf,
  RecordObjectJson,
  sameVerdicts,
} from './record.js';
import { STYLE } from './style.js';

/** Hymn 168's record as the first full run wrote it: failed on its violas, which end 0.62 s before the hymn's last event. */
const RECORD_168 = {
  hymn: 168,
  key: 'd416dd4f4052276e6ab7068b8485cd43dc2fd902a801a5a06ce0c5407d5c8ffd',
  passed: false,
  file: '168.mp3',
  bytes: 2366979,
  sha256: '307d21631e1afcd5c8f36ba64046b36f6a47b84128e62c81436ef5c3b96108a9',
  md5: '1e295b38de316ad0481acf220003e04e',
  seconds: 98.554739,
  midiSeconds: 96.554749,
  lufs: -16,
  ebur128Lufs: -16,
  truePeak: -2.25,
  lagMs: 10,
  passes: 2,
  checks: {
    length: { ok: true, value: -0.000009843891717764564, limit: 0.05 },
    truePeak: { ok: true, value: -2.247653993285277, limit: -1 },
    loudness: { ok: true, value: -15.995131842778674, limit: -16 },
    clipping: { ok: true, value: 0.7708901762962341, limit: 0.999 },
    silence: { ok: true, value: 0, limit: 1 },
    onsetLag: { ok: true, value: 10, limit: 30 },
    stems: { ok: false, value: 1, limit: 0 },
    memory: { ok: true, value: 0.9203493546666667, limit: 1 },
  },
  stems: {
    piano: { notes: 526, lufs: -30.5, frames: 4348928, rss: 2761048064, seconds: 6.07 },
    violas: { notes: 115, lufs: -33.16, frames: 4230656, rss: 124813312, seconds: 0.24 },
    cellos: { notes: 128, lufs: -34.14, frames: 4295680, rss: 126713856, seconds: 0.24 },
    bass: { notes: 135, lufs: -41.43, frames: 4291584, rss: 134152192, seconds: 0.25 },
    'violins-melody': { notes: 157, lufs: -45.29, frames: 4293632, rss: 126795776, seconds: 0.27 },
  },
  rss: { piano: 2761048064, sampler: 134152192, render: 139249656 },
  times: { sampler: 6.07, mix: 0.67, master: 9.27, total: 16.39 },
  waitedSeconds: 0,
};

const midi168 = Effect.gen(function* () {
  const bytes = new Uint8Array(readFileSync(new URL('../../data/midi/168.mid', import.meta.url)));
  return yield* Midi.parse(bytes);
});

const read = (record: typeof RECORD_168) =>
  Schema.decodeEffect(HymnRecordJson)(JSON.stringify(record));

/** Hymn 168's record with its violas' row changed. */
const withViolas = (change: { readonly frames?: number; readonly lufs?: 'silent' }) =>
  Schema.decodeEffect(HymnRecordJson)(
    JSON.stringify({
      ...RECORD_168,
      stems: { ...RECORD_168.stems, violas: { ...RECORD_168.stems.violas, ...change } },
    }),
  );

describe("a hymn's record", () => {
  it.effect('reads back every measurement a check reads, so its checks come out the same', () =>
    Effect.gen(function* () {
      const record = yield* read(RECORD_168);
      const expected = expectedOf(yield* midi168, STYLE, 168);
      const again = checksOf(measuredOf(record, expected, STYLE.master.targetLufs));
      // The record keeps the length to the microsecond, so the length's value moves by under that.
      for (const [name, check] of Object.entries(RECORD_168.checks)) {
        if (name === 'stems') continue;
        const now = again[name as keyof typeof again];
        expect([name, now.ok, now.limit]).toEqual([name, check.ok, check.limit]);
        expect(Math.abs(now.value - check.value)).toBeLessThan(1e-6);
      }
    }),
  );

  it.effect("passes a stem that ends at its own last note-off's release, short of the hymn", () =>
    Effect.gen(function* () {
      const record = yield* read(RECORD_168);
      const expected = expectedOf(yield* midi168, STYLE, 168);
      const violas = RECORD_168.stems.violas.frames;
      expect(violas).toBeLessThan(Math.round(RECORD_168.midiSeconds * STYLE.rate));
      expect(violas).toBeGreaterThanOrEqual(expected.stems['violas'] ?? Infinity);
      const checks = checksOf(measuredOf(record, expected, STYLE.master.targetLufs));
      expect(checks.stems.ok).toBe(true);
      expect(passed(checks)).toBe(true);
    }),
  );

  it.effect(
    'fails a stem cut before its own last note-off, and a stem with notes gone silent',
    () =>
      Effect.gen(function* () {
        const expected = expectedOf(yield* midi168, STYLE, 168);
        const needed = expected.stems['violas'] ?? 0;
        const cut = yield* withViolas({ frames: needed - 1 });
        const silent = yield* withViolas({ lufs: 'silent' });
        for (const record of [cut, silent])
          expect(checksOf(measuredOf(record, expected, STYLE.master.targetLufs)).stems.ok).toBe(
            false,
          );
      }),
  );

  it.effect(
    'asks each stem with notes for frames through its last note-off, and the hymn for its tail',
    () =>
      Effect.gen(function* () {
        const midi = yield* midi168;
        const expected = expectedOf(midi, STYLE, 168);
        expect(expected.seconds).toBeCloseTo(Midi.secondsOf(midi) + STYLE.tail, 9);
        expect(Object.keys(expected.stems).sort()).toEqual(
          ['bass', 'cellos', 'piano', 'violas', 'violins-melody'].sort(),
        );
        for (const frames of Object.values(expected.stems))
          expect(frames).toBeLessThanOrEqual(Math.round(Midi.secondsOf(midi) * STYLE.rate));
      }),
  );

  it.effect('keeps every field it does not read when read as a whole', () =>
    Effect.gen(function* () {
      const whole = yield* Schema.decodeEffect(RecordObjectJson)(JSON.stringify(RECORD_168));
      expect(whole).toEqual(RECORD_168);
    }),
  );

  it.effect('compares verdicts check by check, not values', () =>
    Effect.sync(() => {
      const a = { length: { ok: true }, stems: { ok: false } };
      expect(sameVerdicts(a, { stems: { ok: false }, length: { ok: true } })).toBe(true);
      expect(sameVerdicts(a, { length: { ok: true }, stems: { ok: true } })).toBe(false);
    }),
  );
});
