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
  Predicate,
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
import { sceneAddress } from '../core/address.ts';
import { filmEnd, sceneAt } from '../core/layout.ts';
import { TALK_FPS, Talk } from '../core/talk.ts';
import { LabHttpApi, TalkWords, labUrls } from '../core/api.ts';
import { LabWrite } from '../core/schema.ts';
import { routesOf } from '../core/testing.ts';
import { talkFilms } from '../player/talks.ts';
import { labHandler } from './lab.ts';
import { Checker } from './checker.ts';
import { sceneReport } from './cues.ts';
import { drawLeg, laidOut, layoutLeg, staticLeg } from './film-check.ts';
import { FilmRepo, placeFilm } from './film-repo.ts';
import { filmServices } from './film-services.ts';
import { ShortLength, addressOf } from './findings.ts';
import { footageHandler } from './footage-route.ts';
import { Looker } from './looker.ts';
import { planOf } from './mixer.ts';
import { planNarration } from './narrator.ts';
import { read } from './read-cli.ts';
import { measuredFilm } from './sound-render.ts';
import { talk } from './talk-cli.ts';
import {
  echoPages,
  emptyCalls,
  emptyLedger,
  fakeElevenLabs,
  fakeRenderHost,
  freshFilm,
  privateFolder,
  textBox,
} from './testing.ts';

/** A vertical finding at a second of the talk: a line of text, or its hook. */
const atASecond = Predicate.or(
  Predicate.isTagged('ShortUnsafeText'),
  Predicate.isTagged('ShortHook'),
);

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
        folders: {
          out: folders.out,
          lab: path.join(root, 'lab'),
          productions: path.join(root, 'productions'),
        },
        self: ['bun', 'cli.ts'],
        roots: Effect.succeed([]),
        elevenLabs: fakeElevenLabs(new Map(), emptyCalls()),
        privateStore: Option.some(privateFolder(path.join(root, 'store'))),
        staging: Option.some(path.join(root, 'staging')),
        series: Option.none(),
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
          planOf(yield* measuredFilm(loaded), placed, {
            score: Option.none(),
            inPlace: Option.none(),
          }),
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
          ShortLength.make({
            short: 'why',
            length: filmEnd(placed),
            max: 65,
            from: 45,
            to: 65,
            talk: true,
          }),
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
          planOf(yield* measuredFilm(loaded), placed, {
            score: Option.none(),
            inPlace: Option.none(),
          }),
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
        const found = yield* layoutLeg(loaded, scope, 2, Option.none());
        expect(found).toContainEqual(
          expect.objectContaining({
            _tag: 'ShortUnsafeText',
            short: 'why',
            side: 'right',
            zone: 'platforms (TikTok)',
          }),
        );
        // Each is the talk's, at the film's scene and second: the talk is no short.
        const placed = yield* placeFilm(loaded);
        const vertical = found.filter(atASecond);
        expect(vertical.length).toBeGreaterThan(0);
        for (const f of vertical) {
          const { part, time } = addressOf(f);
          const at = Option.getOrThrow(Option.fromUndefinedOr(time));
          const scene = Option.getOrThrow(sceneAt(placed, at)).spec.id;
          expect(part).toEqual(sceneAddress(scene));
          expect(f.message).toStartWith('talk "why"');
        }
        // Its open holds still on the page here, said at the film's first frame.
        expect(found.filter((f) => f._tag === 'ShortHook').map((f) => addressOf(f))).toEqual([
          { part: sceneAddress('law'), time: 0 },
        ]);
      }).pipe(Effect.provide(Layer.mergeAll(pages, world))),
  );

  it.live('is checked on the scenes `--scene` names only, and not on its open past them', () =>
    Effect.gen(function* () {
      const loaded = yield* (yield* FilmRepo).load('why');
      const placed = yield* placeFilm(loaded);
      const need = Option.getOrThrow(Arr.findFirst(placed, (p) => p.spec.id === 'need'));
      const { scope } = Result.getOrThrow(laidOut(loaded, sceneAddress('need')));
      const found = yield* layoutLeg(loaded, scope, 2, Option.none());
      const unsafe = found.filter((f) => f._tag === 'ShortUnsafeText');
      expect(unsafe.length).toBeGreaterThan(0);
      for (const f of unsafe) {
        expect(f.at).toBeGreaterThanOrEqual(need.start);
        expect(addressOf(f).part).toEqual(sceneAddress('need'));
      }
      expect(found.filter((f) => f._tag === 'ShortHook')).toEqual([]);
    }).pipe(Effect.provide(Layer.mergeAll(pages, world))),
  );

  it.live(
    'is drawn by `film check --draw` as its page builds it, and its length is said of the whole talk',
    () =>
      Effect.gen(function* () {
        const loaded = yield* (yield* FilmRepo).load('why');
        const { scope } = Result.getOrThrow(laidOut(loaded, { _tag: 'Film' }));
        const drawn = yield* drawLeg(loaded, scope, new Map());
        expect(drawn.filter((f) => f._tag === 'DrawThrew')).toEqual([]);
        const placed = yield* placeFilm(loaded);
        const length = (yield* staticLeg(loaded, placed)).filter((f) => f._tag === 'ShortLength');
        expect(length.map((f) => [addressOf(f), f.message])).toEqual([
          [
            { part: { _tag: 'Film' } },
            `talk "why" is ${filmEnd(placed).toFixed(1)}s, outside the 45–65s that hold best`,
          ],
        ]);
      }).pipe(Effect.provide(world)),
  );
});

