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
import { RECORD_168 } from './record-168.fixture.js';
import { STYLE } from './style.js';

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
