// Narrator with fakes: which beats are recorded, and what a take that says
// something else does. No network, no ffmpeg.

import { describe, expect, it } from 'effect-bun-test';
import { Effect, Layer, Option, Path, Schema } from 'effect';
import { hashText, voiceKey } from '../core/narration.ts';
import { type Timed, type Timings, TimingsJson } from '../core/schema.ts';
import { ContentStore } from './content-store.ts';
import { type NarrateOptions, Narrator, planNarration } from './narrator.ts';
import {
  type ElevenLabsCalls,
  emptyCalls,
  fakeElevenLabs,
  fakeFfmpeg,
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
      fakeFfmpeg([]),
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
      expect(files.has('/films/test/narration/b.mp3')).toBe(true);
      expect(files.has('/films/test/narration/b.take.mp3')).toBe(false);

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
      expect(files.has('/films/test/narration/b.take.mp3')).toBe(false);
      expect(files.has('/films/test/narration/b.mp3')).toBe(false);
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
});
