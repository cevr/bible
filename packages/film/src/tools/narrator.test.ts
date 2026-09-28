// Narrator with fakes: which beats are recorded, and what a take that says
// something else does. No network, no media files.

import { test } from 'bun:test';
import { describe, expect, it } from 'effect-bun-test';
import { Effect, type FileSystem, Layer, Option, Path, Result, Schema } from 'effect';
import { captionCues } from '../core/captions.ts';
import { hashText, parse, takeScript, voiceFor, voiceKey } from '../core/narration.ts';
import { type Cast, type Timed, type Timings, TimingsJson, type Voice } from '../core/schema.ts';
import { ContentStore } from './content-store.ts';
import type { LoadedFilm } from './film-repo.ts';
import {
  type NarrateOptions,
  type NarrationPlan,
  Narrator,
  planNarration,
  stateLine,
} from './narrator.ts';
import {
  type ElevenLabsCalls,
  crashingFileSystem,
  emptyCalls,
  fakeElevenLabs,
  fakeMedia,
  fakeLength,
  memoryFileSystem,
  storeLayer,
  testFilm,
  testVoice,
  text,
} from './testing.ts';

const scenes: ReadonlyArray<Timed> = [
  { id: 'a', say: 'Hello {wave} world.' },
  { id: 'quiet' },
  { id: 'b', say: 'The second line.' },
];

const take = (spoken: string, file: string) => ({
  hash: hashText(spoken),
  file,
  duration: 1,
  words: [],
  source: 'elevenlabs' as const,
});

/** `a` recorded under the test voice, `b` never recorded. */
const recorded: Timings = {
  voice: voiceKey(testVoice),
  scenes: { a: take('Hello world.', 'a.mp3') },
};

const defaults: NarrateOptions = {
  only: Option.none(),
  force: false,
  acceptMismatch: new Set(),
  replaceRecorded: false,
};

const TIMINGS = '/films/test/narration/timings.json';

const setup = (timings: Timings, heard: ReadonlyMap<string, string> = new Map()) => {
  const files = new Map<string, Uint8Array>();
  files.set(TIMINGS, text(Schema.encodeSync(TimingsJson)(timings)));
  const calls = emptyCalls();
  const layer = Narrator.layer.pipe(
    Layer.provideMerge(storeLayer(files)),
    Layer.provide([
      memoryFileSystem(files),
      Path.layer,
      fakeElevenLabs(files, calls, { heard }),
      fakeMedia(),
    ]),
  );
  return { files, calls, layer };
};

/** Plan from what is stored, record, and return the timings written. */
const narrate = (
  layer: Layer.Layer<Narrator | ContentStore>,
  voice: Voice = testVoice,
  options: NarrateOptions = defaults,
  beats: ReadonlyArray<Timed> = scenes,
) =>
  Effect.gen(function* () {
    const store = yield* ContentStore;
    const film = testFilm(beats, recorded, voice);
    const timings = yield* store.read(film.paths.timings);
    const loaded = { ...film, timings };
    const plan = yield* Effect.fromResult(planNarration(loaded, options));
    yield* (yield* Narrator).record(loaded, plan, options);
    return yield* store.read(film.paths.timings);
  }).pipe(Effect.provide(layer));

const spoken = (calls: ElevenLabsCalls) => calls.tts.map((r) => r.text);

