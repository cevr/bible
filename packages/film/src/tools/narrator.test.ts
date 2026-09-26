// Narrator with fakes: which beats are recorded, and what a take that says
// something else does. No network, no media files.

import { describe, expect, it } from 'effect-bun-test';
import { Effect, type FileSystem, Layer, Option, Path, Schema } from 'effect';
import { hashText, voiceKey } from '../core/narration.ts';
import { type Timed, type Timings, TimingsJson } from '../core/schema.ts';
import { ContentStore } from './content-store.ts';
import { type NarrateOptions, Narrator, planNarration } from './narrator.ts';
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
});

/** `a` recorded under the test voice, `b` never recorded. */
const recorded: Timings = {
  voice: voiceKey(testVoice),
  scenes: { a: take('Hello world.', 'a.mp3') },
};

const defaults: NarrateOptions = { only: Option.none(), force: false, acceptMismatch: false };

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
  voice = testVoice,
  options: NarrateOptions = defaults,
) =>
  Effect.gen(function* () {
    const store = yield* ContentStore;
    const film = testFilm(scenes, recorded, voice);
    const timings = yield* store.read(film.paths.timings);
    const loaded = { ...film, timings };
    const plan = planNarration(loaded, options);
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

  it.effect('keeps a mismatched take with --accept-mismatch', () =>
    Effect.gen(function* () {
      const heard = new Map([['The second line.', 'The second lie of the night.']]);
      const { layer } = setup(recorded, heard);
      const after = yield* narrate(layer, testVoice, { ...defaults, acceptMismatch: true });
      expect(after.scenes['b']?.hash).toBe(hashText('The second line.'));
    }),
  );

  describe('crash safety', () => {
    const DIR = '/films/test/narration';
    const said = 'Hello world.';
    /** `a` recorded, its file on disk and its timings in agreement. */
    const agreed = (): Map<string, Uint8Array> => {
      const audio = text(said);
      const timings: Timings = {
        voice: voiceKey(testVoice),
        scenes: {
          a: { hash: hashText(said), file: 'a.mp3', duration: fakeLength(audio), words: [] },
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
