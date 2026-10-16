// The sound library over a fixture library on disk (a temporary folder, one
// generated one-shot with a code trial, one generated bed with a code trial
// that fades, so its seams are heard, a code chime, a code tick, one recording)
// with a fake ElevenLabs that writes a seeded burst as `pcm_44100` bytes and
// the real Media, but for its sheets and cards, which are kept by file for
// the cases to read (media.test.ts writes real ones). Never a real call:
// every paid path is counted by the fake.

import { createHash } from 'node:crypto';
import { BunServices } from '@effect/platform-bun';
import { test } from 'bun:test';
import { describe, expect, it } from 'effect-bun-test';
import {
  ConfigProvider,
  Context,
  Effect,
  FileSystem,
  Layer,
  Option,
  Path,
  Predicate,
  Redacted,
  Schema,
} from 'effect';
import type { Pcm } from '../core/audio.ts';
import { rng } from '../core/random.ts';
import { Segment } from '../core/segment.ts';
import type { Raster } from '../core/synth/sheet.ts';
import { LockJson, pendingOf, requestKey, soundState } from '../core/sfx.ts';
import { ContentStore } from './content-store.ts';
import { ElevenLabs, type SoundEffectRequest } from './elevenlabs.ts';
import { ElevenLabsFailed } from '../core/refusals.ts';
import { TALLY_HEADER, SoundLibrary, channelsFor, pcmFromS16, talliedCredits } from './library.ts';
import { Media } from './media.ts';
import { PrivateStore } from './private-store.ts';
import { SoundRender } from './sound-render.ts';
import { FetchHttpClient } from 'effect/http';
import { NO_SCORES, type Scores } from './media-store.ts';

const PAPER_SLIDE = Segment.make('paper.slide');

const LIBRARY = `export const library = {
  'paper.slide': {
    kind: 'generated',
    prompt: 'paper slides on a desk',
    why: 'a test sound',
    secs: 0.5,
    candidates: 4,
    use: 'one-shot',
    code: { sound: { play: { _tag: 'Partials', pitch: 'D5', set: 'glass', secs: 0.6 } }, variants: 3 },
  },
  'amb.court': {
    kind: 'generated',
    prompt: 'a quiet stone court',
    why: 'a test sound',
    secs: 1,
    loop: true,
    candidates: 2,
    use: 'bed',
    code: {
      sound: {
        play: {
          _tag: 'Envelope',
          points: [[0, 1], [0.5, 0]],
          curve: 'linear',
          of: { _tag: 'Noise', color: 'pink', secs: 0.5 },
        },
      },
      variants: 2,
    },
  },
  'tone.chime': {
    kind: 'code',
    sound: { play: { _tag: 'Partials', pitch: 'D5', set: 'glass', secs: 0.6 } },
    variants: 3,
    use: 'one-shot',
  },
  'wood.knock': {
    kind: 'recorded',
    licence: { id: 'CC0-1.0', author: 'someone', source: 'https://freesound.org/s/1/' },
    use: 'one-shot',
  },
  'tone.tick': {
    kind: 'code',
    sound: {
      play: {
        _tag: 'Envelope',
        points: [[0, 1], [0.1, 0]],
        curve: 'linear',
        of: { _tag: 'Partials', pitch: 'E5', set: 'glass', secs: 0.1 },
      },
    },
    variants: 2,
    use: 'one-shot',
  },
};
export const store = { kind: 'folder', folder: 'STORE' };
`;

/**
 * `secs` of a seeded noise burst with a fast attack and a decay, as 16-bit
 * little-endian stereo interleaved (as the sound model sends `pcm_44100`), the
 * right channel at half the left.
 */
const burst = (seed: number, secs: number): Uint8Array => {
  const frames = Math.round(secs * 44100);
  const r = rng(seed);
  const bytes = new Uint8Array(frames * 4);
  const view = new DataView(bytes.buffer);
  for (let i = 0; i < frames; i++) {
    const t = i / 44100;
    const v = (r() * 2 - 1) * 0.3 * Math.exp(-4 * t) * Math.min(1, t * 200);
    view.setInt16(i * 4, Math.round(v * 32767), true);
    view.setInt16(i * 4 + 2, Math.round(v * 0.5 * 32767), true);
  }
  return bytes;
};

/** ElevenLabs that makes only sound effects, each a new burst, and counts them. */
const fakeSfx = (calls: Array<SoundEffectRequest>) =>
  Layer.effect(
    ElevenLabs,
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const refused = (op: string) =>
        Effect.fail(ElevenLabsFailed.make({ op, exitCode: -1, reason: 'not in this test' }));
      return ElevenLabs.of({
        tts: () => refused('tts'),
        dialogue: () => refused('dialogue'),
        stt: () => refused('stt'),
        composeMusic: () => refused('music'),
        ready: Effect.void,
        apiKey: Effect.succeed(Redacted.make('test')),
        soundEffect: (request, out) =>
          Effect.gen(function* () {
            calls.push(request);
            yield* fs.writeFile(out, burst(calls.length, request.secs));
          }).pipe(
            Effect.mapError((e) =>
              ElevenLabsFailed.make({ op: 'sfx', exitCode: -1, reason: e.message }),
            ),
          ),
      });
    }),
  );

/** Where one test's fixture library lives, and the paid calls it saw. */
class Fixture extends Context.Service<
  Fixture,
  {
    readonly dir: string;
    readonly storeDir: string;
    readonly tally: string;
    readonly calls: Array<SoundEffectRequest>;
    /** Every sheet the library wrote, by its file. */
    readonly sheets: Map<string, Raster>;
    /** Every card the library wrote, by its file: its picture and its sound. */
    readonly cards: Map<string, { readonly image: Raster; readonly pcm: Pcm }>;
  }