describe('Narrator', () => {
  it.effect('records a stale beat once, and skips it once current', () =>
    Effect.gen(function* () {
      const { files, calls, layer } = setup(recorded);
      const after = yield* narrate(layer);
      expect(spoken(calls)).toEqual(['The second line.']);
      expect(after.scenes['b']?.hash).toBe(hashText('The second line.'));
      expect(after.scenes['a']).toEqual(recorded.scenes['a']);
      // A new take has a name of its own; the timings name it.
      expect(after.scenes['b']?.file).toMatch(/^b\.[0-9a-f]{12}\.mp3$/);
      expect(files.has(`/films/test/narration/${after.scenes['b']?.file}`)).toBe(true);

      yield* narrate(layer);
      expect(spoken(calls)).toEqual(['The second line.']);
    }),
  );

  it.effect("a word timed past the take's end is held inside it, not refused by the timings", () =>
    Effect.gen(function* () {
      // The fake take measures 2.5 s; its alignment runs one character per 0.05 s, to 4 s.
      const long = 'This line runs on and on, far past the end of the audio it was made from.';
      const { layer } = setup(recorded);
      const after = yield* narrate(layer, testVoice, defaults, [{ id: 'b', say: long }]);
      const take = after.scenes['b'];
      expect(take?.duration).toBe(2.5);
      expect(take?.words.map((w) => w.text).join(' ')).toBe(long);
      for (const w of take?.words ?? []) {
        expect(w.start).toBeLessThanOrEqual(2.5);
        expect(w.end).toBeLessThanOrEqual(2.5);
        expect(w.start).toBeLessThanOrEqual(w.end);
      }
      expect(take?.words.at(-1)?.end).toBe(2.5);
    }),
  );

  it.effect('skips every beat whose hash is unchanged', () =>
    Effect.gen(function* () {
      const current: Timings = {
        ...recorded,
        scenes: { ...recorded.scenes, b: take('The second line.', 'b.mp3') },
      };
      const { calls, layer } = setup(current);
      const after = yield* narrate(layer);
      expect(calls.tts).toEqual([]);
      expect(after).toEqual(current);
    }),
  );

  it.effect('re-records every beat when the voice changes', () =>
    Effect.gen(function* () {
      const { calls, layer } = setup(recorded);
      const voice = { ...testVoice, settings: { stability: 0.9 } };
      const after = yield* narrate(layer, voice);
      expect(spoken(calls).toSorted()).toEqual(['Hello world.', 'The second line.']);
      expect(after.voice).toBe(voiceKey(voice));
      expect(Object.keys(after.scenes).toSorted()).toEqual(['a', 'b']);
    }),
  );

  it.effect('fails a take that says something else, and keeps it out', () =>
    Effect.gen(function* () {
      const heard = new Map([['The second line.', 'The second lie of the night.']]);
      const { files, layer } = setup(recorded, heard);
      const error = yield* Effect.flip(narrate(layer));
      expect(error._tag).toBe('TakeMismatch');
      expect(error).toMatchObject({ id: 'b', heard: 'The second lie of the night.' });
      const stored = yield* Schema.decodeEffect(TimingsJson)(
        new TextDecoder().decode(files.get(TIMINGS)),
      );
      expect(stored).toEqual(recorded);
      // The rejected take is not left on disk.
      expect([...files.keys()].filter((f) => f.startsWith('/films/test/narration/b'))).toEqual([]);
    }),
  );

  it.effect('keeps a mismatched take for the beats --accept-mismatch names, and no other', () =>
    Effect.gen(function* () {
      const heard = new Map([['The second line.', 'The second lie of the night.']]);
      const { layer } = setup(recorded, heard);
      const other = yield* Effect.flip(
        narrate(layer, testVoice, { ...defaults, acceptMismatch: new Set(['a']) }),
      );
      expect(other).toMatchObject({ _tag: 'TakeMismatch', id: 'b' });
      const after = yield* narrate(layer, testVoice, {
        ...defaults,
        acceptMismatch: new Set(['b']),
      });
      expect(after.scenes['b']?.hash).toBe(hashText('The second line.'));
    }),
  );

  describe('a cast', () => {
    const cast: Cast = {
      model: 'eleven_v3',
      settings: { stability: 0.5 },
      voices: [
        { name: 'lead', voiceId: 'L' },
        { name: 'ask', voiceId: 'A' },
      ],
    };
    const said = "That's the law. {@ask}So where does that {stuck}leave us? {@lead}Stuck.";
    const dialogue: ReadonlyArray<Timed> = [{ id: 'd', say: said }];
    const none: Timings = { voice: voiceKey(cast), scenes: {} };

    it.effect('reads a beat as one dialogue, a line per turn', () =>
      Effect.gen(function* () {
        const { calls, layer } = setup(none);
        const after = yield* narrate(layer, cast, defaults, dialogue);
        expect(calls.tts).toEqual([]);
        expect(calls.dialogue.map((r) => r.lines.map((l) => [l.voiceId, l.text]))).toEqual([
          [
            ['L', "That's the law."],
            ['A', 'So where does that leave us?'],
            ['L', 'Stuck.'],
          ],
        ]);
        const take = after.scenes['d'];
        expect(take?.hash).toBe(hashText(takeScript(parse(said))));
        // Every word is its own, across the joins between lines.
        expect(take?.words.map((w) => w.text)).toEqual(parse(said).spoken.split(' '));
        expect(after.voice).toBe(voiceKey(cast));
      }),
    );

    it.effect('re-records a beat whose turn moved, and not one whose mark moved', () =>
      Effect.gen(function* () {
        const { calls, layer } = setup(none);
        yield* narrate(layer, cast, defaults, dialogue);
        yield* narrate(layer, cast, defaults, [{ id: 'd', say: said.replace('{stuck}', '') }]);
        expect(calls.dialogue).toHaveLength(1);
        const moved = said.replace('{@ask}So where', 'So {@ask}where');
        yield* narrate(layer, cast, defaults, [{ id: 'd', say: moved }]);
        expect(calls.dialogue).toHaveLength(2);
      }),
    );

    it.effect('refuses a turn to a voice the cast does not have, before any call', () =>
      Effect.gen(function* () {
        const { calls, layer } = setup(none);
        const beats = [{ id: 'd', say: 'One. {@narrator}Two.' }];
        const error = yield* Effect.flip(narrate(layer, cast, defaults, beats));
        expect(error).toMatchObject({ _tag: 'UnknownVoice', voice: 'narrator' });
        expect([calls.tts, calls.dialogue]).toEqual([[], []]);
      }),
    );
  });

  describe("a person's takes", () => {
    const person = (spoken: string, file: string) => ({
      ...take(spoken, file),
      source: 'recorded' as const,
    });
    /** `a` read by the owner and current, `b` read by the owner before its line changed. */
    const owned: Timings = {
      voice: voiceKey(testVoice),
      scenes: { a: person('Hello world.', 'a.mp3'), b: person('The first line.', 'b.mp3') },
    };
    const film = (timings: Timings, voice: Voice = testVoice) =>
      ({ ...testFilm(scenes, timings, voice), timings }) satisfies LoadedFilm;
    const states = (plan: NarrationPlan) => plan.states.map((s) => [s.id, s.state._tag]);

    test('the plan names each beat recorded, staging or stale', () => {
      const plan = Result.getOrThrow(planNarration(film(owned), defaults));
      expect(states(plan)).toEqual([
        ['a', 'Recorded'],
        ['b', 'Stale'],
      ]);
      const staged = Result.getOrThrow(planNarration(film(recorded), defaults));
      expect(states(staged)).toEqual([
        ['a', 'Staging'],
        ['b', 'Stale'],
      ]);
    });

    test('--dry-run lists each beat as recorded, staging or stale', () => {
      const mixed: Timings = {
        voice: voiceKey(testVoice),
        scenes: { a: take('Hello world.', 'a.mp3'), b: person('The first line.', 'b.mp3') },
      };
      const plan = Result.getOrThrow(planNarration(film(mixed), defaults));
      expect(plan.states.map(stateLine)).toEqual([
        'staging   a',
        'stale     b (text changed, recorded take)',
      ]);
      const owner = Result.getOrThrow(planNarration(film(owned), defaults));
      expect(owner.states.map(stateLine).at(0)).toBe('recorded  a');
    });

    test('staging never replaces a current recorded take, even when forced or named', () => {
      for (const options of [
        { ...defaults, force: true },
        { ...defaults, only: Option.some(new Set(['a'])) },
      ]) {
        const plan = Result.getOrThrow(planNarration(film(owned), options));
        expect(plan.stale.map((b) => b.id)).not.toContain('a');
        expect(plan.kept.map((k) => [k.id, k.why])).toContainEqual(['a', 'recorded']);
      }
    });

    test('a stale recorded take is refused unless --replace-recorded', () => {
      const refused = Result.getOrThrow(planNarration(film(owned), defaults));
      expect(refused.stale).toEqual([]);
      expect(refused.kept.map((k) => [k.id, k.why])).toEqual([['b', 'recorded, stale']]);
      const replaced = Result.getOrThrow(
        planNarration(film(owned), { ...defaults, replaceRecorded: true }),
      );
      expect(replaced.stale.map((b) => b.id)).toEqual(['b']);
    });

    it.effect('a recorded take outlives a change of staging voice', () => {
      const { calls, layer } = setup(owned);
      return Effect.gen(function* () {
        const voice = { ...testVoice, settings: { stability: 0.9 } };
        const store = yield* ContentStore;
        const before = yield* store.read(testFilm(scenes, owned).paths.timings);
        const plan = Result.getOrThrow(planNarration(film(before, voice), defaults));
        expect(plan.stale).toEqual([]);
        yield* Narrator.use((n) => n.record(film(before, voice), plan, defaults));
        const after = yield* store.read(testFilm(scenes, owned).paths.timings);
        expect(calls.tts).toEqual([]);
        expect(after.scenes).toEqual(owned.scenes);
        expect(after.voice).toBe(voiceKey(voice));
      }).pipe(Effect.provide(layer));
    });

    it.effect("a renamed beat's recorded take is kept and reported, never swept", () => {
      const { files, layer } = setup(owned);
      files.set('/films/test/narration/a.mp3', text('Hello world.'));
      // `a` renamed `hello`: the person's take names a beat the film no longer has.
      const renamed = scenes.map((s) => {
        if (s.id === 'a') return { ...s, id: 'hello' };
        return s;
      });
      return Effect.gen(function* () {
        const store = yield* ContentStore;
        const before = yield* store.read(testFilm(scenes, owned).paths.timings);
        const loaded = { ...testFilm(renamed, before), timings: before };
        const plan = Result.getOrThrow(planNarration(loaded, defaults));
        expect(plan.orphaned).toEqual([{ id: 'a', file: 'a.mp3' }]);
        yield* Narrator.use((n) => n.record(loaded, plan, defaults));
        const after = yield* store.read(testFilm(scenes, owned).paths.timings);
        expect(after.scenes['a']).toEqual(owned.scenes['a']);
        expect(files.has('/films/test/narration/a.mp3')).toBe(true);
      }).pipe(Effect.provide(layer));
    });
  });

  describe('a cast of one', () => {
    const solo: Cast = {
      model: 'eleven_v3',
      settings: { stability: 0.5 },
      voices: [{ name: 'lead', voiceId: 'L' }],
    };
    const said = 'Grace, {free}freely given. Received, not earned.';
    const none: Timings = { voice: voiceKey(solo), scenes: {} };

    it.effect('plans, reads and captions the film as one narrator, with no dash', () =>
      Effect.gen(function* () {
        const { calls, layer } = setup(none);
        const after = yield* narrate(layer, solo, defaults, [{ id: 's', say: said }]);
        expect(calls.dialogue.map((r) => r.lines.map((l) => [l.name, l.text]))).toEqual([
          [['lead', 'Grace, freely given. Received, not earned.']],
        ]);
        const voice = voiceFor('s', said, after);
        expect(voice.recorded).toBe(true);
        const captions = captionCues(voice.words, voice.turns).map((c) => c.text);
        expect(captions.length).toBeGreaterThan(0);
        expect(captions.filter((c) => c.startsWith('-'))).toEqual([]);
      }),
    );

    it.effect('refuses a turn to a voice the one-voice cast does not have', () =>
      Effect.gen(function* () {
        const { calls, layer } = setup(none);
        const beats = [{ id: 's', say: 'One. {@ask}Two?' }];
        const error = yield* Effect.flip(narrate(layer, solo, defaults, beats));
        expect(error).toMatchObject({ _tag: 'UnknownVoice', voice: 'ask', known: ['lead'] });
        expect(calls.dialogue).toEqual([]);
      }),
    );
  });

  describe('crash safety', () => {
    const DIR = '/films/test/narration';
    const said = 'Hello world.';
    /** `a` recorded, its file on disk and its timings in agreement. */
    const agreed = (): Map<string, Uint8Array> => {
      const audio = text(said);
      const timings: Timings = {
        voice: voiceKey(testVoice),
        scenes: {
          a: {
            hash: hashText(said),
            file: 'a.mp3',
            duration: fakeLength(audio),
            words: [],
            source: 'elevenlabs',
          },
        },
      };
      return new Map([
        [TIMINGS, text(Schema.encodeSync(TimingsJson)(timings))],
        [`${DIR}/a.mp3`, audio],
        [`${DIR}/full.wav`, text('mix')],
      ]);
    };
    const reRecordA: NarrateOptions = { ...defaults, only: Option.some(new Set(['a'])) };

    const run = (files: Map<string, Uint8Array>, fs: Layer.Layer<FileSystem.FileSystem>) => {
      const layer = Narrator.layer.pipe(
        Layer.provideMerge(ContentStore.layer.pipe(Layer.provide([fs, Path.layer]))),
        Layer.provide([fs, Path.layer, fakeElevenLabs(files, emptyCalls()), fakeMedia(files)]),
      );
      return narrate(layer, testVoice, reRecordA);
    };

    /** Every take the timings mark current is on disk, and is the audio they describe. */
    const expectAgreement = (files: Map<string, Uint8Array>) => {
      const timings = Schema.decodeSync(TimingsJson)(new TextDecoder().decode(files.get(TIMINGS)));
      for (const [id, take] of Object.entries(timings.scenes)) {
        const audio = Option.fromNullishOr(files.get(`${DIR}/${take.file}`));
        expect({ id, onDisk: Option.isSome(audio) }).toEqual({ id, onDisk: true });
        if (Option.isNone(audio)) continue;
        expect({ id, duration: fakeLength(audio.value) }).toEqual({ id, duration: take.duration });
        expect(hashText(new TextDecoder().decode(audio.value).trim())).toBe(take.hash);
      }
    };

    it.effect('a re-recorded take and its timings agree after a crash at any step', () =>
      Effect.gen(function* () {
        // Count the steps of a clean run, then crash at each one in turn.
        const clean = agreed();
        const counted = crashingFileSystem(clean, 0);
        yield* run(clean, counted.layer);
        expectAgreement(clean);
        expect(counted.ops()).toBeGreaterThan(4);
        for (let nth = 1; nth <= counted.ops(); nth++) {
          const files = agreed();
          yield* Effect.exit(run(files, crashingFileSystem(files, nth).layer));
          expectAgreement(files);
        }
      }),
    );

    it.effect('the next run removes what a crashed run left behind', () =>
      Effect.gen(function* () {
        const files = agreed();
        files.set(`${DIR}/b.take.mp3`, text('stray'));
        files.set(`${DIR}/a.0123456789ab.mp3`, text('orphan'));
        // A replaced recorded take's committed FLAC goes the same way (its master stays in attempts/).
        files.set(`${DIR}/b.0123456789ab.flac`, text('replaced master'));
        files.set(`${TIMINGS}.partial`, text('{'));
        const layer = Narrator.layer.pipe(
          Layer.provideMerge(storeLayer(files)),
          Layer.provide([
            memoryFileSystem(files),
            Path.layer,
            fakeElevenLabs(files, emptyCalls()),
            fakeMedia(files),
          ]),
        );
        yield* narrate(layer);
        const left = [...files.keys()].filter((f) => f.startsWith(`${DIR}/`)).toSorted();
        const takes = yield* Schema.decodeEffect(TimingsJson)(
          new TextDecoder().decode(files.get(TIMINGS)),
        );
        const current = Object.values(takes.scenes).map((t) => `${DIR}/${t.file}`);
        expect(left).toEqual([`${DIR}/full.wav`, TIMINGS, ...current].toSorted());
      }),
    );
  });
});
