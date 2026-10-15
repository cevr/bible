// The Script reader's staging takes with fakes: unvoiced until the fill
// runs, voiced once it does (the reader's film first), refused past the
// day's cap or when it misread its line; a series draft voiced as a film
// is. No network, no media files.

import { describe, expect, it } from 'effect-bun-test';
import { Effect, Layer, Option, Path } from 'effect';
import { TestClock } from 'effect/testing';
import { silence } from '../core/audio.ts';
import { MIX_RATE } from '../core/mix.ts';
import { stagingVoice } from '../core/staging-voice.ts';
import type { ReadBeat, StudioReading } from '../core/studio.ts';
import { FilmFolder, type FilmName } from './film-repo.ts';
import { Narrator } from './narrator.ts';
import { ScriptVoices } from './script-voice.ts';
import { SeriesDrafts } from './series-drafts.ts';
import { StagingCache } from './staging.ts';
import { StudioReadings } from './studio.ts';
import {
  type ElevenLabsCalls,
  emptyCalls,
  fakeElevenLabs,
  fakeMedia,
  memoryFileSystem,
  storeLayer,
  testFilm,
} from './testing.ts';

const beat = (id: string, text: string): ReadBeat => ({
  id,
  text,
  script: text,
  lines: [{ name: 'lead', voiceId: stagingVoice.voices[0].voiceId, text }],
  delivery: [],
});

const reading: StudioReading = {
  voice: stagingVoice,
  heardAs: {},
  beats: [beat('cold', 'Not by works.'), beat('title', ''), beat('faith', 'By faith.')],
  sheet: [],
};

const film = 'rbf' as FilmName;

/** A talk's draft, one spoken beat marked and one that says nothing. */
const DRAFT = [
  '# By Grace',
  '',
  '| #         | Say                   | Picture |',
  '| --------- | --------------------- | ------- |',
  '| 1 · Hook  | By {*}grace. {/} Now. | A card. |',
  '| 2 · Title |                       | Title.  |',
  '',
].join('\n');

/**
 * The service over memory, one film read as `reading`, the series folder
 * holding `drafts` (path under it → Markdown), the day capped at `cap`.
 */
const voices = (
  cap: number,
  heard: ReadonlyMap<string, string> = new Map(),
  drafts: ReadonlyMap<string, string> = new Map(),
) => {
  const files = new Map<string, Uint8Array>(
    [...drafts].map(([at, text]) => [`/series/${at}`, new TextEncoder().encode(text)]),
  );
  const calls: ElevenLabsCalls = emptyCalls();
  const folder = Layer.succeed(
    FilmFolder,
    FilmFolder.of({
      // The fill writes nothing of a film's: its paths are never read.
      paths: () => testFilm([], { voice: '', scenes: {} }).paths,
      names: Effect.succeed([film]),
      sounds: Option.none(),
      footage: Option.none(),
      stamp: () => Effect.succeed(0),
    }),
  );
  const layer = ScriptVoices.layer.pipe(
    Layer.provideMerge(SeriesDrafts.layer(Option.some('/series'))),
    Layer.provideMerge(Narrator.layer),
    Layer.provideMerge(StagingCache.layer('/staging', cap)),
    Layer.provideMerge(storeLayer(files)),
    Layer.provide([
      folder,
      Layer.succeed(StudioReadings, StudioReadings.of({ reading: () => Effect.succeed(reading) })),
      memoryFileSystem(files),
      Path.layer,
      fakeElevenLabs(files, calls, { heard }),
      fakeMedia(files, silence(MIX_RATE, 2 * MIX_RATE, 1)),
    ]),
  );
  return { calls, layer };
};

const tags = (v: { readonly beats: ReadonlyArray<{ readonly take: { readonly _tag: string } }> }) =>
  v.beats.map((b) => b.take._tag);

/** The film's voice once nothing of it is voicing. */
const settledVoice = Effect.gen(function* () {
  const service = yield* ScriptVoices;
  return yield* service.voice(film).pipe(
    Effect.repeat({ until: (v) => !tags(v).includes('Voicing') }),
    Effect.tap(() => Effect.yieldNow),
  );
});

