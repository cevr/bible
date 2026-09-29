// The sound library over a fixture library on disk (a temporary folder, one
// generated one-shot, one generated bed, one procedural chime, one recording)
// with a fake ElevenLabs that writes a seeded burst as `pcm_44100` bytes and
// the real Media. Never a real call: every paid path is counted by the fake.

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
} from 'effect';
import { rng } from '../core/random.ts';
import { pendingOf, requestKey, soundState } from '../core/sfx.ts';
import { ContentStore } from './content-store.ts';
import { ElevenLabs, type SoundEffectRequest } from './elevenlabs.ts';
import { ElevenLabsFailed } from './errors.ts';
import { TALLY_HEADER, SoundLibrary, channelsFor, pcmFromS16, talliedCredits } from './library.ts';
import { Media } from './media.ts';

const LIBRARY = `export const library = {
  'paper.slide': { kind: 'generated', prompt: 'paper slides on a desk', secs: 1, candidates: 4, use: 'one-shot' },
  'amb.court': { kind: 'generated', prompt: 'a quiet stone court', secs: 2, loop: true, candidates: 2, use: 'bed' },
  'tone.chime': {
    kind: 'procedural',
    recipe: { recipe: 'bell', root: 'D5', partials: 'glass', secs: 1 },
    variants: 3,
    use: 'one-shot',
  },
  'wood.knock': {
    kind: 'recorded',
    licence: { id: 'CC0-1.0', author: 'someone', source: 'https://freesound.org/s/1/' },
    use: 'one-shot',
  },
};
export const store = { folder: 'STORE', remote: { todo: 'a private repo or R2' } };
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
    return SoundLibrary.layer(dir).pipe(
      Layer.provide([ContentStore.layer, fakeSfx(calls), config]),
      Layer.provideMerge(Media.layer),
      Layer.merge(Layer.succeed(Fixture, Fixture.of({ dir, storeDir, tally, calls }))),
    );
  }),
).pipe(Layer.provideMerge(BunServices.layer));

/** A test body with the fixture's paths. */
const withLibrary = <A, E, R>(
  body: (at: Fixture['Service']) => Effect.Effect<A, E, R>,
): Effect.Effect<A, E, R | Fixture> =>
  Effect.gen(function* () {
    return yield* body(yield* Fixture);
  });

/** A file the lock kept that is gone or not its bytes. */
const fileBroken = Predicate.or(
  Predicate.isTagged('SoundFileMissing'),
  Predicate.isTagged('SoundCorrupt'),
);

const all = {
  names: Option.none(),
  force: false,
  yes: true,
  cap: Option.none(),
  tally: Option.none(),
};

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

describe('SoundLibrary', () => {
  it.effect.layer(fixture)('plans only generated sounds, by their candidates and seconds', () =>
    withLibrary(() =>
      Effect.gen(function* () {
        const jobs = yield* (yield* SoundLibrary).plan(Option.none(), false);
        expect(jobs.map((j) => [j.name, j.count, j.credits])).toEqual([
          ['amb.court', 2, 160],
          ['paper.slide', 4, 160],
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
          yield* fs.writeFileString(tally, `${TALLY_HEADER}old\tabc\t10\t39800\n`);
          const over = yield* Effect.flip(
            library.make({ ...all, cap: Option.some(40000), tally: Option.some(tally) }),
          );
          expect(over).toMatchObject({ _tag: 'CreditsOverCap', credits: 39800 + 320, cap: 40000 });
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
          expect(talliedCredits(yield* fs.readFileString(tally))).toBe(320);
          for (const v of made) {
            expect(v.file).toMatch(/^files\/(paper\.slide|amb\.court)\/[0-9a-f]{12}\.flac$/);
            expect(yield* fs.exists(`${dir}/${v.file}`)).toBe(true);
            // Stereo bytes are read as stereo: the sound lasts what was asked, both sides kept.
            const asked = new Map([
              ['amb.court', 2],
              ['paper.slide', 1],
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

          const kept = yield* library.keep('paper.slide', [1, 3]);
          expect(kept.variants).toHaveLength(2);
          const rejected = yield* library.reject('paper.slide', [1]);
          expect(rejected.candidates).toHaveLength(1);
          expect(rejected.rejected).toHaveLength(1);
          const missing = yield* Effect.flip(library.keep('paper.slide', [5]));
          expect(missing._tag).toBe('CandidateMissing');
          const loaded = yield* library.load;
          const entry = loaded.library['paper.slide'];
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
          const unkeepable = yield* Effect.flip(library.keep('paper.slide', [1]));
          expect(unkeepable._tag).toBe('CandidateMissing');
          // Declared as the trial was made (the next run imports the edited
          // library.ts), its candidates are the ones that wait, and keep takes them.
          const loaded = yield* library.load;
          const declaredAsTried = {
            kind: 'generated',
            prompt: 'paper slides on a desk',
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

  it.effect.layer(fixture)(
    'unkeeps a kept variant back to waiting, and keeps in place of the kept ones with replace',
    () =>
      withLibrary(() =>
        Effect.gen(function* () {
          const library = yield* SoundLibrary;
          yield* library.make({ ...all, names: Option.some(new Set(['paper.slide'])) });
          const first = yield* library.keep('paper.slide', [1, 2]);
          const [one, two] = first.variants.map((v) => v.sha256);
          // Unkept: the variant waits again as the last candidate, playable by keep.
          const unkept = yield* library.unkeep('paper.slide', [1]);
          expect(unkept.variants.map((v) => v.sha256)).toEqual([two ?? '']);
          expect(unkept.candidates.map((v) => v.sha256)).toContain(one ?? '');
          expect(unkept.candidates).toHaveLength(3);
          const outOfRange = yield* Effect.flip(library.unkeep('paper.slide', [2]));
          expect(outOfRange).toMatchObject({ _tag: 'VariantMissing', index: 2, variants: 1 });
          // Replace: the picks play alone; what played waits again.
          const waiting = unkept.candidates[0]?.sha256;
          const replaced = yield* library.keep('paper.slide', [1], true);
          expect(replaced.variants.map((v) => v.sha256)).toEqual([waiting ?? '']);
          expect(replaced.candidates.map((v) => v.sha256)).toContain(two ?? '');
          expect(replaced.candidates).toHaveLength(3);
          // Unkeeping the last variant leaves nothing playing: the sound is unmade again.
          const none = yield* library.unkeep('paper.slide', [1]);
          expect(none.variants).toEqual([]);
          const loaded = yield* library.load;
          const entry = loaded.library['paper.slide'];
          if (entry)
            expect(soundState(entry, Option.fromUndefinedOr(loaded.lock['paper.slide']))).toEqual({
              _tag: 'Missing',
              candidates: 4,
            });
        }),
      ),
  );

  it.effect.layer(fixture)(
    'push names each file it sends, sends again a store copy that is not its bytes, and names a file lost everywhere',
    () =>
      withLibrary(({ dir, storeDir }) =>
        Effect.gen(function* () {
          const library = yield* SoundLibrary;
          const fs = yield* FileSystem.FileSystem;
          yield* library.make(all);
          const lock = (yield* library.load).lock;
          const files = Object.values(lock).flatMap((e) => e.candidates.map((v) => v.file));
          const first = yield* library.push;
          expect([...first.sent].sort()).toEqual([...files].sort());
          expect(first).toMatchObject({ had: 0, missing: [], total: 6 });
          const broken = files[0] ?? '';
          const gone = files[1] ?? '';
          const lost = files[2] ?? '';
          yield* fs.writeFileString(`${storeDir}/${broken}`, 'half a file');
          yield* fs.remove(`${storeDir}/${gone}`);
          yield* fs.remove(`${storeDir}/${lost}`);
          yield* fs.remove(`${dir}/${lost}`);
          const again = yield* library.push;
          expect([...again.sent].sort()).toEqual([broken, gone].sort());
          expect(again).toMatchObject({ had: 3, missing: [lost], total: 6 });
          // Pull names the file the store lacks, and brings back the rest.
          yield* fs.remove(`${dir}/${gone}`);
          expect(yield* library.pull).toEqual({ fetched: 1, had: 4, missing: [lost] });
        }),
      ),
  );

  it.effect.layer(fixture)('checks files by hash, and syncs them through the folder store', () =>
    withLibrary(({ dir, storeDir }) =>
      Effect.gen(function* () {
        const library = yield* SoundLibrary;
        const fs = yield* FileSystem.FileSystem;
        yield* library.make(all);
        yield* library.keep('paper.slide', [1]);
        yield* library.keep('amb.court', [1]);
        const clean = yield* library.check;
        expect(clean.filter((f) => f._tag !== 'SoundUnmade' && f._tag !== 'LoopSeam')).toEqual([]);
        expect(clean.filter((f) => f._tag === 'SoundUnmade').map((f) => f.name)).toEqual([
          'wood.knock',
        ]);

        expect(yield* library.push).toMatchObject({ had: 0, total: 6 });
        expect(yield* library.push).toEqual({ sent: [], had: 6, missing: [], total: 6 });
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
        expect(yield* library.pull).toEqual({ fetched: 2, had: 4, missing: [] });
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
    'the commit guard refuses generated audio anywhere and public audio that is no CC0 variant',
    () =>
      withLibrary(({ dir }) =>
        Effect.gen(function* () {
          const library = yield* SoundLibrary;
          const media = yield* Media;
          const fs = yield* FileSystem.FileSystem;
          const path = yield* Path.Path;
          yield* library.make({ ...all, names: Option.some(new Set(['paper.slide'])) });
          const generated = (yield* library.keep('paper.slide', [1])).variants[0]?.file ?? '';
          const leak = path.join(dir, '..', 'leak.flac');
          yield* fs.copyFile(path.join(dir, generated), leak);
          const take = path.join(dir, '..', 'take.wav');
          const plane = new Float32Array(4410).map((_, i) => 0.5 * Math.sin(i / 3));
          yield* media.writeWav(take, { rate: 44100, frames: plane.length, channels: [plane] });
          const recorded = (yield* library.importFile(take, 'wood.knock')).file;
          const stray = path.join(dir, 'public', 'stray.wav');
          yield* fs.copyFile(take, stray);
          const notes = path.join(dir, 'notes.txt');
          yield* fs.writeFileString(notes, 'not audio');

          const refused = yield* library.guard([
            path.join(dir, generated),
            leak,
            path.join(dir, recorded),
            stray,
            take,
            notes,
          ]);
          expect(refused.map((r) => [path.basename(r.file), r.licence])).toEqual([
            [path.basename(generated), 'a generated sound (sounds/files is private)'],
            ['leak.flac', 'elevenlabs-paid-sfx (a copy of paper.slide)'],
            ['stray.wav', 'not a CC0 variant in the lock'],
          ]);
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
          const renders = yield* library.render('tone.chime', Option.none());
          expect(renders).toHaveLength(3);
          const heard = yield* library.audition('tone.chime', false);
          expect(yield* fs.exists(heard)).toBe(true);
          // Three one-second chimes, each followed by the gap.
          expect((yield* media.decode(heard)).frames).toBe(3 * (44100 + 22050));
          expect(calls).toHaveLength(0);
        }),
      ),
    30_000,
  );
});
