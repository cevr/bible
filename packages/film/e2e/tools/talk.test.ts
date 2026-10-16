// A talk end to end through the tools on real media, a take made in the
// test: a synthetic camera file (`fixtures/sync-clip.ts`) with a tone where
// someone speaks is imported into the footage library and made (its copies,
// its voice, and one hearing by a faked ElevenLabs), a `talk.ts` cut on its
// transcript is written into a films folder, and `film mix` mixes the take's
// own voice in the pieces the cut keeps (a second mix makes nothing new). The
// take's original is never rewritten. No real footage, nothing paid for, and
// the private store is a folder here. What needs no media (the words, the
// cues, the page's cut, the narrator refused) is `src/tools/talk.test.ts`'s.

import { BunServices } from '@effect/platform-bun';
import { describe, expect, it } from 'effect-bun-test';
import { Effect, FileSystem, Layer, Option, Path, Result, Schema } from 'effect';
import { sourceFile } from '../../src/core/footage.ts';
import { fileSource } from '../../src/core/sfx.ts';
import { Talk } from '../../src/core/talk.ts';
import { sha256Hex } from '../../src/tools/digest.ts';
import { FilmRepo, masterFile, placeFilm } from '../../src/tools/film-repo.ts';
import { filmServices } from '../../src/tools/film-services.ts';
import { FootageLibrary } from '../../src/tools/footage.ts';
import { syncClip } from '../../src/tools/fixtures/sync-clip.ts';
import { Mixer, planOf } from '../../src/tools/mixer.ts';
import { measuredFilm } from '../../src/tools/sound-render.ts';
import { emptyCalls, fakeElevenLabs, privateFolder } from '../../src/tools/testing.ts';

/** What the speaker says, one word every half second from zero, as the fake hears it. */
const SAID = 'The law was given to show us our need of a Saviour';
const WORDS = SAID.split(' ');

/**
 * Where the voice is in the take: inside each word's aligned span, but word
 * 8 ("need"), which the aligner gives the pause before it: its voice comes
 * late, after a pause longer than the talk's `gaps`.
 */
const SPEECH = WORDS.map((_, i): readonly [number, number] => [
  0.5 * i + 0.05,
  0.5 * i + 0.35,
]).with(8, [4.25, 4.35]);

/** The take: a ZV-E10's file, 6.3 s at 30, the clapper's flash between the first two words. */
const CLIP = {
  camera: 'zv-e10',
  frames: 189,
  fps: 30,
  flash: 14,
  pictureStart: 0,
  variable: false,
  speech: SPEECH,
} as const;

/** The edit: the first section strikes "was", the second plays through the late "need". */
const TALK: Talk = {
  title: 'Why the law?',
  format: 'question',
  takes: { a: 'why-the-law' },
  sections: [
    { id: 'law', take: 'a', from: 0, to: 5, cut: [[2, 2]] },
    { id: 'need', take: 'a', from: 6, to: 11 },
  ],
};

/** What the fake ElevenLabs was asked: one hearing, however often the take is made. */
const calls = emptyCalls();

/**
 * The film services over a temp folder, its footage library's speech-to-text
 * faked (every word heard where the fake hears it, one every half second,
 * each 0.4 s long) and its private store a folder in it.
 */
const world = Layer.unwrap(
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const root = yield* fs.makeTempDirectoryScoped();
    return filmServices({
      films: path.join(root, 'films'),
      sounds: path.join(root, 'sounds'),
      footage: path.join(root, 'footage'),
      folders: {
        out: path.join(root, 'out'),
        lab: path.join(root, 'lab'),
        productions: path.join(root, 'productions'),
      },
      self: ['bun', 'cli.ts'],
      roots: Effect.succeed([]),
      elevenLabs: fakeElevenLabs(new Map(), calls, { heard: new Map([['', SAID]]) }),
      privateStore: Option.some(privateFolder(path.join(root, 'store'))),
      staging: Option.some(path.join(root, 'staging')),
      series: Option.none(),
    });
  }),
).pipe(Layer.provideMerge(BunServices.layer));