/**
 * The talk's edit as oxfmt leaves it under the repo's config (`laidOut`
 * puts it beside the films), so a write's formatting moves nothing but what
 * it set.
 */
const FORMATTED = `export const talk = {
  title: 'Why the law?',
  format: 'question',
  takes: { a: 'why-the-law' },
  sections: [
    { id: 'law', take: 'a', from: 0, to: 5, cut: [[2, 2]] },
    { id: 'need', take: 'a', from: 6, to: 11, knobs: { frame: [960, 540], zoom: 1.5 } },
  ],
};
`;

/**
 * The same edit as its author wrote it: sections over lines, comments on
 * them and between them, as oxfmt leaves it under the repo's config.
 */
const COMMENTED = `export const talk = {
  title: 'Why the law?',
  format: 'question',
  takes: { a: 'why-the-law' },
  sections: [
    // The question, asked once.
    {
      id: 'law',
      take: 'a',
      from: 0,
      to: 5, // the question ends here
      cut: [[2, 2]], // the false start
    },
    {
      id: 'need', // the answer
      take: 'a',
      from: 6,
      to: 11,
      // the frame holds the speaker
      knobs: { frame: [960, 540], zoom: 1.5 },
    },
  ],
};
`;

/** The repo's oxfmt config, which every film's file is formatted with. */
const OXFMT_CONFIG = `${import.meta.dir}/../../../../.oxfmtrc.json`;

/** What a test here posts: a talk write's body (a section and its words, or a mark), or an Undo's empty one. */
type Posted = Readonly<Record<string, string | number>>;

/** The timeout of a test here that writes: each write formats its text with oxfmt, a spawn (effect/requireSpawnBudget). */
const SPAWNS_MS = 30_000;

