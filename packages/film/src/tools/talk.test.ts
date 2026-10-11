// A talk end to end through the tools, on a take made in the test: a
// synthetic camera file (`fixtures/sync-clip.ts`) with a tone where someone
// speaks is imported into the footage library and made (its copies, its
// voice, and one hearing by a faked ElevenLabs), a `talk.ts` cut on its
// transcript is written into a films folder, and the tools read it as a film:
// `FilmRepo.load` lays its sections out as scenes, `film talk words` prints
// its words as the edit plays them, the cue report lists its sections,
// `film mix` mixes its voice in the pieces the cut keeps (and a second mix
// makes nothing new), and what needs a narrator refuses it. The take's
// original is never rewritten. No real footage, and nothing is paid for.

import { BunServices } from '@effect/platform-bun';
import { describe, expect, it } from 'effect-bun-test';
import {
  Cause,
  Console,
  Effect,
  Exit,
  FileSystem,
  Layer,
  Option,
  Path,
  Queue,
  References,
  Result,
  Schema,
} from 'effect';
import { Command } from 'effect/cli';
import { fileSource } from '../core/sfx.ts';
import { Talk } from '../core/talk.ts';
import { sceneReport } from './cues.ts';
import { sha256Hex } from './digest.ts';
import { FilmRepo, masterFile, placeFilm } from './film-repo.ts';
import { filmServices } from './film-services.ts';
import { FootageLibrary } from './footage.ts';
import { syncClip } from './fixtures/sync-clip.ts';
import { Mixer, planOf } from './mixer.ts';
import { planNarration } from './narrator.ts';
import { read } from './read-cli.ts';
import { talk } from './talk-cli.ts';
import { emptyCalls, fakeElevenLabs } from './testing.ts';

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
 * faked: every word heard where the fake hears it, one every half second,
 * each 0.4 s long.
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
      folders: { out: path.join(root, 'out'), lab: path.join(root, 'lab') },
      self: ['bun', 'cli.ts'],
      roots: Effect.succeed([]),
      elevenLabs: fakeElevenLabs(new Map(), calls, { heard: new Map([['', SAID]]) }),
    });
  }),
).pipe(Layer.provideMerge(BunServices.layer));

/** The console a run prints to: each line it logs, offered to `lines`. */
const printingTo = (lines: Queue.Queue<string>): Console.Console => ({
  ...globalThis.console,
  log: (...args: ReadonlyArray<unknown>) => {
    Queue.offerUnsafe(lines, args.map(String).join(' '));
  },
});

/** `command …args` run to its end: its exit, and the lines it printed. */
const run = <N extends string, I, C, E, R>(
  command: Command.Command<N, I, C, E, R>,
  args: ReadonlyArray<string>,
) =>
  Effect.gen(function* () {
    const lines = yield* Queue.unbounded<string>();
    const exit = yield* Command.runWith(command, { version: '0' })(args).pipe(
      Effect.provideService(Console.Console, printingTo(lines)),
      Effect.provideService(References.MinimumLogLevel, 'None'),
      Effect.exit,
    );
    return { exit, lines: yield* Queue.clear(lines) };
  });

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

describe('a talk through the tools', () => {
  it.live(
    'is imported, heard once, read as a film, printed, cued and mixed in its pieces, and refused a narrator; its original never rewritten',
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
        const { cut, takes } = Option.getOrThrow(loaded.talk);
        expect(loaded.scenes.map((s) => s.id)).toEqual(['law', 'need']);
        expect(Object.keys(loaded.timings.scenes)).toEqual(['law', 'need']);
        expect(cut.sections.map((s) => s.kept)).toEqual([
          [0, 1, 3, 4, 5],
          [6, 7, 8, 9, 10, 11],
        ]);
        // The strike makes a seam in the first; the late "need" a seam in the second.
        expect(cut.sections.map((s) => s.pieces.length)).toEqual([2, 2]);
        expect(Option.isNone(loaded.voice)).toBe(true);

        const words = yield* run(talk, ['words', 'why']);
        expect(Exit.isSuccess(words.exit)).toBe(true);
        const plays = cut.sections.reduce((sum, s) => sum + s.voice.duration, 0);
        expect(words.lines[0]).toBe(
          `Why the law?  One Question  plays ${plays.toFixed(2)}s, under its 45–65s`,
        );
        expect(words.lines.join('\n')).toContain('[0]The [1]law [2]~was~ [3]given');
        expect(words.lines.join('\n')).toContain('[6]us [7]our [8]need [9]of');

        const placed = yield* placeFilm(loaded);
        const cues = Result.getOrThrow(sceneReport(placed, Option.none()));
        expect(cues.lines.filter((l) => /\blaw\b|\bneed\b/.test(l)).length).toBeGreaterThan(1);
        expect(cues.late).toBe(0);

        // The voice is the take's own file, in the pieces the cut keeps, each where its section plays it.
        const mixing = Result.getOrThrow(
          planOf(loaded, placed, { score: Option.none(), take: Option.none() }),
        );
        const voice = takes['a']?.voice ?? '';
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

        const unvoiced = yield* run(read, ['voice', 'why']);
        expect(
          Exit.match(unvoiced.exit, {
            onSuccess: () => Option.none<string>(),
            onFailure: (cause) => Option.map(Cause.findErrorOption(cause), (e) => e._tag),
          }),
        ).toEqual(Option.some('TalkUnvoiced'));
        const plan = planNarration(loaded, {
          only: Option.none(),
          force: false,
          acceptMismatch: new Set(),
          replaceRecorded: false,
        });
        expect(Result.isFailure(plan) && plan.failure._tag).toBe('TalkUnvoiced');

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
