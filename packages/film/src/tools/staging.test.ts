// Staging takes with fakes: what a marked line is sent as, that a take is
// made once and kept, the day's cap, and that holds are set in the take. No
// network, no media files.

import { describe, expect, it } from 'effect-bun-test';
import { test } from 'bun:test';
import { DateTime, Effect, Exit, Layer, Option, Path } from 'effect';
import { TestClock } from 'effect/testing';
import { silence } from '../core/audio.ts';
import type { Mark } from '../core/delivery.ts';
import { MIX_RATE } from '../core/mix.ts';
import { StagingCapReached } from '../core/refusals.ts';
import type { Cast, Reader } from '../core/schema.ts';
import { stagingVoice } from '../core/staging-voice.ts';
import type { ReadBeat } from '../core/studio.ts';
import { Narrator } from './narrator.ts';
import { StagingCache, audioName, stagingRequest } from './staging.ts';
import {
  type ElevenLabsCalls,
  emptyCalls,
  fakeElevenLabs,
  fakeMedia,
  memoryFileSystem,
  storeLayer,
} from './testing.ts';

const beat = (text: string, delivery: ReadonlyArray<Mark> = []): ReadBeat => ({
  id: 'b',
  text,
  script: text,
  lines: [{ name: 'lead', voiceId: stagingVoice.voices[0].voiceId, text }],
  delivery,
});

const marked = beat('Not by works. By faith.', [
  { _tag: 'Hold', before: 3, seconds: 1.5 },
  { _tag: 'Stress', word: 4 },
]);

const reader: Reader = {
  voiceId: 'r',
  model: 'eleven_multilingual_v2',
  settings: { stability: 0.5 },
};

describe('stagingRequest', () => {
  test('a cast is sent its lines compiled, and charged their characters', () => {
    const request = stagingRequest({ beat: marked, voice: stagingVoice, previous: 'x', next: 'y' });
    expect(request.speech._tag).toBe('Dialogue');
    if (request.speech._tag !== 'Dialogue') return;
    expect(request.speech.request.lines.map((l) => l.text)).toEqual([
      'Not by works. [pause] By FAITH.',
    ]);
    expect(request.characters).toBe('Not by works. [pause] By FAITH.'.length);
  });

  test('a cast’s turn is sent its own words, with the pause in the gap before them', () => {
    const cast: Cast = {
      ...stagingVoice,
      voices: [...stagingVoice.voices, { name: 'ask', voiceId: 'q' }],
    };
    const turned: ReadBeat = {
      ...marked,
      lines: [
        { name: 'lead', voiceId: 'l', text: 'Not by works.' },
        { name: 'ask', voiceId: 'q', text: 'By faith.' },
      ],
    };
    const request = stagingRequest({ beat: turned, voice: cast, previous: '', next: '' });
    expect(request.speech._tag).toBe('Dialogue');
    if (request.speech._tag !== 'Dialogue') return;
    expect(request.speech.request.lines.map((l) => l.text)).toEqual([
      'Not by works.',
      '[pause] By FAITH.',
    ]);
  });

  test('the key changes with the words, the marks, the voice and the model, and nothing else', () => {
    const key = (ask: Parameters<typeof stagingRequest>[0]) => stagingRequest(ask).key;
    const base = { beat: marked, voice: stagingVoice, previous: '', next: '' };
    expect(key(base)).toBe(key({ ...base, previous: 'another line' }));
    expect(key(base)).not.toBe(key({ ...base, beat: beat('Not by works. By faith.') }));
    expect(key(base)).not.toBe(
      key({ ...base, beat: beat('Not by works. By grace.', marked.delivery) }),
    );
    // A cast's voice reaches the key through each line's voice (`linesOf`).
    const otherVoice: ReadBeat = {
      ...marked,
      lines: marked.lines.map((l) => ({ ...l, voiceId: 'other' })),
    };
    expect(key(base)).not.toBe(key({ ...base, beat: otherVoice }));
    expect(key(base)).not.toBe(
      key({ ...base, voice: { ...stagingVoice, settings: { stability: 0.4, similarity: 0.75 } } }),
    );
    expect(key(base)).not.toBe(key({ ...base, voice: { ...stagingVoice, model: 'eleven_v3' } }));
  });

  test('a reader on an earlier model is sent breaks and its neighbours, and its key holds them', () => {
    const ask = { beat: marked, voice: reader, previous: 'Before.', next: 'After.' };
    const request = stagingRequest(ask);
    expect(request.speech._tag).toBe('Tts');
    if (request.speech._tag !== 'Tts') return;
    expect(request.speech.request.text).toBe('Not by works. <break time="1.5s" /> By faith.');
    expect(request.speech.request.previousText).toBe('Before.');
    expect(request.key).not.toBe(stagingRequest({ ...ask, next: 'Else.' }).key);
  });

  test('a hold’s seconds change the take’s key, not the reading’s: v4 is sent the same', () => {
    const base = { beat: marked, voice: stagingVoice, previous: '', next: '' };
    const longer = stagingRequest({
      ...base,
      beat: beat(marked.text, [
        { _tag: 'Hold', before: 3, seconds: 2 },
        { _tag: 'Stress', word: 4 },
      ]),
    });
    const first = stagingRequest(base);
    expect(longer.sent).toBe(first.sent);
    expect(longer.key).not.toBe(first.key);
  });
});