describe('ScriptVoices', () => {
  it.effect('each spoken beat is unvoiced until the fill runs, and nothing is sent', () => {
    const { calls, layer } = voices(1000);
    return Effect.gen(function* () {
      const voice = yield* (yield* ScriptVoices).voice(film);
      expect(voice.beats.map((b) => b.id)).toEqual(['cold', 'faith']);
      expect(tags(voice)).toEqual(['Unvoiced', 'Unvoiced']);
      expect(calls.dialogue).toHaveLength(0);
    }).pipe(Effect.provide(layer));
  });

  it.effect('the fill voices every beat once, and the reader plays it', () => {
    const { calls, layer } = voices(1000);
    return Effect.gen(function* () {
      const service = yield* ScriptVoices;
      yield* Effect.forkScoped(service.fill);
      yield* Effect.yieldNow;
      const voice = yield* settledVoice;
      expect(tags(voice)).toEqual(['Ready', 'Ready']);
      expect(calls.dialogue).toHaveLength(2);
      expect(voice.spent).toBe('Not by works.'.length + 'By faith.'.length);
      const ready = voice.beats[0]?.take;
      if (ready?._tag !== 'Ready') return;
      expect(ready.words.map((w) => w.text)).toEqual(['Not', 'by', 'works.']);
      expect(Option.isSome(yield* (yield* StagingCache).audioNamed(ready.file))).toBe(true);
      expect(yield* (yield* StagingCache).audioNamed('../spend.json')).toEqual(Option.none());
    }).pipe(Effect.scoped, Effect.provide(layer));
  });

  it.effect('past the day’s cap a beat is refused, saying why', () => {
    const { layer } = voices(15);
    return Effect.gen(function* () {
      yield* Effect.forkScoped((yield* ScriptVoices).fill);
      yield* Effect.yieldNow;
      const voice = yield* settledVoice;
      expect(tags(voice).toSorted()).toEqual(['Ready', 'Refused']);
      const refused = voice.beats.find((b) => b.take._tag === 'Refused')?.take;
      expect(refused?._tag === 'Refused' && refused.reason).toContain('characters today');
    }).pipe(Effect.scoped, Effect.provide(layer));
  });

  it.effect(
    'a misread take is refused, saying what was heard; read again once that day, and healed the next',
    () => {
      const heard = new Map([['By faith.', 'Buy fate.']]);
      const { calls, layer } = voices(1000, heard);
      return Effect.gen(function* () {
        yield* Effect.forkScoped((yield* ScriptVoices).fill);
        yield* Effect.yieldNow;
        const voice = yield* settledVoice;
        expect(tags(voice)).toEqual(['Ready', 'Refused']);
        const refused = voice.beats[1]?.take;
        expect(refused?._tag === 'Refused' && refused.reason).toContain('heard "Buy fate."');
        // Read once, then once more that day: no more.
        expect(calls.dialogue).toHaveLength(3);
        yield* (yield* ScriptVoices).voice(film);
        yield* Effect.yieldNow;
        expect(calls.dialogue).toHaveLength(3);
        // The next day it is asked again, and reads its line.
        heard.clear();
        yield* TestClock.adjust('1 day');
        expect(tags(yield* settledVoice)).toEqual(['Ready', 'Ready']);
        expect(calls.dialogue).toHaveLength(4);
      }).pipe(Effect.scoped, Effect.provide(layer));
    },
  );

  it.effect('a series draft is voiced as a film is, in the staging voice, by the sweep', () => {
    const { calls, layer } = voices(
      1000,
      new Map(),
      new Map([['talks/scripts/01-grace.md', DRAFT]]),
    );
    return Effect.gen(function* () {
      const service = yield* ScriptVoices;
      const before = yield* service.draft('talks', '01-grace');
      expect(before.film).toBe('talks/01-grace');
      expect(before.beats.map((b) => b.id)).toEqual(['1']);
      expect(tags(before)).toEqual(['Unvoiced']);
      yield* Effect.forkScoped(service.fill);
      yield* Effect.yieldNow;
      // Read until its take is kept: the sweep comes to drafts after the films.
      const voice = yield* service.draft('talks', '01-grace').pipe(
        Effect.repeat({ until: (v) => tags(v).every((t) => t === 'Ready' || t === 'Refused') }),
        Effect.tap(() => Effect.yieldNow),
      );
      expect(tags(voice)).toEqual(['Ready']);
      // The film's two beats and the draft's one, each asked for once.
      expect(calls.dialogue).toHaveLength(3);
      const unknown = yield* Effect.flip(service.draft('talks', '../../etc'));
      expect(unknown._tag).toBe('DraftUnknown');
    }).pipe(Effect.scoped, Effect.provide(layer));
  });
});
