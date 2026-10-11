// A talk through the tools, with no media: a footage library whose lock
// lists a take heard (its transcript written here, a synthetic take's words
// and loudness) and a `talk.ts` cut on it, in a films folder. The tools read
// it as a film: `FilmRepo.load` lays its sections out as scenes, `film talk
// words` prints its words as the edit plays them, the cue report lists its
// sections, the mix plays the take's voice in the pieces the cut keeps, known
// by what it is, and what needs a narrator refuses it. The page, reading the
// same files through the footage route, cuts the same pieces: each frame of
// it shows the moment of the take the mix plays under it. The mix on real
// media is `e2e/tools/talk.test.ts`'s.

import { BunServices } from '@effect/platform-bun';
import { describe, expect, it } from 'effect-bun-test';
import {
  Array as Arr,
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
import { HttpClient, HttpClientRequest, HttpClientResponse } from 'effect/http';
import { syntheticTake } from '../core/fixtures/talk-take.ts';
import {
  FootageLockJson,
  FootageTranscriptJson,
  VOICE_RECIPE,
  sourceFile,
} from '../core/footage.ts';
import { fileSource } from '../core/sfx.ts';
import { filmEnd } from '../core/layout.ts';
import { TALK_FPS, Talk } from '../core/talk.ts';
import { talkFilms } from '../player/talks.ts';
import { Checker } from './checker.ts';
import { sceneReport } from './cues.ts';
import { laidOut, layoutLeg, staticLeg } from './film-check.ts';
import { FilmRepo, placeFilm } from './film-repo.ts';
import { filmServices } from './film-services.ts';
import { ShortLength } from './findings.ts';
import { footageHandler } from './footage-route.ts';
import { Looker } from './looker.ts';
import { planOf } from './mixer.ts';
import { planNarration } from './narrator.ts';
import { read } from './read-cli.ts';
import { talk } from './talk-cli.ts';
import {
  emptyCalls,
  emptyLedger,
  fakeElevenLabs,
  fakeRenderHost,
  privateFolder,
  textBox,
} from './testing.ts';

/** What the speaker says. */
const WORDS = 'The law was given to show us our need of a Saviour'.split(' ');

/** The take's original's hash, whose head names its source. */
const SHA = `0123456789ab${'d'.repeat(52)}`;
const SOURCE = 'why-the-law/0123456789ab';
const TRANSCRIPT = 'why-the-law.0123456789ab.json';

/** The take as heard: a word every 0.4 s, but a long pause before word 8 ("need"). */
const TAKE = syntheticTake(
  WORDS,
  WORDS.map((_, i) => [0.1, 0.9][Number(i === 8)] ?? 0.1),
  SOURCE,
  { width: 1920, height: 1080 },
);

/** The edit: the first section strikes "was", the second plays through the late "need". */
const TALK: Talk = {
  title: 'Why the law?',
  format: 'question',
  takes: { a: 'why-the-law' },
  sections: [
    { id: 'law', take: 'a', from: 0, to: 5, cut: [[2, 2]] },
    { id: 'need', take: 'a', from: 6, to: 11, knobs: { frame: [960, 540], zoom: 1.5 } },
  ],
};

/** Where the world's folders are: the films, the footage library and the outputs. */
interface Folders {
  readonly films: string;
  readonly footage: string;
  readonly out: string;
}

/**
 * The film services over a temp folder holding the library (its lock, the
 * take's transcript) and the talk; nothing that costs anything is reached:
 * the speech-to-text is a fake that is never asked, the private store a
 * folder.
 */
const worldOf = (made: (folders: Folders) => void) =>
  Layer.unwrap(
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fs.makeTempDirectoryScoped();
      const folders = {
        films: path.join(root, 'films'),
        footage: path.join(root, 'footage'),
        out: path.join(root, 'out'),
      };
      yield* fs.makeDirectory(path.join(folders.footage, 'transcripts'), { recursive: true });
      yield* fs.writeFileString(
        path.join(folders.footage, 'library.lock.json'),
        yield* Schema.encodeEffect(FootageLockJson)({
          version: 1,
          footage: {
            'why-the-law': {
              kind: 'take',
              sha256: SHA,
              bytes: 1,
              ext: '.mp4',
              probe: {
                container: 'MP4',
                duration: 6,
                picture: {
                  codec: 'avc',
                  width: 1920,
                  height: 1080,
                  rotation: 0,
                  fps: 30,
                  variable: false,
                  start: 0,
                },
              },
              transcript: TRANSCRIPT,
            },
          },
        }),
      );
      yield* fs.writeFileString(
        path.join(folders.footage, 'transcripts', TRANSCRIPT),
        yield* Schema.encodeEffect(FootageTranscriptJson)({
          source: SOURCE,
          text: WORDS.join(' '),
          words: TAKE.words,
          envelope: TAKE.envelope,
        }),
      );
      yield* fs.makeDirectory(path.join(folders.films, 'why'), { recursive: true });
      const edit = yield* Schema.encodeEffect(Schema.fromJsonString(Talk))(TALK);
      yield* fs.writeFileString(
        path.join(folders.films, 'why', 'talk.ts'),
        `export const talk = ${edit};\n`,
      );
      made(folders);
      return filmServices({
        films: folders.films,
        sounds: path.join(root, 'sounds'),
        footage: folders.footage,
        folders: { out: folders.out, lab: path.join(root, 'lab') },
        self: ['bun', 'cli.ts'],
        roots: Effect.succeed([]),
        elevenLabs: fakeElevenLabs(new Map(), emptyCalls()),
        privateStore: Option.some(privateFolder(path.join(root, 'store'))),
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

/** A page's HTTP client answered by the footage route over the world's library, as the player serves it. */
const routeClient = (folders: Folders) =>
  Layer.succeed(
    HttpClient.HttpClient,
    HttpClient.mapRequest(
      HttpClient.make((request, url) =>
        Effect.map(
          Effect.promise(() =>
            footageHandler({ dir: folders.footage, out: folders.out })(new Request(url)),
          ),
          (response) => HttpClientResponse.fromWeb(request, response),
        ),
      ),
      HttpClientRequest.prependUrl('http://player.test'),
    ),
  );

describe('a talk through the tools', () => {
  let folders: Folders = { films: '', footage: '', out: '' };
  const world = worldOf((made) => {
    folders = made;
  });

  it.live(
    'is read as a film, printed, cued, mixed from its take in its pieces, and refused a narrator',
    () =>
      Effect.gen(function* () {
        const loaded = yield* (yield* FilmRepo).load('why');
        const { cut, copies } = Option.getOrThrow(loaded.talk);
        expect(loaded.scenes.map((s) => s.id)).toEqual(['law', 'need']);
        expect(Object.keys(loaded.timings.scenes)).toEqual(['law', 'need']);
        expect(cut.sections.map((s) => s.kept)).toEqual([
          [0, 1, 3, 4, 5],
          [6, 7, 8, 9, 10, 11],
        ]);
        // The strike makes a seam in the first; the long pause before "need" a seam in the second.
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

        // The voice is the take's own file under the copies, known by its source and recipe.
        const mixing = Result.getOrThrow(
          planOf(loaded, placed, { score: Option.none(), take: Option.none() }),
        );
        const voice = `${copies}/${sourceFile(SOURCE, 'voice.flac')}`;
        expect(voice).toBe(`${folders.out}/footage/why-the-law/0123456789ab/voice.flac`);
        expect(mixing.voice.map((t) => [t.name, t.sound, t.from, t.at, t.content])).toEqual(
          cut.sections.flatMap((s) => {
            const p = placed.find((q) => q.spec.id === s.id);
            return s.pieces.map((piece) => [
              s.id,
              fileSource(voice),
              piece.from,
              (p?.start ?? 0) + (p?.speechStart ?? 0) + piece.at,
              Option.some(`${SOURCE} ${VOICE_RECIPE}`),
            ]);
          }),
        );

        // `film check` holds it to its format: its five seconds are short of a question's 45.
        const checked = yield* staticLeg(loaded, placed);
        expect(checked.filter((f) => f._tag === 'ShortLength')).toEqual([
          ShortLength.make({ short: 'why', length: filmEnd(placed), max: 65, from: 45, to: 65 }),
        ]);

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
      }).pipe(Effect.provide(world)),
  );

  it.live(
    'is cut by the page, over the footage route, on the pieces the tools mix: each frame shows the moment of the take the mix plays under it',
    () =>
      Effect.gen(function* () {
        const loaded = yield* (yield* FilmRepo).load('why');
        const placed = yield* placeFilm(loaded);
        const mixing = Result.getOrThrow(
          planOf(loaded, placed, { score: Option.none(), take: Option.none() }),
        );
        // As the app's films index registers a talk: its module, imported when the page asks.
        const talkModule = () => import(`${folders.films}/why/talk.ts`);
        const page = yield* Effect.promise(() =>
          talkFilms({ why: talkModule }, routeClient(folders)).why(),
        );
        const film = page.film({ audio: '' });
        // The page lays the talk out as the tools do, scene by scene, word by word.
        const laid = (ps: typeof placed) =>
          ps.map((p) => [p.spec.id, p.start, p.dur, p.speechStart, p.voice]);
        expect(laid(film.placed)).toEqual(laid(placed));
        // Each frame mid-way through a piece of the mix reads the take where the piece plays it.
        const reads = mixing.voice.flatMap((piece) => {
          const frames = Math.round(Option.getOrThrow(piece.dur) * TALK_FPS);
          return Arr.makeBy(frames, (k) => {
            const T = piece.at + (k + 0.5) / TALK_FPS;
            return {
              shown: film.footageAt?.(T)?.[0]?.at ?? -1,
              heard: piece.from + (k + 0.5) / TALK_FPS,
            };
          });
        });
        expect(reads.length).toBeGreaterThan(TALK_FPS * 4);
        for (const { shown, heard } of reads) expect(shown).toBeCloseTo(heard, 9);
      }).pipe(Effect.provide(world)),
  );

  /** The browser leg's pages: the talk's, drawn 1080 px wide, a caption reaching x 888 below y 840 (under TikTok's buttons). */
  const pages = Layer.mergeAll(Checker.layer, Looker.layer).pipe(
    Layer.provide(
      fakeRenderHost(emptyLedger(), {
        info: { width: 1080, height: 1920, fps: TALK_FPS, duration: 5, frames: 5 * TALK_FPS },
        probe: () =>
          Effect.succeed({
            texts: [{ ...textBox('the law', 228, 1100, 660, 60), caption: true }],
            inks: [],
          }),
      }),
    ),
  );

  it.live(
    "is checked on its page against every platform's zone by `film check`'s browser leg",
    () =>
      Effect.gen(function* () {
        const loaded = yield* (yield* FilmRepo).load('why');
        const { scope } = Result.getOrThrow(laidOut(loaded, { _tag: 'Film' }));
        const found = yield* layoutLeg(loaded, scope, 2);
        expect(found).toContainEqual(
          expect.objectContaining({
            _tag: 'ShortUnsafeText',
            short: 'why',
            side: 'right',
            zone: 'platforms (TikTok)',
          }),
        );
      }).pipe(Effect.provide(Layer.mergeAll(pages, world))),
  );
});
