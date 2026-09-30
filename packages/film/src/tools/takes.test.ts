// Takes with fakes: a person's recordings imported beat by beat, from a
// folder, one file or one long recording of the whole script. The fake media
// loads a recording as tone for each word it says; the fake transcriber hears
// what `recorded` says for the beat. No network, no ffmpeg.

import { describe, expect, it } from 'effect-bun-test';
import { Effect, Layer, Option, Path, Schema } from 'effect';
import { hashText, voiceKey } from '../core/narration.ts';
import { type Timed, type Timings, TimingsJson } from '../core/schema.ts';
import { ContentStore } from './content-store.ts';
import type { LoadedFilm } from './film-repo.ts';
import { voicedOf } from './narrator.ts';
import { type ImportOptions, Takes } from './takes.ts';
import {
  type ElevenLabsCalls,
  emptyCalls,
  fakeElevenLabs,
  fakeMedia,
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

/** `a` staged by ElevenLabs. */
const staged: Timings = {
  voice: voiceKey(testVoice),
  scenes: {
    a: {
      hash: hashText('Hello world.'),
      file: 'a.mp3',
      duration: 1,
      words: [],
      source: 'elevenlabs',
    },
  },
};

const TIMINGS = '/films/test/narration/timings.json';
const NARRATION = '/films/test/narration';
const defaults: ImportOptions = { only: Option.none(), acceptMismatch: new Set(), whole: false };

/** What the owner said into each recording, by beat. */
const said = new Map([
  ['a', 'Hello world.'],
  ['b', 'The second line.'],
]);

const setup = (recorded: ReadonlyMap<string, string> = said, untimed = false) => {
  const files = new Map<string, Uint8Array>([
    [TIMINGS, text(Schema.encodeSync(TimingsJson)(staged))],
    [`${NARRATION}/a.mp3`, text('Hello world.')],
    ['/rec/a.wav', text('Hello world.')],
    ['/rec/b.m4a', text('The second line.')],
    ['/rec/notes.txt', text('not a take')],
  ]);
  const calls = emptyCalls();
  const layer = Takes.layer.pipe(
    Layer.provideMerge(storeLayer(files)),
    Layer.provide([
      memoryFileSystem(files),
      Path.layer,
      fakeElevenLabs(files, calls, { recorded, untimed }),
      fakeMedia(files),
    ]),
  );
  return { files, calls, layer };
};

/** The film as the tools load it now, from what is stored. */
const loaded = Effect.gen(function* () {
  const film = testFilm(scenes, staged);
  const timings = yield* (yield* ContentStore).read(film.paths.timings);
  return { ...film, timings } satisfies LoadedFilm;
});

/** `film` as a take is kept against it. */
const voiced = (film: LoadedFilm) => Effect.orDie(Effect.fromResult(voicedOf(film)));

const importing = (path: string, options: ImportOptions = defaults) =>
  Effect.gen(function* () {
    const takes = yield* Takes;
    const imported = yield* takes.importPath(yield* voiced(yield* loaded), path, options);
    return { imported, after: (yield* loaded).timings };
  });

const sttOf = (calls: ElevenLabsCalls) => calls.stt.map((f) => f.slice(f.lastIndexOf('/') + 1));

describe('Takes', () => {
  it.effect("imports a folder: each beat's take recorded, named and timed as narrate's", () => {
    const { files, calls, layer } = setup();
    return Effect.gen(function* () {
      const { imported, after } = yield* importing('/rec');
      expect(imported.map((i) => i.id)).toEqual(['a', 'b']);
      for (const [id, spoken] of [
        ['a', 'Hello world.'],
        ['b', 'The second line.'],
      ] as const) {
        const take = after.scenes[id];
        expect(take?.source).toBe('recorded');
        expect(take?.hash).toBe(hashText(spoken));
        // The owner's take is the final voice: a lossless FLAC master, not a staging MP3.
        expect(take?.file).toMatch(new RegExp(`^${id}\\.[0-9a-f]{12}\\.flac$`));
        expect(files.has(`${NARRATION}/${take?.file}`)).toBe(true);
        // Timed by what was heard, in the script's words.
        expect(take?.words.map((w) => w.text)).toEqual(spoken.split(' '));
        expect(take?.duration).toBeGreaterThan(0);
      }
      // Every take was transcribed once, as narrate transcribes.
      expect(sttOf(calls)).toHaveLength(2);
      // The staging take it replaced is gone; the timings name the new one.
      expect(files.has(`${NARRATION}/a.mp3`)).toBe(false);
      expect(after.voice).toBe(staged.voice);
      // The recording itself is kept untouched beside its attempt, byte for byte.
      const takes = yield* Takes;
      for (const [id, source] of [
        ['a', '/rec/a.wav'],
        ['b', '/rec/b.m4a'],
      ] as const) {
        const [made] = yield* takes.attempts((yield* loaded).paths, id);
        const original = Option.getOrThrow(Option.fromNullishOr(made?.original));
        expect(original).toMatch(
          new RegExp(`^${id}/${id}\\.[0-9a-f]{12}\\.orig${source.slice(source.lastIndexOf('.'))}$`),
        );
        expect(files.get(`${NARRATION}/attempts/${original}`)).toEqual(files.get(source));
      }
    }).pipe(Effect.provide(layer));
  });

  it.effect('--only imports just those beats', () => {
    const { layer } = setup();
    return Effect.gen(function* () {
      const { imported, after } = yield* importing('/rec', {
        ...defaults,
        only: Option.some(new Set(['b'])),
      });
      expect(imported.map((i) => i.id)).toEqual(['b']);
      expect(after.scenes['a']?.source).toBe('elevenlabs');
    }).pipe(Effect.provide(layer));
  });

  it.effect('one file imports as the beat it is named for, or the one --only names', () => {
    const { files, layer } = setup();
    files.set('/rec/take 3.wav', text('The second line.'));
    return Effect.gen(function* () {
      const named = yield* importing('/rec/b.m4a');
      expect(named.imported.map((i) => i.id)).toEqual(['b']);
      const other = yield* importing('/rec/take 3.wav', {
        ...defaults,
        only: Option.some(new Set(['b'])),
      });
      expect(other.imported.map((i) => i.id)).toEqual(['b']);
    }).pipe(Effect.provide(layer));
  });

  it.effect('a take that says something else fails, and the staging take stays', () => {
    const { files, layer } = setup(new Map([...said, ['b', 'The second lie of the night.']]));
    return Effect.gen(function* () {
      const error = yield* Effect.flip(importing('/rec/b.m4a'));
      expect(error).toMatchObject({ _tag: 'TakeMismatch', id: 'b' });
      const after = (yield* loaded).timings;
      expect(after.scenes['b']).toBeUndefined();
      expect([...files.keys()].filter((f) => f.startsWith(`${NARRATION}/b.`))).toEqual([]);
      // The attempt is kept in the beat's history, to hear or keep later.
      expect(
        (yield* (yield* Takes).attempts((yield* loaded).paths, 'b')).map((a) => a.wer),
      ).toHaveLength(1);
      // --accept-mismatch names the beats it accepts: another beat's does not cover b.
      const other = yield* Effect.flip(
        importing('/rec/b.m4a', { ...defaults, acceptMismatch: new Set(['a']) }),
      );
      expect(other).toMatchObject({ _tag: 'TakeMismatch', id: 'b' });
      const accepted = yield* importing('/rec/b.m4a', {
        ...defaults,
        acceptMismatch: new Set(['b']),
      });
      expect(accepted.after.scenes['b']?.source).toBe('recorded');
    }).pipe(Effect.provide(layer));
  });

  it.effect("a name heard as the script's heardAs lists it is no mismatch", () => {
    const { files, layer } = setup(new Map([...said, ['b', 'The second Elliot line.']]));
    files.set('/rec/b.wav', text('The second Elliot line.'));
    return Effect.gen(function* () {
      const film = { ...(yield* loaded), scenes: [{ id: 'b', say: 'The second Ellet line.' }] };
      const takes = yield* Takes;
      const strict = yield* Effect.flip(
        takes.importPath(yield* voiced(film), '/rec/b.wav', defaults),
      );
      expect(strict).toMatchObject({ _tag: 'TakeMismatch', id: 'b' });
      const imported = yield* takes.importPath(
        yield* voiced({ ...film, heardAs: { Ellet: ['Elliot'] } }),
        '/rec/b.wav',
        defaults,
      );
      expect(imported.map((i) => [i.id, i.wer])).toEqual([['b', 0]]);
    }).pipe(Effect.provide(layer));
  });

  it.effect('a file for no beat fails, naming it; files that are not recordings are left', () => {
    const { files, layer } = setup();
    files.set('/rec/c.wav', text('Who?'));
    return Effect.gen(function* () {
      const error = yield* Effect.flip(importing('/rec'));
      expect(error).toMatchObject({ _tag: 'RecordingInvalid', file: '/rec/c.wav' });
    }).pipe(Effect.provide(layer));
  });

  it.effect('a transcript with no word times fails typed; no untimed take is made', () => {
    const { layer } = setup(said, true);
    return Effect.gen(function* () {
      const error = yield* Effect.flip(importing('/rec/b.m4a'));
      expect(error).toMatchObject({ _tag: 'SttUntimed' });
      expect((yield* loaded).timings.scenes['b']).toBeUndefined();
      expect(yield* (yield* Takes).attempts((yield* loaded).paths, 'b')).toEqual([]);
      const whole = yield* Effect.flip(importing('/rec/a.wav', { ...defaults, whole: true }));
      expect(whole).toMatchObject({ _tag: 'SttUntimed', file: '/rec/a.wav' });
    }).pipe(Effect.provide(layer));
  });

  it.effect('a recording with nothing in it fails', () => {
    const { files, layer } = setup();
    files.set('/rec/b.wav', text(''));
    return Effect.gen(function* () {
      const error = yield* Effect.flip(importing('/rec/b.wav'));
      expect(error).toMatchObject({ _tag: 'RecordingInvalid', file: '/rec/b.wav' });
    }).pipe(Effect.provide(layer));
  });

  it.effect('the kept take can go back to an earlier attempt', () => {
    const { files, layer } = setup();
    // A second reading, a little slower: other audio, the same words heard.
    files.set('/again/b.wav', text('The second line, again.'));
    return Effect.gen(function* () {
      const first = yield* importing('/rec/b.m4a');
      const firstFile = first.after.scenes['b']?.file;
      const second = yield* importing('/again/b.wav');
      expect(second.after.scenes['b']?.file).not.toBe(firstFile);
      // The replaced take is gone from narration, not from the history.
      expect(files.has(`${NARRATION}/${firstFile}`)).toBe(false);
      const takes = yield* Takes;
      const history = yield* takes.attempts((yield* loaded).paths, 'b');
      expect(history.length).toBe(2);
      const earlier = history.find((a) => a.file === firstFile);
      expect(earlier).toBeDefined();
      yield* takes.keepAttempt(yield* voiced(yield* loaded), 'b', firstFile ?? '', {
        acceptMismatch: false,
      });
      expect((yield* loaded).timings.scenes['b']?.file).toBe(firstFile);
    }).pipe(Effect.provide(layer));
  });

  describe('one long take', () => {
    it.effect('is cut at the silence between beats and imported beat by beat', () => {
      const { files, layer } = setup();
      files.set('/rec/whole.wav', text('Hello world. The second line.'));
      return Effect.gen(function* () {
        const { imported, after } = yield* importing('/rec/whole.wav', {
          ...defaults,
          whole: true,
        });
        expect(imported.map((i) => i.id)).toEqual(['a', 'b']);
        expect(after.scenes['a']?.source).toBe('recorded');
        expect(after.scenes['b']?.source).toBe('recorded');
      }).pipe(Effect.provide(layer));
    });

    it.effect('with --only, every beat is placed and cut, and only those are imported', () => {
      const { files, layer } = setup();
      files.set('/rec/whole.wav', text('Hello world. The second line.'));
      return Effect.gen(function* () {
        const { imported, after } = yield* importing('/rec/whole.wav', {
          ...defaults,
          whole: true,
          only: Option.some(new Set(['b'])),
        });
        expect(imported.map((i) => i.id)).toEqual(['b']);
        expect(after.scenes['a']?.source).toBe('elevenlabs');
        // b's audio starts after a's last word ("world." heard 0.5–0.9 s), not at the reading's start.
        const [made] = yield* (yield* Takes).attempts((yield* loaded).paths, 'b');
        const cut = Option.getOrThrow(Option.fromNullishOr(made?.cut));
        expect(cut.from).toBeGreaterThanOrEqual(0.9);
        expect(cut.to).toBeGreaterThanOrEqual(2.4);
      }).pipe(Effect.provide(layer));
    });

    it.effect('fails naming a beat it cannot place', () => {
      const { files, layer } = setup();
      files.set('/rec/whole.wav', text('Hello world. Something else entirely was read.'));
      return Effect.gen(function* () {
        const error = yield* Effect.flip(importing('/rec/whole.wav', { ...defaults, whole: true }));
        expect(error).toMatchObject({ _tag: 'BeatUnplaced', beat: 'b' });
      }).pipe(Effect.provide(layer));
    });
  });
});