>()('test/Fixture') {}

/** A fixture library in a fresh temporary folder, its store beside it, and the service over it. */
const fixture = Layer.unwrap(
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const root = yield* fs.makeTempDirectoryScoped();
    const dir = path.join(root, 'sounds');
    const storeDir = path.join(root, 'store');
    yield* fs.makeDirectory(dir, { recursive: true });
    yield* fs.writeFileString(path.join(dir, 'library.ts'), LIBRARY.replace('STORE', storeDir));
    const calls: Array<SoundEffectRequest> = [];
    const tally = path.join(root, 'credits.tsv');
    const config = ConfigProvider.layer(
      ConfigProvider.fromUnknown({ FILMS_OUT: path.join(root, 'out'), HOME: root }),
    );
    // The store the fixture's library.ts declares: a folder beside it.
    const store = PrivateStore.layer(dir).pipe(Layer.provide([FetchHttpClient.layer, config]));
    const sheets = new Map<string, Raster>();
    const cards = new Map<string, { readonly image: Raster; readonly pcm: Pcm }>();
    const media = Layer.effect(
      Media,
      Effect.gen(function* () {
        const inner = yield* Media;
        return Media.of({
          ...inner,
          writePng: (file, image) => Effect.sync(() => void sheets.set(file, image)),
          card: (image, pcm, out) => Effect.sync(() => void cards.set(out, { image, pcm })),
        });
      }),
    ).pipe(Layer.provide(Media.layer));
    return SoundLibrary.layer(dir).pipe(
      Layer.provide([ContentStore.layer, fakeSfx(calls), store, config, SoundRender.layer]),
      Layer.provideMerge(media),
      Layer.merge(
        Layer.succeed(Fixture, Fixture.of({ dir, storeDir, tally, calls, sheets, cards })),
      ),
    );
  }),
).pipe(Layer.provideMerge(BunServices.layer));

const all = {
  names: Option.none(),
  force: false,
  yes: true,
  cap: Option.none(),
  tally: Option.none(),
};

/**
 * What `make` leaves of the fixture's generated sounds (every candidate's
 * FLAC and the lock), made once per file: the cases that start from a made
 * library are given a copy, not a make of their own (six FLAC encodes each).
 */
const madeOnce = Effect.runSync(
  Effect.cached(
    Effect.gen(function* () {
      const { dir } = yield* Fixture;
      const fs = yield* FileSystem.FileSystem;
      yield* (yield* SoundLibrary).make(all);
      const names = yield* fs.readDirectory(`${dir}/files`, { recursive: true });
      const files = yield* Effect.forEach(
        names.filter((name) => name.endsWith('.flac')),
        (name) =>
          Effect.map(fs.readFile(`${dir}/files/${name}`), (bytes) => [name, bytes] as const),
      );
      return { files, lock: yield* fs.readFileString(`${dir}/library.lock.json`) };
    }).pipe(Effect.provide(fixture), Effect.orDie),
  ),
);

/** The fixture with its generated sounds already made: `madeOnce` written into it. */
const made = Layer.effectDiscard(
  Effect.gen(function* () {
    const { dir } = yield* Fixture;
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const snapshot = yield* madeOnce;
    for (const [name, bytes] of snapshot.files) {
      const file = path.join(dir, 'files', name);
      yield* fs.makeDirectory(path.dirname(file), { recursive: true });
      yield* fs.writeFile(file, bytes);
    }
    yield* fs.writeFileString(`${dir}/library.lock.json`, snapshot.lock);
  }).pipe(Effect.orDie),
).pipe(Layer.provideMerge(fixture));

/** A test body with the fixture's paths. */
const withLibrary = <A, E, R>(
  body: (at: Fixture['Service']) => Effect.Effect<A, E, R>,
): Effect.Effect<A, E, R | Fixture> =>
  Effect.gen(function* () {
    return yield* body(yield* Fixture);
  });

/** A path's last part: a file's name. */
const named = (files: ReadonlyArray<string>) =>
  files.map((file) => file.slice(file.lastIndexOf('/') + 1));

/** The colours a sheet draws its marks in. */
const MARKS = { onset: '84,222,120', hit: '255,84,84', loop: '84,206,255' } as const;

/** What a case reads when no sheet was written: a picture with no columns, so no marks. */
const NO_SHEET: Raster = { width: 0, height: 0, rgba: new Uint8Array() };

/**
 * A sheet's marks, left to right: each column whose pixel in the black rows
 * between the spectrogram and the waveform (row 402) is a mark's colour.
 */
const marksOn = (sheet: Raster) =>
  Array.from({ length: sheet.width }, (_, x) => x).flatMap((x) => {
    const i = (402 * sheet.width + x) * 4;
    const colour = [...sheet.rgba.subarray(i, i + 3)].join();
    return Object.entries(MARKS).flatMap(([kind, mark]) => {
      if (colour !== mark) return [];
      return [[x, kind] as const];
    });
  });

/** A file the lock kept that is gone or not its bytes. */
const fileBroken = Predicate.or(
  Predicate.isTagged('SoundFileMissing'),
  Predicate.isTagged('SoundCorrupt'),
);

describe('channelsFor', () => {
  test('reads the channel count off the length of headerless PCM', () => {
    expect(channelsFor(44100 * 22, 44100, 22)).toEqual(Option.some(1));
    expect(channelsFor(44100 * 44, 44100, 22)).toEqual(Option.some(2));
    expect(channelsFor(Math.round(44100 * 0.8 * 2 * 1.05), 44100, 0.8)).toEqual(Option.some(2));
    expect(channelsFor(44100 * 3, 44100, 1)).toEqual(Option.none());
  });

  test('splits interleaved samples into planes', () => {
    const bytes = new Uint8Array(8);
    const view = new DataView(bytes.buffer);
    [16384, -16384, 8192, -8192].forEach((s, i) => view.setInt16(i * 2, s, true));
    const pcm = pcmFromS16(bytes, 44100, 2);
    expect(pcm.frames).toBe(2);
    expect(pcm.channels.map((p) => Array.from(p))).toEqual([
      [0.5, 0.25],
      [-0.5, -0.25],
    ]);
  });
});