/** The cache over memory alone, its days capped at `cap`. */
const cacheOnly = (cap: number) => {
  const files = new Map<string, Uint8Array>();
  return StagingCache.layer('/staging', cap).pipe(
    Layer.provideMerge(storeLayer(files)),
    Layer.provide([memoryFileSystem(files), Path.layer]),
  );
};

describe('the day’s spend', () => {
  it.effect('is charged up to the cap and refused past it, charging nothing then', () =>
    Effect.gen(function* () {
      const cache = yield* StagingCache;
      yield* cache.charge(90);
      expect((yield* cache.charge(10)).spent).toBe(100);
      const refused = yield* Effect.flip(cache.charge(1));
      expect(refused).toMatchObject({ _tag: 'StagingCapReached', spent: 100, asked: 1, cap: 100 });
      expect((yield* cache.today).spent).toBe(100);
    }).pipe(Effect.provide(cacheOnly(100))),
  );

  it.effect('a day is the local date', () =>
    Effect.gen(function* () {
      const lateEvening = DateTime.makeZonedUnsafe(
        { year: 2026, month: 10, day: 14, hour: 23, minute: 59 },
        { timeZone: DateTime.zoneMakeLocal(), adjustForTimeZone: true },
      );
      yield* TestClock.setTime(DateTime.toEpochMillis(lateEvening));
      expect((yield* (yield* StagingCache).today).day).toBe('2026-10-14');
    }).pipe(Effect.provide(cacheOnly(100))),
  );
});

/** Narrator's staging over memory, its cache capped at `cap`; every take decodes to 3 s of silence. */
const staging = (cap: number) => {
  const files = new Map<string, Uint8Array>();
  const calls: ElevenLabsCalls = emptyCalls();
  const layer = Narrator.layer.pipe(
    Layer.provideMerge(StagingCache.layer('/staging', cap)),
    Layer.provideMerge(storeLayer(files)),
    Layer.provide([
      memoryFileSystem(files),
      Path.layer,
      fakeElevenLabs(files, calls),
      fakeMedia(files, silence(MIX_RATE, 3 * MIX_RATE, 1)),
    ]),
  );
  return { files, calls, layer };
};

const ask = { beat: marked, voice: stagingVoice, previous: '', next: '' };