describe("a talk's writes in the lab", () => {
  let folders: Folders = { films: '', footage: '', out: '' };
  const world = worldOf((made) => {
    folders = made;
  });
  /** The films `film mix` was run for, fresh, as each write's track was made again. */
  const remixed: Array<string> = [];
  // The lab's pages and its fresh runs, as a test has them: the check finds nothing, a mix is noted.
  const lab = Layer.mergeAll(
    echoPages,
    freshFilm({
      check: () => Effect.succeed([]),
      remix: (film) => Effect.sync(() => void remixed.push(film)),
    }),
  );
  const bound = { hostname: '127.0.0.1', port: 4401 } as const;
  const at = (path: string) => `http://127.0.0.1:4401${path}`;
  const film = { params: { film: 'why' } };
  /** `talk.ts` as it lies, byte for byte. */
  const file = () => FileSystem.FileSystem.use((fs) => fs.readFile(`${folders.films}/why/talk.ts`));
  const text = (bytes: Uint8Array) => new TextDecoder().decode(bytes);
  /** The lab's answer to `request`: its status, and its body as JSON. */
  const ask = (request: Request) =>
    Effect.gen(function* () {
      const handler = yield* labHandler();
      const response = yield* Effect.promise(() => handler(request, bound));
      const body: { readonly _tag?: string; readonly reason?: string } = yield* Effect.promise(() =>
        response.json(),
      );
      return { status: response.status, body };
    });
  const json = Schema.encodeSync(Schema.fromJsonString(Schema.Unknown));
  const post = (path: string, body: Posted) =>
    ask(
      new Request(at(path), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: json(body),
      }),
    );
  /** The talk's words as the lab reads them. */
  const words = Effect.flatMap(ask(new Request(at(labUrls.talk.words(film)))), ({ body }) =>
    Schema.decodeUnknownEffect(TalkWords)(body),
  );
  const struck = (read: TalkWords, section: string) =>
    (read.sections.find((s) => s.id === section)?.words ?? [])
      .filter((w) => w.struck)
      .map((w) => w.index);
  /**
   * `edit` as the talk, in place of the world's one-line JSON, and the repo's
   * oxfmt config above it, so each write is formatted as a film's file is.
   */
  const laidOut = (edit: string) =>
    FileSystem.FileSystem.use((fs) =>
      Effect.andThen(
        fs.copyFile(OXFMT_CONFIG, `${folders.films}/.oxfmtrc.json`),
        fs.writeFileString(`${folders.films}/why/talk.ts`, edit),
      ),
    );
  /** The edit as oxfmt leaves it. */
  const formatted = laidOut(FORMATTED);

  it.live(
    "a Cut rewrites only its section's cut, the talk read again drops the word, Undo puts the file back to the byte, and Restore is its inverse",
    () =>
      Effect.gen(function* () {
        yield* formatted;
        const before = yield* file();
        expect(struck(yield* words, 'law')).toEqual([2]);
        const cut = yield* post(labUrls.talk.cut(film), { section: 'law', from: 3, to: 3 });
        expect(cut.status).toBe(200);
        expect(yield* Schema.decodeUnknownEffect(LabWrite)(cut.body)).toMatchObject({
          scene: 'law',
          file: 'talk.ts',
          target: 'cut word 3 of law',
        });
        // Only the section's `cut` literal changed: word 3 joins the run struck.
        expect(text(yield* file())).toBe(FORMATTED.replace('cut: [[2, 2]] }', 'cut: [[2, 3]] }'));
        // The talk read again plays without the word, and its track was mixed again.
        expect(struck(yield* words, 'law')).toEqual([2, 3]);
        expect(remixed).toContain('why');
        // Undo: the file as it was, byte for byte.
        const undone = yield* post(labUrls.steps.undo(film), {});
        expect(undone.status).toBe(200);
        expect(yield* file()).toEqual(before);
        expect(struck(yield* words, 'law')).toEqual([2]);
        // Restore is a Cut's inverse: struck, then played again, the file is as it was.
        yield* post(labUrls.talk.cut(film), { section: 'law', from: 4, to: 5 });
        expect(struck(yield* words, 'law')).toEqual([2, 4, 5]);
        const restored = yield* post(labUrls.talk.restore(film), {
          section: 'law',
          from: 4,
          to: 5,
        });
        expect(restored.status).toBe(200);
        expect(yield* file()).toEqual(before);
        // Every word played again: the section's `cut` is taken away.
        yield* post(labUrls.talk.restore(film), { section: 'law', from: 2, to: 2 });
        expect(text(yield* file())).toBe(FORMATTED.replace(', cut: [[2, 2]] }', ' }'));
      }).pipe(Effect.scoped, Effect.provide(Layer.merge(world, lab))),
    // oxlint-disable-next-line film/tests-keep-their-strength -- each write formats its text with oxfmt, a spawn inside the lab the test provides (spawn budget).
    SPAWNS_MS,
  );

  it.live(
    "Mark here writes the section's marks; a write that leaves the talk unplayable is refused in the cut's own words and writes nothing",
    () =>
      Effect.gen(function* () {
        yield* formatted;
        const marked = yield* post(labUrls.talk.mark(film), {
          section: 'law',
          word: 1,
          name: 'law',
        });
        expect(marked.status).toBe(200);
        expect(text(yield* file())).toBe(
          FORMATTED.replace('cut: [[2, 2]] }', 'cut: [[2, 2]], marks: { law: 1 } }'),
        );
        expect((yield* words).sections.find((s) => s.id === 'law')?.marks).toEqual({ law: 1 });
        const before = yield* file();
        const refusals: ReadonlyArray<readonly [string, Posted, string]> = [
          // Every word of a section struck: it would play nothing.
          [
            labUrls.talk.cut(film),
            { section: 'need', from: 6, to: 11 },
            'talk: section "need" strikes every word it has, so it plays nothing',
          ],
          // A marked word struck: its mark would be on a word the section does not play.
          [
            labUrls.talk.cut(film),
            { section: 'law', from: 1, to: 1 },
            'marks word 1, which the section does not play',
          ],
          // A mark on a word the section strikes.
          [
            labUrls.talk.mark(film),
            { section: 'law', word: 2, name: 'was' },
            'marks word 2, which the section does not play',
          ],
          // A name that marks another word already.
          [
            labUrls.talk.mark(film),
            { section: 'law', word: 3, name: 'law' },
            'mark "law" is on word 1 of "law" already',
          ],
          // Words the section does not have, and a section the talk does not.
          [
            labUrls.talk.cut(film),
            { section: 'law', from: 9, to: 9 },
            'words 9–9 are not in section "law", which plays words 0–5',
          ],
          [
            labUrls.talk.restore(film),
            { section: 'nope', from: 1, to: 1 },
            'it has no section "nope"',
          ],
          // A name the talk's decode would drop (`MarkName`): written, it would mark nothing.
          [
            labUrls.talk.mark(film),
            { section: 'law', word: 3, name: 'café' },
            '"café" is not a mark\'s name',
          ],
        ];
        for (const [path, body, said] of refusals) {
          const answer = yield* post(path, body);
          expect([answer.status, answer.body._tag]).toEqual([422, 'SourceRefused']);
          expect(answer.body.reason).toContain(said);
          expect(yield* file()).toEqual(before);
        }
      }).pipe(Effect.scoped, Effect.provide(Layer.merge(world, lab))),
    // oxlint-disable-next-line film/tests-keep-their-strength -- each write formats its text with oxfmt, a spawn inside the lab the test provides (spawn budget).
    SPAWNS_MS,
  );

  it.live(
    "a talk written over lines, with comments, keeps each on its own key: Cut then Restore leaves the file as it was, to the byte, Mark here and a cut added go after the line's comment, and a Restore that empties a cut takes the cut's own comment with it and keeps every other",
    () =>
      Effect.gen(function* () {
        yield* laidOut(COMMENTED);
        const before = yield* file();
        // A run grown and shrunk again, in a section with comments on its lines.
        yield* post(labUrls.talk.cut(film), { section: 'law', from: 3, to: 3 });
        expect(text(yield* file())).toBe(COMMENTED.replace('cut: [[2, 2]]', 'cut: [[2, 3]]'));
        yield* post(labUrls.talk.restore(film), { section: 'law', from: 3, to: 3 });
        expect(yield* file()).toEqual(before);
        // A cut written into a section with none: on a line of its own, and taken away again.
        yield* post(labUrls.talk.cut(film), { section: 'need', from: 8, to: 8 });
        expect(text(yield* file())).toBe(
          COMMENTED.replace('      to: 11,\n', '      to: 11,\n      cut: [[8, 8]],\n'),
        );
        yield* post(labUrls.talk.restore(film), { section: 'need', from: 8, to: 8 });
        expect(yield* file()).toEqual(before);
        // A mark goes on a line of its own after the cut's, whose comment stays the cut's.
        yield* post(labUrls.talk.mark(film), { section: 'law', word: 3, name: 'law' });
        expect(text(yield* file())).toBe(
          COMMENTED.replace(
            '// the false start\n',
            '// the false start\n      marks: { law: 3 },\n',
          ),
        );
        yield* post(labUrls.steps.undo(film), {});
        expect(yield* file()).toEqual(before);
        // Every word played again: the cut goes whole, with the comment about it; `to`'s stays.
        yield* post(labUrls.talk.restore(film), { section: 'law', from: 2, to: 2 });
        const played = COMMENTED.replace('      cut: [[2, 2]], // the false start\n', '');
        expect(text(yield* file())).toBe(played);
        // A cut added after `to`: below its line, whose comment stays `to`'s; Restore takes it away.
        yield* post(labUrls.talk.cut(film), { section: 'law', from: 3, to: 3 });
        expect(text(yield* file())).toBe(
          played.replace(
            '// the question ends here\n',
            '// the question ends here\n      cut: [[3, 3]],\n',
          ),
        );
        yield* post(labUrls.talk.restore(film), { section: 'law', from: 3, to: 3 });
        expect(text(yield* file())).toBe(played);
      }).pipe(Effect.scoped, Effect.provide(Layer.merge(world, lab))),
    // oxlint-disable-next-line film/tests-keep-their-strength -- each write formats its text with oxfmt, a spawn inside the lab the test provides (spawn budget).
    SPAWNS_MS,
  );

  it.effect('are routes of the lab API, so the one gate sweeps them', () =>
    Effect.sync(() => {
      const talk = routesOf(LabHttpApi)
        .filter((r) => r.path.startsWith('/api/films/:film/talk'))
        .map((r) => `${r.method} ${r.path}`);
      expect(talk).toEqual([
        'GET /api/films/:film/talk',
        'POST /api/films/:film/talk/cut',
        'POST /api/films/:film/talk/restore',
        'POST /api/films/:film/talk/mark',
      ]);
    }),
  );
});