describe.concurrent('SoundLibrary', () => {
  it.effect.layer(fixture)('plans only generated sounds, by their candidates and seconds', () =>
    withLibrary(() =>
      Effect.gen(function* () {
        const jobs = yield* (yield* SoundLibrary).plan(Option.none(), false);
        expect(jobs.map((j) => [j.name, j.count, j.credits])).toEqual([
          ['amb.court', 2, 80],
          ['paper.slide', 4, 80],
        ]);
      }),
    ),
  );

  it.effect.layer(fixture)(
    'refuses a paid make without --yes, or over the cap the tally counts',
    () =>
      withLibrary(({ tally, calls }) =>
        Effect.gen(function* () {
          const library = yield* SoundLibrary;
          const fs = yield* FileSystem.FileSystem;
          const unconfirmed = yield* Effect.flip(library.make({ ...all, yes: false }));
          expect(unconfirmed._tag).toBe('PaidUnconfirmed');
          yield* fs.writeFileString(tally, `${TALLY_HEADER}old\tabc\t10\t39900\n`);
          const over = yield* Effect.flip(
            library.make({ ...all, cap: Option.some(40000), tally: Option.some(tally) }),
          );
          expect(over).toMatchObject({ _tag: 'CreditsOverCap', credits: 39900 + 160, cap: 40000 });
          expect(calls).toHaveLength(0);
        }),
      ),
  );

  it.effect.layer(fixture)(
    'makes candidates once, measured, hashed and tallied; keeps and rejects',
    () =>
      withLibrary(({ dir, tally, calls }) =>
        Effect.gen(function* () {
          const library = yield* SoundLibrary;
          const fs = yield* FileSystem.FileSystem;
          const media = yield* Media;
          const made = yield* library.make({
            ...all,
            cap: Option.some(40000),
            tally: Option.some(tally),
          });
          expect(made).toHaveLength(6);
          // Nothing of the downloads is left behind: only the kept FLACs.
          for (const folder of ['paper.slide', 'amb.court'])
            expect(
              (yield* fs.readDirectory(`${dir}/files/${folder}`)).every((f) => f.endsWith('.flac')),
            ).toBe(true);
          expect(calls.map((c) => [c.prompt, c.loop, c.format, c.influence])).toContainEqual([
            'a quiet stone court',
            true,
            'pcm_44100',
            0.3,
          ]);
          expect(talliedCredits(yield* fs.readFileString(tally))).toBe(160);
          for (const v of made) {
            expect(v.file).toMatch(/^files\/(paper\.slide|amb\.court)\/[0-9a-f]{12}\.flac$/);
            expect(yield* fs.exists(`${dir}/${v.file}`)).toBe(true);
            // Stereo bytes are read as stereo: the sound lasts what was asked, both sides kept.
            const asked = new Map([
              ['amb.court', 1],
              ['paper.slide', 0.5],
            ]);
            expect(v.secs).toBe(asked.get(v.file.split('/')[1] ?? '') ?? 0);
            const heard = yield* media.decode(`${dir}/${v.file}`);
            expect(heard.channels).toHaveLength(2);
            expect(v.loudness.momentaryMax).toBeGreaterThan(-40);
            expect(v.licence).toBe('elevenlabs-paid-sfx');
          }
          // Candidates waiting for audition are not made again.
          expect(yield* library.make(all)).toEqual([]);
          expect(calls).toHaveLength(6);

          const kept = yield* library.keep(
            'paper.slide',
            yield* library.takesAt('paper.slide', [1, 3], 'candidates'),
          );
          expect(kept.variants).toHaveLength(2);
          const rejected = yield* library.reject(
            'paper.slide',
            yield* library.takesAt('paper.slide', [1], 'candidates'),
          );
          expect(rejected.candidates).toHaveLength(1);
          expect(rejected.rejected).toHaveLength(1);
          const missing = yield* Effect.flip(library.takesAt('paper.slide', [5], 'candidates'));
          expect(missing._tag).toBe('CandidateMissing');
          const unknown = yield* Effect.flip(library.keep('paper.slide', ['f'.repeat(64)]));
          expect(unknown._tag).toBe('TakeUnknown');
          const loaded = yield* library.load;
          const entry = loaded.library[PAPER_SLIDE];
          expect(entry).toBeDefined();
          if (entry)
            expect(soundState(entry, Option.fromUndefinedOr(loaded.lock['paper.slide']))._tag).toBe(
              'Current',
            );
          // A current sound is never generated again.
          expect(yield* library.plan(Option.some(new Set(['paper.slide'])), false)).toEqual([]);
        }),
      ),
  );

  it.effect.layer(fixture)(
    'a trial makes candidates under other settings, keepable once the declaration says the same',
    () =>
      withLibrary(({ tally, calls }) =>
        Effect.gen(function* () {
          const library = yield* SoundLibrary;
          const fs = yield* FileSystem.FileSystem;
          const trial = {
            influence: Option.some(0.9),
            secs: Option.some(0.8),
            prompt: Option.none(),
          };
          const spend = { yes: true, cap: Option.some(1000), tally: Option.some(tally) };
          const over = yield* Effect.flip(
            library.trial('paper.slide', trial, 3, { ...spend, cap: Option.some(50) }),
          );
          expect(over._tag).toBe('CreditsOverCap');
          const made = yield* library.trial('paper.slide', trial, 3, spend);
          expect(made).toHaveLength(3);
          expect(calls.map((c) => [c.prompt, c.secs, c.influence])).toEqual(
            Array.from({ length: 3 }, () => ['paper slides on a desk', 0.8, 0.9]),
          );
          expect(talliedCredits(yield* fs.readFileString(tally))).toBe(3 * 32);
          // The declaration still asks for its own settings: the trial's candidates do not wait for it.
          const declared = yield* library.plan(Option.some(new Set(['paper.slide'])), false);
          expect(declared.map((j) => j.count)).toEqual([4]);
          const unkeepable = yield* Effect.flip(library.takesAt('paper.slide', [1], 'candidates'));
          expect(unkeepable._tag).toBe('CandidateMissing');
          const tried = made[0]?.sha256 ?? '';
          const notWaiting = yield* Effect.flip(library.keep('paper.slide', [tried]));
          expect(notWaiting._tag).toBe('TakeUnknown');
          // Declared as the trial was made (the next run imports the edited
          // library.ts), its candidates are the ones that wait, and keep takes them.
          const loaded = yield* library.load;
          const declaredAsTried = {
            kind: 'generated',
            prompt: 'paper slides on a desk',
            why: 'a test sound',
            secs: 0.8,
            influence: 0.9,
            use: 'one-shot',
          } as const;
          const waiting = pendingOf(
            declaredAsTried,
            Option.fromUndefinedOr(loaded.lock['paper.slide']),
          );
          // Candidates land in the lock as each call finishes, so compare as sets.
          expect(waiting.map((v) => v.sha256).toSorted()).toEqual(
            made.map((v) => v.sha256).toSorted(),
          );
          expect(made.every((v) => v.request === requestKey(declaredAsTried))).toBe(true);
          const wrong = yield* Effect.flip(library.trial('tone.chime', trial, 1, spend));
          expect(wrong._tag).toBe('SoundKindMismatch');
          const tooLong = yield* Effect.flip(
            library.trial('paper.slide', { ...trial, secs: Option.some(40) }, 1, spend),
          );
          expect(tooLong._tag).toBe('TrialInvalid');
          expect(calls).toHaveLength(3);
        }),
      ),
  );

  it.effect.layer(made)(
    'unkeeps a kept variant back to waiting, and keeps in place of the kept ones with replace',
    () =>
      withLibrary(() =>
        Effect.gen(function* () {
          const library = yield* SoundLibrary;
          const first = yield* library.keep(
            'paper.slide',
            yield* library.takesAt('paper.slide', [1, 2], 'candidates'),
          );
          const [one = '', two = ''] = first.variants.map((v) => v.sha256);
          // Unkept: the variant waits again as the last candidate, playable by keep.
          const unkept = yield* library.unkeep('paper.slide', [one]);
          expect(unkept.variants.map((v) => v.sha256)).toEqual([two]);
          expect(unkept.candidates.map((v) => v.sha256)).toContain(one);
          expect(unkept.candidates).toHaveLength(3);
          const outOfRange = yield* Effect.flip(library.takesAt('paper.slide', [2], 'kept'));
          expect(outOfRange).toMatchObject({ _tag: 'VariantMissing', index: 2, variants: 1 });
          const notKept = yield* Effect.flip(library.unkeep('paper.slide', [one]));
          expect(notKept._tag).toBe('TakeUnknown');
          // Replace: the picks play alone; what played waits again.
          const waiting = unkept.candidates[0]?.sha256 ?? '';
          const replaced = yield* library.keep('paper.slide', [waiting], true);
          expect(replaced.variants.map((v) => v.sha256)).toEqual([waiting]);
          expect(replaced.candidates.map((v) => v.sha256)).toContain(two);
          expect(replaced.candidates).toHaveLength(3);
          // Unkeeping the last variant leaves nothing playing: the sound is unmade again.
          const none = yield* library.unkeep('paper.slide', [waiting]);
          expect(none.variants).toEqual([]);
          const loaded = yield* library.load;
          const entry = loaded.library[PAPER_SLIDE];
          if (entry)
            expect(soundState(entry, Option.fromUndefinedOr(loaded.lock['paper.slide']))).toEqual({
              _tag: 'Missing',
              candidates: 4,
            });
        }),
      ),
  );

  it.effect.layer(made)(
    'keeps the take its hash names, wherever a curation that landed first moved it',
    () =>
      withLibrary(() =>
        Effect.gen(function* () {
          const library = yield* SoundLibrary;
          // Both acts are decided while the candidates are [a, b, c, d]; rejecting a lands first.
          const waiting = (yield* library.load).lock['paper.slide']?.candidates ?? [];
          const [a = '', b = ''] = waiting.map((v) => v.sha256);
          yield* library.reject('paper.slide', [a]);
          const kept = yield* library.keep('paper.slide', [b]);
          expect(kept.variants.map((v) => v.sha256)).toEqual([b]);
          const gone = yield* Effect.flip(library.keep('paper.slide', [a]));
          expect(gone).toMatchObject({ _tag: 'TakeUnknown', sound: 'paper.slide', take: a });
        }),
      ),
  );

  it.effect.layer(made)(
    'push names each file it sends, sends again a store copy that is not its bytes, and names a file lost everywhere',
    () =>
      withLibrary(({ dir, storeDir }) =>
        Effect.gen(function* () {
          const library = yield* SoundLibrary;
          const fs = yield* FileSystem.FileSystem;
          const lock = (yield* library.load).lock;
          const files = Object.values(lock).flatMap((e) => e.candidates.map((v) => v.file));
          const first = yield* library.push(NO_SCORES, Option.none());
          expect([...first.sent].sort()).toEqual([...files].sort());
          expect(first).toMatchObject({ had: 0, missing: [], total: 6 });
          const broken = files[0] ?? '';
          const gone = files[1] ?? '';
          const lost = files[2] ?? '';
          yield* fs.writeFileString(`${storeDir}/${broken}`, 'half a file');
          yield* fs.remove(`${storeDir}/${gone}`);
          yield* fs.remove(`${storeDir}/${lost}`);
          yield* fs.remove(`${dir}/${lost}`);
          const again = yield* library.push(NO_SCORES, Option.none());
          expect([...again.sent].sort()).toEqual([broken, gone].sort());
          expect(again).toMatchObject({ had: 3, missing: [lost], total: 6 });
          // Pull names the file the store lacks, and brings back the rest.
          yield* fs.remove(`${dir}/${gone}`);
          expect(yield* library.pull(NO_SCORES)).toEqual({ fetched: 1, had: 4, missing: [lost] });

          // A film's score goes to the store beside the library's files, under its own key.
          const score = `${dir}/../films/f/sound/piano-1.mp3`;
          yield* fs.makeDirectory(`${dir}/../films/f/sound`, { recursive: true });
          yield* fs.writeFileString(score, 'a score');
          const scores: Scores = {
            files: [
              {
                key: 'scores/f/piano-1.mp3',
                file: score,
                sha256: createHash('sha256').update('a score').digest('hex'),
              },
            ],
          };
          const sent = yield* library.push(scores, Option.none());
          expect(sent.sent).toEqual(['scores/f/piano-1.mp3']);
          expect(yield* fs.readFileString(`${storeDir}/scores/f/piano-1.mp3`)).toBe('a score');
          yield* fs.remove(score);
          expect(yield* library.pull(scores)).toEqual({ fetched: 1, had: 5, missing: [lost] });
          expect(yield* fs.readFileString(score)).toBe('a score');
        }),
      ),
  );

  it.effect.layer(made)(
    'push --from moves an older folder store into the store, names what neither holds, deletes nothing, and runs again as a no-op',
    () =>
      withLibrary(({ dir, storeDir }) =>
        Effect.gen(function* () {
          const library = yield* SoundLibrary;
          const fs = yield* FileSystem.FileSystem;
          const lock = (yield* library.load).lock;
          const files = Object.values(lock)
            .flatMap((e) => e.candidates.map((v) => v.file))
            .toSorted();
          // The files live only in an older folder store; one of them nowhere at all.
          const old = `${dir}/../old-store`;
          for (const file of files) {
            yield* fs.makeDirectory(`${old}/${file.split('/').slice(0, -1).join('/')}`, {
              recursive: true,
            });
            yield* fs.rename(`${dir}/${file}`, `${old}/${file}`);
          }
          const lost = files[0] ?? '';
          yield* fs.remove(`${old}/${lost}`);
          // And one of them there with other bytes: not its hash, so not sent.
          const bent = files[1] ?? '';
          yield* fs.writeFileString(`${old}/${bent}`, 'not these bytes');

          const moved = yield* library.push(NO_SCORES, Option.some(old));
          expect([...moved.sent].sort()).toEqual(files.slice(2));
          expect([...moved.missing].sort()).toEqual([lost, bent].sort());
          expect(moved).toMatchObject({ had: 0, total: files.length });
          for (const file of files.slice(2)) {
            expect(yield* fs.exists(`${storeDir}/${file}`)).toBe(true);
            expect(yield* fs.exists(`${old}/${file}`)).toBe(true);
          }
          const again = yield* library.push(NO_SCORES, Option.some(old));
          expect(again).toMatchObject({ sent: [], had: files.length - 2, total: files.length });
          expect([...again.missing].sort()).toEqual([lost, bent].sort());
        }),
      ),
  );

  it.effect.layer(made)('checks files by hash, and syncs them through the folder store', () =>
    withLibrary(({ dir, storeDir }) =>
      Effect.gen(function* () {
        const library = yield* SoundLibrary;
        const fs = yield* FileSystem.FileSystem;
        yield* library.keep(
          'paper.slide',
          yield* library.takesAt('paper.slide', [1], 'candidates'),
        );
        yield* library.keep('amb.court', yield* library.takesAt('amb.court', [1], 'candidates'));
        const clean = yield* library.check;
        expect(clean.filter((f) => f._tag !== 'SoundUnmade' && f._tag !== 'LoopSeam')).toEqual([]);
        expect(clean.filter((f) => f._tag === 'SoundUnmade').map((f) => f.name)).toEqual([
          'wood.knock',
        ]);

        expect(yield* library.push(NO_SCORES, Option.none())).toMatchObject({ had: 0, total: 6 });
        expect(yield* library.push(NO_SCORES, Option.none())).toEqual({
          sent: [],
          had: 6,
          missing: [],
          total: 6,
        });
        const lock = (yield* library.load).lock;
        const slide = lock['paper.slide']?.variants[0]?.file ?? '';
        const court = lock['amb.court']?.variants[0]?.file ?? '';
        expect(yield* fs.exists(`${storeDir}/${slide}`)).toBe(true);
        yield* fs.remove(`${dir}/${slide}`);
        yield* fs.writeFileString(`${dir}/${court}`, 'not this');
        const broken = yield* library.check;
        expect(broken.map((f) => f._tag)).toEqual(
          expect.arrayContaining(['SoundFileMissing', 'SoundCorrupt']),
        );
        expect(yield* library.pull(NO_SCORES)).toEqual({ fetched: 2, had: 4, missing: [] });
        const mended = yield* library.check;
        expect(mended.filter(fileBroken)).toEqual([]);

        // A generated file under public/ may not be published.
        yield* fs.makeDirectory(`${dir}/public/paper.slide`, { recursive: true });
        yield* fs.copyFile(`${dir}/${slide}`, `${dir}/public/paper.slide/copy.flac`);
        const leaked = yield* library.check;
        expect(leaked.filter((f) => f._tag === 'SoundLicence')).toHaveLength(1);
      }),
    ),
  );

  it.effect.layer(made)(
    'keeping a take records where it starts and hits; sfx describe fills a lock that lacks them',
    () =>
      withLibrary(({ dir }) =>
        Effect.gen(function* () {
          const library = yield* SoundLibrary;
          const fs = yield* FileSystem.FileSystem;
          yield* library.keep(
            'paper.slide',
            yield* library.takesAt('paper.slide', [1], 'candidates'),
          );
          const kept = (yield* library.load).lock['paper.slide']?.variants[0];
          // The fixture's burst rises within 5 ms and is loudest in its second 10 ms.
          expect(kept).toMatchObject({ onset: 0, hit: 0.01 });
          const timing = Predicate.isTagged('TimingUnrecorded');
          expect((yield* library.check).filter(timing)).toEqual([]);

          // A lock written before takes were described: check says so, describe mends it.
          const file = `${dir}/library.lock.json`;
          yield* fs.writeFileString(
            file,
            (yield* fs.readFileString(file)).replace(/"(onset|hit)": [0-9.]+,?/g, ''),
          );
          expect(
            (yield* library.check).filter(timing).map((f) => [f._tag, 'name' in f && f.name]),
          ).toEqual([['TimingUnrecorded', 'paper.slide']]);
          expect(yield* library.describe).toBeGreaterThan(0);
          expect((yield* library.check).filter(timing)).toEqual([]);
          expect((yield* library.load).lock['paper.slide']?.variants[0]).toMatchObject({
            onset: 0,
            hit: 0.01,
          });
        }),
      ),
  );

  it.effect.layer(made)(
    'checks the takes a generated sound keeps, not those a code sound’s record keeps',
    () =>
      withLibrary(({ dir }) =>
        Effect.gen(function* () {
          const library = yield* SoundLibrary;
          const fs = yield* FileSystem.FileSystem;
          yield* library.keep(
            'paper.slide',
            yield* library.takesAt('paper.slide', [1], 'candidates'),
          );
          // The code chime's record keeps the slide's take, as a sound made
          // code keeps the takes it played; the take is gone and undescribed.
          const file = `${dir}/library.lock.json`;
          const lock = yield* Schema.decodeEffect(LockJson)(yield* fs.readFileString(file));
          const kept = lock['paper.slide']?.variants ?? [];
          const both = { ...lock, 'tone.chime': { variants: kept, candidates: [], rejected: [] } };
          yield* fs.writeFileString(
            file,
            (yield* Schema.encodeEffect(LockJson)(both)).replace(/"(onset|hit)": [0-9.]+,?/g, ''),
          );
          yield* fs.remove(`${dir}/${kept[0]?.file ?? ''}`);
          const findings = yield* library.check;
          const of = (name: string) =>
            findings.filter((f) => 'name' in f && f.name === name).map((f) => f._tag);
          expect(of('paper.slide')).toEqual(['SoundFileMissing', 'TimingUnrecorded']);
          expect(of('tone.chime')).toEqual([]);
        }),
      ),
  );

  it.effect.layer(fixture)('imports a recording, trimmed, into public/ under its licence', () =>
    withLibrary(({ dir }) =>
      Effect.gen(function* () {
        const library = yield* SoundLibrary;
        const media = yield* Media;
        const path = yield* Path.Path;
        const source = path.join(dir, '..', 'knock.wav');
        const frames = 44100;
        const plane = new Float32Array(frames);
        for (let i = 22050; i < 22050 + 2205; i++) plane[i] = 0.5 * Math.sin(i / 3);
        yield* media.writeWav(source, { rate: 44100, frames, channels: [plane] });
        const variant = yield* library.importFile(source, 'wood.knock');
        expect(variant.file).toMatch(/^public\/wood\.knock\/[0-9a-f]{12}\.flac$/);
        expect(variant.licence).toBe('CC0-1.0');
        expect(variant.secs).toBeGreaterThan(0.05);
        expect(variant.secs).toBeLessThan(0.1);
        const wrong = yield* Effect.flip(library.importFile(source, 'tone.chime'));
        expect(wrong._tag).toBe('SoundKindMismatch');
        const check = yield* library.check;
        expect(check.filter((f) => f._tag === 'SoundLicence')).toEqual([]);
      }),
    ),
  );

  it.effect.layer(fixture)(
    'auditions and renders without a paid call',
    () =>
      withLibrary(({ calls }) =>
        Effect.gen(function* () {
          const library = yield* SoundLibrary;
          const fs = yield* FileSystem.FileSystem;
          const media = yield* Media;
          const renders = yield* library.render('tone.chime', {
            seed: Option.none(),
            trial: false,
            sheet: false,
          });
          expect(renders).toHaveLength(3);
          const heard = yield* library.audition('tone.chime', 'plays');
          expect(yield* fs.exists(heard)).toBe(true);
          // Three 0.6-second chimes, each followed by the half-second gap.
          expect((yield* media.decode(heard)).frames).toBe(3 * (26460 + 22050));
          expect(calls).toHaveLength(0);
        }),
      ),
    30_000,
  );

  it.effect.layer(fixture)('curates no take of a code sound: its seeds play as its data says', () =>
    withLibrary(({ calls }) =>
      Effect.gen(function* () {
        const library = yield* SoundLibrary;
        const kept = yield* Effect.flip(library.keep('tone.tick', ['a take']));
        expect(kept).toMatchObject({
          _tag: 'SoundKindMismatch',
          name: 'tone.tick',
          kind: 'code',
          wanted: 'generated or recorded',
        });
        const unkept = yield* Effect.flip(library.unkeep('tone.chime', ['a take']));
        expect(unkept).toMatchObject({ _tag: 'SoundKindMismatch', kind: 'code' });
        const rejected = yield* Effect.flip(library.reject('tone.tick', ['a take']));
        expect(rejected._tag).toBe('SoundKindMismatch');
        const picked = yield* Effect.flip(library.takesAt('tone.chime', [1], 'kept'));
        expect(picked._tag).toBe('SoundKindMismatch');
        expect(calls).toHaveLength(0);
      }),
    ),
  );

  it.effect.layer(fixture)('renders a code sound from its graph, each seed its own draw', () =>
    withLibrary(({ calls }) =>
      Effect.gen(function* () {
        const library = yield* SoundLibrary;
        const media = yield* Media;
        expect([...(yield* library.load).code.keys()]).toEqual(['tone.chime', 'tone.tick']);
        const renders = yield* library.render('tone.tick', {
          seed: Option.none(),
          trial: false,
          sheet: false,
        });
        expect(named(renders)).toEqual(['tone.tick-1.wav', 'tone.tick-2.wav']);
        const [one, two] = yield* Effect.forEach(renders, (file) => media.decode(file));
        expect(one?.frames).toBe(4410);
        expect(one?.channels[0]).not.toEqual(two?.channels[0]);
        // Any seed renders, past the variants that play.
        expect(
          named(
            yield* library.render('tone.tick', {
              seed: Option.some(7),
              trial: false,
              sheet: false,
            }),
          ),
        ).toEqual(['tone.tick-7.wav']);
        // Two 0.1-second ticks, each followed by the half-second gap.
        const heard = yield* library.audition('tone.tick', 'plays');
        expect((yield* media.decode(heard)).frames).toBe(2 * (4410 + 22050));
        const wrong = yield* Effect.flip(
          library.render('paper.slide', { seed: Option.none(), trial: false, sheet: false }),
        );
        expect(wrong).toMatchObject({ _tag: 'SoundKindMismatch', wanted: 'code' });
        expect(calls).toHaveLength(0);
      }),
    ),
  );

  it.effect.layer(fixture)('renders a generated sound’s code trial, each seed its own draw', () =>
    withLibrary(({ calls }) =>
      Effect.gen(function* () {
        const library = yield* SoundLibrary;
        const media = yield* Media;
        expect([...(yield* library.load).trials.keys()]).toEqual(['paper.slide', 'amb.court']);
        const court = yield* library.render('amb.court', {
          seed: Option.none(),
          trial: true,
          sheet: false,
        });
        expect(named(court)).toEqual(['amb.court-trial-1.wav', 'amb.court-trial-2.wav']);
        const [one, two] = yield* Effect.forEach(court, (file) => media.decode(file));
        expect(one?.frames).toBe(22050);
        expect(one?.channels[0]).not.toEqual(two?.channels[0]);
        // Any seed renders, past the trial's own.
        expect(
          named(
            yield* library.render('amb.court', { seed: Option.some(5), trial: true, sheet: false }),
          ),
        ).toEqual(['amb.court-trial-5.wav']);
        const none = yield* Effect.flip(
          library.render('tone.tick', { seed: Option.none(), trial: true, sheet: false }),
        );
        expect(none).toMatchObject({ _tag: 'CodeTrialMissing', name: 'tone.tick', kind: 'code' });
        // Its seeds heard as the bed plays: two half-second seeds, each followed by the half-second gap.
        const heard = yield* library.audition('amb.court', 'trial');
        expect(named([heard])).toEqual(['audition-amb.court-trial.wav']);
        expect((yield* media.decode(heard)).frames).toBe(2 * (22050 + 22050));
        const unheard = yield* Effect.flip(library.audition('tone.tick', 'trial'));
        expect(unheard).toMatchObject({ _tag: 'CodeTrialMissing', name: 'tone.tick' });
        expect(calls).toHaveLength(0);
      }),
    ),
  );

  it.effect.layer(fixture)(
    'draws each render’s sheet beside its WAV: a bed marked where the mix loops it, a one-shot at its onset and hit',
    () =>
      withLibrary(({ calls, sheets }) =>
        Effect.gen(function* () {
          const library = yield* SoundLibrary;
          const bed = yield* library.render('amb.court', {
            seed: Option.some(1),
            trial: true,
            sheet: true,
          });
          expect(named(bed)).toEqual(['amb.court-trial-1.wav', 'amb.court-trial-1.png']);
          // The mix crosses a half-second bed's last eighth into its head: 0.375 s in, column 900 of 1200.
          expect(marksOn(sheets.get(bed[1] ?? '') ?? NO_SHEET)).toEqual([[900, 'loop']]);
          const tick = yield* library.render('tone.tick', {
            seed: Option.none(),
            trial: false,
            sheet: true,
          });
          expect(named(tick)).toEqual([
            'tone.tick-1.wav',
            'tone.tick-1.png',
            'tone.tick-2.wav',
            'tone.tick-2.png',
          ]);
          for (const png of [tick[1], tick[3]]) {
            const kinds = marksOn(sheets.get(png ?? '') ?? NO_SHEET).map(([, kind]) => kind);
            expect(kinds).toContain('hit');
            expect(kinds).not.toContain('loop');
          }
          // Without --sheet, a WAV alone.
          expect(sheets.size).toBe(3);
          expect(calls).toHaveLength(0);
        }),
      ),
  );

  it.effect.layer(made)(
    'clips a sound for an ask: what plays now, its code trial, and both, each under its sheet',
    () =>
      withLibrary(({ dir, calls, sheets, cards }) =>
        Effect.gen(function* () {
          const library = yield* SoundLibrary;
          // The first case on a made library makes it, in its own fixture: count from here.
          const paid = calls.length;
          const out = `${dir}/../ab`;
          yield* library.keep(
            'paper.slide',
            yield* library.takesAt('paper.slide', [1], 'candidates'),
          );
          const files = yield* library.ab('paper.slide', out);
          expect(named(files)).toEqual([
            'paper.slide.now.mp4',
            'paper.slide.now.png',
            'paper.slide.code.mp4',
            'paper.slide.code.png',
            'paper.slide.now-then-code.mp4',
            'paper.slide.now-then-code.png',
          ]);
          const [now, code, both] = [files[0], files[2], files[4]].map((file) =>
            cards.get(file ?? ''),
          );
          // The half-second take, then the trial's three 0.6-second seeds, each followed by the
          // half-second gap, levelled into one channel; both, a second apart.
          expect([now, code].map((card) => card?.pcm.frames)).toEqual([
            22050 + 22050,
            3 * (26460 + 22050),
          ]);
          expect(both?.pcm.frames).toBe(22050 + 22050 + 3 * (26460 + 22050) + 22050);
          expect(both?.pcm.channels).toHaveLength(1);
          // Each card's picture is its sheet, written beside it, a hit marked on every block.
          for (const [i, card] of [now, code, both].entries()) {
            expect(card?.image).toBe(sheets.get(files[2 * i + 1] ?? ''));
            const hits = marksOn(card?.image ?? NO_SHEET).filter(([, kind]) => kind === 'hit');
            expect(hits).toHaveLength([1, 3, 4][i] ?? 0);
          }
          const none = yield* Effect.flip(library.ab('tone.tick', out));
          expect(none).toMatchObject({ _tag: 'CodeTrialMissing', name: 'tone.tick' });
          expect(calls).toHaveLength(paid);
        }),
      ),
  );

  it.effect.layer(made)(
    'clips a bed for an ask from its kept take, and refuses one with nothing kept',
    () =>
      withLibrary(({ dir, calls, cards }) =>
        Effect.gen(function* () {
          const library = yield* SoundLibrary;
          // The first case on a made library makes it, in its own fixture: count from here.
          const paid = calls.length;
          const out = `${dir}/../ab`;
          const unkept = yield* Effect.flip(library.ab('amb.court', out));
          expect(unkept).toMatchObject({ _tag: 'SoundUnmade', name: 'amb.court', candidates: 2 });
          yield* library.keep('amb.court', yield* library.takesAt('amb.court', [2], 'candidates'));
          const files = yield* library.ab('amb.court', out);
          const [now, code, both] = [files[0], files[2], files[4]].map((file) =>
            cards.get(file ?? ''),
          );
          // The one-second take, then its gap; the trial's two half-second seeds, each with its gap.
          expect([now, code].map((card) => card?.pcm.frames)).toEqual([
            44100 + 22050,
            2 * (22050 + 22050),
          ]);
          expect(both?.pcm.frames).toBe(44100 + 44100 + 2 * (22050 + 22050));
          // A clip cuts a bed where it ends: no loop is marked.
          expect(marksOn(both?.image ?? NO_SHEET)).toEqual([]);
          expect(calls).toHaveLength(paid);
        }),
      ),
  );

  it.effect.layer(fixture)('hears a code trial bed’s seams, each named as the trial’s', () =>
    withLibrary(() =>
      Effect.gen(function* () {
        const seams = (yield* (yield* SoundLibrary).check).filter((f) => f._tag === 'LoopSeam');
        // It fades to nothing: each seed's tail is far quieter than its head.
        expect(seams.map((f) => [f.name, 'variant' in f && f.variant])).toEqual([
          ['amb.court (trial)', 1],
          ['amb.court (trial)', 2],
        ]);
        expect(seams[0]?.message).toContain('seed 1: its loop point jumps');
        expect(seams[0]?.message).toContain('edit its data until every seed loops');
      }),
    ),
  );

  it.effect.layer(made)('compares a code trial with the take that plays, free', () =>
    withLibrary(({ calls }) =>
      Effect.gen(function* () {
        const library = yield* SoundLibrary;
        const unkept = yield* Effect.flip(library.compare('amb.court'));
        expect(unkept).toMatchObject({ _tag: 'SoundUnmade', name: 'amb.court', candidates: 2 });
        yield* library.keep('amb.court', yield* library.takesAt('amb.court', [2], 'candidates'));
        const compared = yield* library.compare('amb.court');
        expect(compared.plays.map((m) => m.label)).toEqual(['take 1']);
        expect(compared.trial.map((m) => m.label)).toEqual(['seed 1', 'seed 2']);
        const [take] = compared.plays;
        const [one, two] = compared.trial;
        expect(take.profile.secs).toBeCloseTo(1, 2);
        expect(one?.profile.secs).toBe(0.5);
        expect(one?.profile.bands).not.toEqual(two?.profile.bands);
        // The burst is white noise and the trial pink: the take is the brighter.
        expect(take.profile.centroid).toBeGreaterThan(one?.profile.centroid ?? 0);
        // A one-shot's trial beside its kept take.
        yield* library.keep(
          'paper.slide',
          yield* library.takesAt('paper.slide', [1], 'candidates'),
        );
        const slide = yield* library.compare('paper.slide');
        expect(slide.plays.map((m) => m.label)).toEqual(['take 1']);
        expect(slide.trial.map((m) => m.label)).toEqual(['seed 1', 'seed 2', 'seed 3']);
        expect(slide.trial[0].profile.secs).toBe(0.6);
        const none = yield* Effect.flip(library.compare('tone.tick'));
        expect(none).toMatchObject({ _tag: 'CodeTrialMissing', name: 'tone.tick' });
        expect(calls).toHaveLength(0);
      }),
    ),
  );
});