describe('Narrator.stage', () => {
  it.effect('makes a take once, then answers it from the cache', () => {
    const { calls, layer } = staging(1000);
    return Effect.gen(function* () {
      const narrator = yield* Narrator;
      const first = yield* narrator.stage(ask, {});
      const again = yield* narrator.stage(ask, {});
      expect([first.cached, again.cached]).toEqual([false, true]);
      expect(calls.dialogue).toHaveLength(1);
      expect(again.take).toEqual(first.take);
      expect(first.take.words.map((w) => w.text)).toEqual(['Not', 'by', 'works.', 'By', 'faith.']);
      expect(first.take.wer).toBe(0);
      const spent = yield* (yield* StagingCache).today;
      expect(spent.spent).toBe(first.take.characters);
    }).pipe(Effect.provide(layer));
  });

  it.effect('sets each hold’s gap to its seconds in the take', () => {
    const { layer } = staging(1000);
    return Effect.gen(function* () {
      const { take } = yield* (yield* Narrator).stage(ask, {});
      const [, , works, by] = take.words;
      expect((by?.start ?? 0) - (works?.end ?? 0)).toBeCloseTo(1.5);
      expect(take.file.endsWith('.flac')).toBe(true);
    }).pipe(Effect.provide(layer));
  });

  it.effect('refuses past the day’s cap, sending nothing', () => {
    const { calls, layer } = staging(10);
    return Effect.gen(function* () {
      const exit = yield* Effect.exit((yield* Narrator).stage(ask, {}));
      expect(Exit.findErrorOption(exit).pipe(Option.map((e) => e._tag))).toEqual(
        Option.some('StagingCapReached'),
      );
      expect(calls.dialogue).toHaveLength(0);
      expect((yield* (yield* StagingCache).today).spent).toBe(0);
    }).pipe(Effect.provide(layer));
  });

  it.effect('a new day spends from nothing', () => {
    const { layer } = staging(40);
    return Effect.gen(function* () {
      const narrator = yield* Narrator;
      yield* narrator.stage(ask, {});
      const other = { ...ask, beat: beat('By grace.') };
      const refused = yield* Effect.flip(
        narrator.stage({ ...ask, beat: beat('Not by works. By faith, then.') }, {}),
      );
      expect(refused).toBeInstanceOf(StagingCapReached);
      yield* TestClock.adjust('1 day');
      const next = yield* narrator.stage(other, {});
      expect(next.cached).toBe(false);
    }).pipe(Effect.provide(layer));
  });

  it.effect(
    'a hold’s seconds changed sets them again in the same reading, sending and charging nothing',
    () => {
      const { calls, layer } = staging(1000);
      return Effect.gen(function* () {
        const narrator = yield* Narrator;
        const first = yield* narrator.stage(ask, {});
        const longer = yield* narrator.stage(
          {
            ...ask,
            beat: beat(marked.text, [
              { _tag: 'Hold', before: 3, seconds: 2.5 },
              { _tag: 'Stress', word: 4 },
            ]),
          },
          {},
        );
        expect(longer.cached).toBe(true);
        expect(calls.dialogue).toHaveLength(1);
        expect((yield* (yield* StagingCache).today).spent).toBe(first.take.characters);
        const [, , works, by] = longer.take.words;
        expect((by?.start ?? 0) - (works?.end ?? 0)).toBeCloseTo(2.5);
        expect(longer.take.file).not.toBe(first.take.file);
      }).pipe(Effect.provide(layer));
    },
  );

  it.effect(
    'a take’s audio is named by its bytes: a reading made afresh is a new name, the old one kept',
    () => {
      const { files, layer } = staging(1000);
      return Effect.gen(function* () {
        const narrator = yield* Narrator;
        const plain = { ...ask, beat: beat('Not by works.') };
        const first = yield* narrator.stage(plain, {});
        const again = yield* narrator.stage(plain, {}, () => false);
        expect(again.cached).toBe(false);
        expect(first.take.file).toBe(audioName(first.audio, '.mp3'));
        expect(again.take.file).toBe(audioName(again.audio, '.mp3'));
        expect(again.take.file).not.toBe(first.take.file);
        expect(files.get(`/staging/takes/${first.take.file}`)).toEqual(first.audio);
      }).pipe(Effect.provide(layer));
    },
  );

  it.effect('two asking for one reading at once make it once, and are charged once', () => {
    const { calls, layer } = staging(1000);
    return Effect.gen(function* () {
      const narrator = yield* Narrator;
      const [a, b] = yield* Effect.all([narrator.stage(ask, {}), narrator.stage(ask, {})], {
        concurrency: 2,
      });
      expect(calls.dialogue).toHaveLength(1);
      expect([a?.take.file, a?.cached || b?.cached]).toEqual([b?.take.file, true]);
      expect((yield* (yield* StagingCache).today).spent).toBe(a?.take.characters);
    }).pipe(Effect.provide(layer));
  });
});