/** Every file under `dir` with its bytes' hash, by path. */
const tree = (dir: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const names = yield* fs.readDirectory(dir, { recursive: true });
    const files = yield* Effect.filter(names, (name) =>
      Effect.map(fs.stat(path.join(dir, name)), (info) => info.type === 'File'),
    );
    return Object.fromEntries(
      yield* Effect.forEach(files.toSorted(), (name) =>
        Effect.map(fs.readFile(path.join(dir, name)), (bytes) => [name, sha256Hex(bytes)] as const),
      ),
    );
  });

describe('a talk through the tools, on real media', () => {
  it.live(
    "is imported, heard once, and mixed from the take's own voice in its pieces; its original never rewritten",
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const library = yield* FootageLibrary;
        const root = path.dirname(library.dir);
        const films = path.join(root, 'films');
        // Made once the services are up: the clip is encoded with the coders they register.
        const clip = yield* syncClip(CLIP);
        const camera = path.join(root, 'take.mp4');
        yield* fs.writeFile(camera, clip);
        yield* library.importFile(camera, {
          name: 'why-the-law',
          kind: 'take',
          licence: Option.none(),
          credit: Option.none(),
          source: Option.none(),
          tags: [],
        });
        const made = yield* library.make('why-the-law', { hearAgain: false });
        expect(made.made).toEqual(['mezzanine', 'proxy', 'voice', 'transcript']);
        expect(calls.stt.length).toBe(1);
        const again = yield* library.make('why-the-law', { hearAgain: false });
        expect([again.made, calls.stt.length]).toEqual([[], 1]);

        yield* fs.makeDirectory(path.join(films, 'why'), { recursive: true });
        const edit = yield* Schema.encodeEffect(Schema.fromJsonString(Talk))(TALK);
        yield* fs.writeFileString(
          path.join(films, 'why', 'talk.ts'),
          `export const talk = ${edit};\n`,
        );
        const loaded = yield* (yield* FilmRepo).load('why');
        const { cut, takes, copies } = Option.getOrThrow(loaded.talk);
        // The strike makes a seam in the first; the late "need" a seam in the second.
        expect(cut.sections.map((s) => s.pieces.length)).toEqual([2, 2]);

        // The voice is the take's own file, in the pieces the cut keeps, each where its section plays it.
        const placed = yield* placeFilm(loaded);
        const mixing = Result.getOrThrow(
          planOf(yield* measuredFilm(loaded), placed, {
            score: Option.none(),
            inPlace: Option.none(),
          }),
        );
        const source = Option.getOrThrow(Option.fromUndefinedOr(takes['a'])).source;
        const voice = path.join(copies, sourceFile(source, 'voice.flac'));
        expect(voice).toBe(
          path.join(
            root,
            'out',
            'footage',
            'why-the-law',
            sha256Hex(clip).slice(0, 12),
            'voice.flac',
          ),
        );
        expect(yield* fs.exists(voice)).toBe(true);
        expect(mixing.voice.map((t) => [t.name, t.sound, t.from, t.at])).toEqual(
          cut.sections.flatMap((s) => {
            const p = placed.find((q) => q.spec.id === s.id);
            return s.pieces.map((piece) => [
              s.id,
              fileSource(voice),
              piece.from,
              (p?.start ?? 0) + (p?.speechStart ?? 0) + piece.at,
            ]);
          }),
        );
        const mixer = yield* Mixer;
        yield* mixer.mix('why', { stems: false, score: Option.none() });
        // Everything on disk: the films, the footage library, its derived copies and the mix.
        const first = yield* tree(root);
        expect(Object.keys(first)).toContain(path.relative(root, masterFile(loaded.paths)));
        yield* mixer.mix('why', { stems: false, score: Option.none() });
        expect(yield* tree(root)).toEqual(first);
        expect(calls.stt.length).toBe(1);

        const entry = yield* library.entry('why-the-law');
        const { original } = yield* library.files('why-the-law', entry);
        expect([entry.sha256, sha256Hex(yield* fs.readFile(original))]).toEqual([
          sha256Hex(clip),
          sha256Hex(clip),
        ]);
      }).pipe(Effect.provide(world)),
    120_000,
  );
});
