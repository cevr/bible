// Test doubles for the tools: an in-memory file system, and ElevenLabs, media,
// a browser and its pages that answer from memory and count their calls. No
// network, no Chromium, no credits.

import {
  Array as Arr,
  ByteSize,
  ConfigProvider,
  Context,
  Effect,
  Exit,
  FileSystem,
  Layer,
  Option,
  Path,
  Redacted,
  Result,
  Schema,
  Sink,
  Stream,
} from 'effect';
import { type ChildProcess, ChildProcessSpawner } from 'effect/process';
import { BunHttpPlatform, BunServices } from '@effect/platform-bun';
import { Base64 } from 'effect/encoding';
import * as PlatformError from 'effect/PlatformError';
import { Refusal, type Route, ServerFailed } from '../core/api.ts';
import { type Project, emptyCatalogue, projectOf } from '../core/catalogue.ts';
import { type FilmChoices, withSay } from '../core/choice.ts';
import { type Pcm, silence } from '../core/audio.ts';
import { MIX_RATE } from '../core/mix.ts';
import { NO_SOUNDS } from '../core/sfx.ts';
import { hashText, parse, takeScript, voiceKey } from '../core/narration.ts';
import { unmeasured } from '../core/voiced.ts';
import {
  type VoiceTiming,
  SoundManifestJson,
  type Timed,
  type Timings,
  TimingsJson,
  type Voice,
} from '../core/schema.ts';
import {
  type ExportInfo,
  type FaceMark,
  type HandMark,
  type InkMark,
  type Probed,
  type TextBox,
  type CallAnswers,
  type CallArgs,
  type ExportCall,
  ExportAnswers,
  type LumaArea,
} from '../core/export-handle.ts';
import { RenderCatalogue } from './catalogue.ts';
import { ContentStore } from './content-store.ts';
import { labHandler } from './lab.ts';
import { NotesStore } from './notes-store.ts';
import { type DialogueRequest, ElevenLabs, type TtsRequest } from './elevenlabs.ts';
import { Browser, CallRefused, type Invoke, framePage } from './browser.ts';
import { type Encoder, type EncoderChoice, sharesInPage } from '../core/encoder.ts';
import {
  FilmUnknown,
  FreshProcessFailed,
  MediaFailed,
  RecordingInvalid,
  SceneNotRendered,
  TakeMismatch,
  VerbRefused,
} from '../core/refusals.ts';
import {
  ApiKeyMissing,
  type EncodeFailed,
  type EncoderMissing,
  type FrameFailed,
  type PageCrashed,
  type PageError,
} from './errors.ts';
import { FilmFolder, FilmRepo, type LoadedFilm, placeFilm } from './film-repo.ts';
import { cueOf, locateHere } from './read-cli.ts';
import { type JoinedFilm, Media, type MediaService } from './media.ts';
import { StudioReadings } from './studio.ts';
import { PreviewServer } from './preview-server.ts';
import { SceneHead } from './scene-head.ts';
import { SceneSources } from './scene-sources.ts';
import { SceneWriter } from './scene-writer.ts';
import { type Change, SourceWriter } from './source-writer.ts';
import { FreshFilm, type FreshFilmService, OptionsKept, SitesRead } from './fresh-film.ts';
import { beatsOf, voicedOf } from './narrator.ts';
import { voicePoints } from './choice-points.ts';
import { Takes } from './takes.ts';
import { Review } from './review.ts';
import { Choices } from './choices.ts';
import { HttpServerRequest, HttpServerResponse } from 'effect/http';
import { LabPage } from './lab-page.ts';

const notFound = (method: string, path: string) =>
  PlatformError.systemError({
    _tag: 'NotFound',
    module: 'FileSystem',
    method,
    pathOrDescriptor: path,
  });

/** The folders `path` and, when `recursive`, every one above it. */
const folderAndParents = (path: string, recursive: boolean): ReadonlyArray<string> => {
  if (!recursive) return [path];
  const parts = path.split('/');
  return parts.slice(1).map((_, i) => parts.slice(0, i + 2).join('/'));
};

/** `path` written with `bytes`, or NotFound when its folder was never made nor holds a file. */
const writeInto = (
  files: Map<string, Uint8Array>,
  folders: Set<string>,
  method: string,
  path: string,
  bytes: Uint8Array,
) =>
  Effect.suspend(() => {
    const parent = path.slice(0, path.lastIndexOf('/'));
    const made =
      parent === '' ||
      folders.has(parent) ||
      [...files.keys()].some((f) => f.startsWith(`${parent}/`));
    if (!made) return Effect.fail(notFound(method, path));
    return Effect.sync(() => void files.set(path, bytes));
  });

/**
 * File operations over a map of path → bytes, and `folders`, the set of
 * folders made (a folder with files in it exists whether made or not), so a
 * test can see a folder left empty.
 */
/** A byte count as a number. */
const byteCount = (input: ByteSize.Input): number =>
  Number(ByteSize.toBigInt(ByteSize.fromInputUnsafe(input)));

const memoryOps = (files: Map<string, Uint8Array>, folders = new Set<string>()) => {
  /** A folder under `/tmp` no other call has made: `<prefix><n>`. */
  const tempFolder = (prefix = 'tmp-') => {
    let n = 1;
    while (folders.has(`/tmp/${prefix}${n}`)) n += 1;
    const dir = `/tmp/${prefix}${n}`;
    folders.add(dir);
    return dir;
  };
  return {
    exists: (path) =>
      Effect.succeed(
        files.has(path) ||
          folders.has(path) ||
          [...files.keys()].some((f) => f.startsWith(`${path}/`)),
      ),
    readFile: (path) =>
      Effect.fromOption(Option.fromNullishOr(files.get(path)), () => notFound('readFile', path)),
    readFileString: (path) =>
      Option.match(Option.fromNullishOr(files.get(path)), {
        onNone: () => Effect.fail(notFound('readFileString', path)),
        onSome: (bytes) => Effect.succeed(new TextDecoder().decode(bytes)),
      }),
    // A write needs its folder, as Node's does: ENOENT when it was never made.
    writeFile: (path, data) => writeInto(files, folders, 'writeFile', path, data),
    writeFileString: (path, data) => writeInto(files, folders, 'writeFileString', path, text(data)),
    makeDirectory: (path, options) =>
      Effect.sync(() => {
        for (const folder of folderAndParents(path, options?.recursive === true))
          folders.add(folder);
      }),
    rename: (from, to) =>
      Option.match(Option.fromNullishOr(files.get(from)), {
        onNone: () => Effect.fail(notFound('rename', from)),
        onSome: (bytes) =>
          Effect.sync(() => {
            files.delete(from);
            files.set(to, bytes);
          }),
      }),
    // A folder goes with everything under it when `recursive` asks; without
    // it Node's `rm` refuses any folder, empty or not (EISDIR), and so does this.
    remove: (path, options) =>
      Effect.suspend(() => {
        const isFolder =
          folders.has(path) || [...files.keys()].some((f) => f.startsWith(`${path}/`));
        if (isFolder && options?.recursive !== true)
          return Effect.fail(
            PlatformError.systemError({
              _tag: 'BadResource',
              module: 'FileSystem',
              method: 'remove',
              pathOrDescriptor: path,
              description: 'Path is a directory: rm returned EISDIR',
            }),
          );
        return Effect.sync(() => {
          for (const file of [...files.keys()])
            if (file === path || file.startsWith(`${path}/`)) files.delete(file);
          for (const folder of [...folders])
            if (folder === path || folder.startsWith(`${path}/`)) folders.delete(folder);
        });
      }),
    // A new folder each call, as the system's are.
    makeTempDirectory: (options) => Effect.sync(() => tempFolder(options?.prefix)),
    // The same, gone with everything in it when the scope closes, as the system's is.
    makeTempDirectoryScoped: (options) =>
      Effect.acquireRelease(
        Effect.sync(() => tempFolder(options?.prefix)),
        (dir) =>
          Effect.sync(() => {
            for (const file of [...files.keys()])
              if (file.startsWith(`${dir}/`)) files.delete(file);
            for (const folder of [...folders])
              if (folder === dir || folder.startsWith(`${dir}/`)) folders.delete(folder);
          }),
      ),
    // The files and folders directly in `path`: made, or holding a file.
    readDirectory: (path) =>
      Effect.sync(() => [
        ...new Set(
          [...files.keys(), ...folders]
            .filter((f) => f.startsWith(`${path}/`))
            .map((f) => f.slice(path.length + 1).split('/')[0] ?? ''),
        ),
      ]),
    // A file's size and kind, as a file server reads them before it answers a range.
    stat: (path) =>
      Effect.fromOption(Option.fromNullishOr(files.get(path)), () => notFound('stat', path)).pipe(
        Effect.map((bytes): FileSystem.File.Info => ({
          type: 'File',
          mtime: Option.none(),
          atime: Option.none(),
          birthtime: Option.none(),
          dev: 0,
          ino: Option.none(),
          mode: 0o644,
          nlink: Option.none(),
          uid: Option.none(),
          gid: Option.none(),
          rdev: Option.none(),
          size: ByteSize.bytes(bytes.byteLength),
          blksize: Option.none(),
          blocks: Option.none(),
        })),
      ),
    // A file's bytes from `offset`, `bytesToRead` of them when given, as one chunk.
    stream: (path, options) =>
      Stream.fromEffect(
        Effect.fromOption(Option.fromNullishOr(files.get(path)), () => notFound('stream', path)),
      ).pipe(
        Stream.map((bytes) => {
          const from = Option.getOrElse(
            Option.map(Option.fromNullishOr(options?.offset), byteCount),
            () => 0,
          );
          const count = Option.map(Option.fromNullishOr(options?.bytesToRead), byteCount);
          return bytes.slice(
            from,
            Option.getOrElse(
              Option.map(count, (n) => from + n),
              () => bytes.byteLength,
            ),
          );
        }),
      ),
  } satisfies Partial<FileSystem.FileSystem>;
};

/** A file system over a map of path → bytes, and the set of folders made in it. */
export const memoryFileSystem = (
  files: Map<string, Uint8Array>,
  folders: Set<string> = new Set(),
) => FileSystem.layerNoop(memoryOps(files, folders));

/**
 * A request for each of `routes` as a page on a foreign Host would send it:
 * every `:film` naming `film`, every other param and a trailing `*` naming
 * `x`, a write with a JSON body; the URL on `origin`.
 */
export const foreignRequests = (
  routes: ReadonlyArray<Route>,
  origin: string,
  film: string,
): ReadonlyArray<Request> =>
  routes.map((route) => {
    const path = route.path
      .split('/')
      .map((segment) => {
        if (segment === ':film') return film;
        if (segment.startsWith(':') || segment === '*') return 'x';
        return segment;
      })
      .join('/');
    const headers = { host: 'evil.example:4401', 'content-type': 'application/json' };
    if (route.method === 'GET') return new Request(`${origin}${path}`, { headers });
    return new Request(`${origin}${path}`, { method: route.method, headers, body: '{}' });
  });

const unusedSource = Effect.die('the scene source is not called here');

/**
 * FreshFilm that answers only the runs a test gives it: any other run dies,
 * naming itself, since no test here spawns the film CLI unless it says so.
 */
export const freshFilm = (given: Partial<FreshFilmService>) => {
  const unused = (run: string) => () => Effect.die(`no fresh \`film ${run}\` here`);
  return Layer.succeed(
    FreshFilm,
    FreshFilm.of({
      choices: unused('options list'),
      checked: unused('options list --check'),
      mix: unused('options mix'),
      keepVoice: unused('options keep-voice'),
      take: unused('options take'),
      reading: unused('read voice'),
      cue: unused('read cue'),
      sites: unused('read sites'),
      remix: unused('mix'),
      project: unused('project'),
      check: unused('check'),
      ...given,
    }),
  );
};

/** What a command is given on stdin, when it is given a stream. */
const stdinOf = (
  command: ChildProcess.Command,
): Stream.Stream<Uint8Array, PlatformError.PlatformError> => {
  if (command._tag !== 'StandardCommand') return Stream.empty;
  const given = command.options.stdin;
  if (Stream.isStream(given)) return given;
  return Stream.empty;
};

/**
 * A child process spawner whose every run prints back what it was given on
 * stdin and exits 0: oxfmt that leaves a text as it is. The SourceWriter
 * formats what it writes through oxfmt; over an in-memory film there is no
 * folder to run it from, and the text it formats is not what a test checks.
 */
export const formatAsIs = Layer.succeed(
  ChildProcessSpawner.ChildProcessSpawner,
  ChildProcessSpawner.make((command) => {
    const stdout = stdinOf(command);
    return Effect.succeed(
      ChildProcessSpawner.makeHandle({
        pid: ChildProcessSpawner.ProcessId(0),
        exitCode: Effect.succeed(ChildProcessSpawner.ExitCode(0)),
        isRunning: Effect.succeed(false),
        kill: () => Effect.void,
        stdin: Sink.drain,
        stdout,
        stderr: Stream.empty,
        all: stdout,
        getInputFd: () => Sink.drain,
        getOutputFd: () => Stream.empty,
        unref: Effect.succeed(Effect.void),
      }),
    );
  }),
);

const isFilmUnknown = Schema.is(FilmUnknown);

/** A failure as a fresh run answers it: a film it cannot find as itself, any other as `ServerFailed`. */
const freshFailure = (error: { readonly _tag: string; readonly message: string }) => {
  if (isFilmUnknown(error)) return error;
  return ServerFailed.make({ tag: error._tag, reason: error.message });
};

const isKeepRefusal = Schema.is(Schema.Union([TakeMismatch, RecordingInvalid]));

/**
 * `film options list` run in this process over the test's `FilmRepo` and
 * `Takes` (in `context`), for a film whose only points are its voices: each
 * beat's attempts, as `film options list` lists them.
 */
export const voicesHere = (context: Context.Context<FilmRepo | Takes>) => (film: string) =>
  Effect.gen(function* () {
    const loaded = yield* (yield* FilmRepo).load(film);
    const beats = yield* Effect.fromResult(beatsOf(loaded));
    const takes = yield* Takes;
    const attempts = yield* Effect.forEach(beats, (beat) =>
      Effect.map(takes.attempts(loaded.paths, beat.id), (made) => ({
        beat: beat.id,
        hash: hashText(beat.script),
        attempts: made,
      })),
    );
    return voicePoints(loaded, attempts).map((draft) => withSay(Option.none(), draft));
  }).pipe(Effect.provideContext(context), Effect.orDie);

/**
 * `film options keep-voice` run in this process over the test's `FilmRepo`
 * and `Takes` (in `context`), as the fresh run would over the same files:
 * the attempt kept, `mixing` standing in for its mix (answering whether it
 * mixed), a take it will not keep refused as itself, any other failure as
 * `ServerFailed`.
 */
export const keepVoiceHere =
  (
    context: Context.Context<FilmRepo | Takes>,
    mixing: Effect.Effect<boolean> = Effect.succeed(true),
  ) =>
  (film: string, beat: string, file: string, options: { readonly acceptMismatch: boolean }) =>
    Effect.gen(function* () {
      const voiced = yield* Effect.fromResult(voicedOf(yield* (yield* FilmRepo).load(film)));
      const kept = yield* (yield* Takes).keepAttempt(voiced, beat, file, options);
      const mixed = yield* mixing;
      return OptionsKept.make({ take: kept.take, heard: kept.heard, wer: kept.wer, mixed });
    }).pipe(
      Effect.provideContext(context),
      Effect.mapError((error) => {
        if (isKeepRefusal(error)) return error;
        return ServerFailed.make({ tag: error._tag, reason: error.message });
      }),
    );

/**
 * `freshFilm(given)` whose `film read cue` and `film read sites` run in this
 * process over the test's `FilmRepo` and its folder, as the fresh run would
 * over the same files: a film that does not load fails the run. A test's
 * film is a fresh folder, so this process's imports of it are its files.
 */
export const freshHere = (given: Partial<FreshFilmService>) =>
  Layer.unwrap(
    Effect.map(
      Effect.context<FilmRepo | FilmFolder | FileSystem.FileSystem | Path.Path>(),
      (context) =>
        freshFilm({
          sites: (film) =>
            locateHere(film).pipe(
              Effect.map((located) =>
                SitesRead.make({
                  sites: [...located.sites.values()],
                  unlocated: located.unlocated,
                }),
              ),
              Effect.mapError(freshFailure),
              Effect.provideContext(context),
            ),
          cue: (film, scene, cue, spans) =>
            FilmRepo.use((repo) => repo.load(film)).pipe(
              Effect.flatMap(placeFilm),
              Effect.map((placed) =>
                cueOf(
                  placed,
                  scene,
                  cue,
                  Option.getOrElse(spans, () => ({})),
                ),
              ),
              Effect.mapError((error) =>
                FreshProcessFailed.make({
                  command: 'film read cue',
                  reason: `${error._tag}: ${error.message}`,
                }),
              ),
              Effect.provideContext(context),
            ),
          ...given,
        }),
    ),
  );

/**
 * The scenes' source services where a test calls none of their routes (it
 * may still write through a real SourceWriter): the lab's handler serves
 * them too, so they only have to exist.
 */
export const noScenes = Layer.mergeAll(
  Layer.succeed(
    SceneSources,
    SceneSources.of({
      locate: () => unusedSource,
      site: () => unusedSource,
      writable: () => unusedSource,
      editable: () => unusedSource,
    }),
  ),
  Layer.succeed(
    SceneWriter,
    SceneWriter.of({ setCue: () => unusedSource, setKnob: () => unusedSource }),
  ),
  Layer.succeed(SceneHead, SceneHead.of({ head: () => unusedSource })),
);

/**
 * The scene source's services where a test calls none of its routes: the
 * lab's handler serves them too, so they only have to exist.
 */
export const noSource = Layer.mergeAll(
  noScenes,
  Layer.succeed(
    SourceWriter,
    SourceWriter.of({
      write: () => unusedSource,
      around: () => unusedSource,
      undo: () => unusedSource,
      redo: () => unusedSource,
      history: () => unusedSource,
    }),
  ),
);

/**
 * The studio's services where a test calls none of its routes: the lab's
 * handler serves the studio too, so they only have to exist.
 */
export const noStudio = Layer.mergeAll(
  Layer.succeed(
    Takes,
    Takes.of({
      importPath: () => Effect.die('the studio is not called here'),
      recordAttempt: () => Effect.die('the studio is not called here'),
      attempts: () => Effect.die('the studio is not called here'),
      attemptFile: () => Effect.die('the studio is not called here'),
      keepAttempt: () => Effect.die('the studio is not called here'),
      named: () => ({
        bring: () => Effect.die('the studio is not called here'),
        putAway: () => Effect.die('the studio is not called here'),
        remake: Option.none(),
      }),
    }),
  ),
  Layer.succeed(
    StudioReadings,
    StudioReadings.of({ reading: () => Effect.die('the studio is not called here') }),
  ),
);

const unreviewed = (op: string) => Effect.die(`the review is not called here (${op})`);

/**
 * The review's renders where a test calls none of their routes (it may still
 * pick through a real Choices): the lab's handler serves them too, so they
 * only have to exist.
 */
export const noRenders = Layer.succeed(
  Review,
  Review.of({
    roots: [],
    index: () => unreviewed('index'),
    pictures: () => unreviewed('pictures'),
    renderVideo: () => unreviewed('renderVideo'),
    resolve: () => unreviewed('resolve'),
    say: () => unreviewed('say'),
    duration: () => unreviewed('duration'),
    frame: () => unreviewed('frame'),
    phone: () => unreviewed('phone'),
    derive: () => unreviewed('derive'),
  }),
);

/**
 * The review's services where a test calls none of its routes (the renders,
 * the choices): the lab's handler serves them too, so they only have to
 * exist.
 */
export const noReview = Layer.mergeAll(
  noRenders,
  Layer.succeed(
    Choices,
    Choices.of({
      list: () => unreviewed('list'),
      checked: () => unreviewed('checked'),
      pick: () => unreviewed('pick'),
      knob: () => unreviewed('knob'),
      say: () => unreviewed('say'),
      alone: () => unreviewed('alone'),
      inPlace: () => unreviewed('inPlace'),
    }),
  ),
);

/** The lab's pages as a test sees them: each answers its path, and a wait the build it was asked past. */
export const echoPages = Layer.succeed(
  LabPage,
  LabPage.of({
    answer: Effect.map(HttpServerRequest.HttpServerRequest, (request) =>
      HttpServerResponse.text(`page ${new URL(request.url, 'http://lab').pathname}`),
    ),
    wait: (served) => Effect.succeed({ build: served.since, server: 'echo' }),
  }),
);

/**
 * `files`, whose `nth` write, rename or remove (counting from 1) fails as a
 * crash would: nothing after it runs. Every op before it has landed. `ops()`
 * counts the writes, renames and removes attempted so far.
 */
export const crashingFileSystem = (files: Map<string, Uint8Array>, nth: number) => {
  const ops = memoryOps(files);
  let count = 0;
  const crash = (method: string, path: string) =>
    Effect.suspend(() => {
      count += 1;
      if (count !== nth) return Effect.void;
      return Effect.fail(
        PlatformError.systemError({
          _tag: 'Unknown',
          module: 'FileSystem',
          method,
          pathOrDescriptor: path,
          description: 'crash',
        }),
      );
    });
  const layer = FileSystem.layerNoop({
    ...ops,
    writeFile: (path, data) =>
      crash('writeFile', path).pipe(Effect.andThen(ops.writeFile(path, data))),
    rename: (from, to) => crash('rename', from).pipe(Effect.andThen(ops.rename(from, to))),
    remove: (path, options) =>
      crash('remove', path).pipe(Effect.andThen(ops.remove(path, options))),
  });
  return { layer, ops: () => count };
};

export const text = (s: string) => new TextEncoder().encode(s);

/** What the fake ElevenLabs was asked to do. */
export interface ElevenLabsCalls {
  readonly tts: Array<TtsRequest>;
  readonly dialogue: Array<DialogueRequest>;
  readonly stt: Array<string>;
  readonly music: Array<string>;
  readonly effects: Array<string>;
}

/** Characters aligned one per 0.05 s. */
const aligned = (characters: ReadonlyArray<string>) => ({
  characters: [...characters],
  character_start_times_seconds: characters.map((_, i) => i * 0.05),
  character_end_times_seconds: characters.map((_, i) => i * 0.05 + 0.05),
});

/** The beat a take file belongs to: its name up to the first dot. */
const beatOfTake = (file: string) =>
  Option.getOrElse(Arr.head(file.slice(file.lastIndexOf('/') + 1).split('.')), () => '');

/** A transcript's words, one every half second, each 0.4 s long. */
const heardAt = (said: string) =>
  said
    .split(/\s+/)
    .filter((w) => w.length > 0)
    .map((w, i) => ({ text: w, start: i * 0.5, end: i * 0.5 + 0.4, type: 'word' }));

/**
 * Speech comes back aligned one character per 0.05 s, and its "audio" is the
 * text itself, padded with one space per take so no two takes are the same
 * bytes. A dialogue aligns its lines joined with nothing between them, as the
 * API does, and its audio is the lines read one after another. The transcript
 * of a take file is what was spoken into it, unless `heard` maps that text to
 * something else; a person's take (fake FLAC bytes, `fakeMedia.encodeFlac`)
 * says what `recorded` has for its beat. Every transcript's words are timed
 * by `heardAt`, unless `untimed`, when the reply carries its text and no words.
 */
export const fakeElevenLabs = (
  files: Map<string, Uint8Array>,
  calls: ElevenLabsCalls,
  options: {
    readonly heard?: ReadonlyMap<string, string>;
    readonly recorded?: ReadonlyMap<string, string>;
    readonly untimed?: boolean;
    readonly apiKey?: string;
  } = {},
) =>
  Layer.succeed(
    ElevenLabs,
    ElevenLabs.of({
      tts: (request) =>
        Effect.sync(() => {
          calls.tts.push(request);
          return {
            audio_base64: Base64.encode(request.text + ' '.repeat(calls.tts.length)),
            alignment: aligned([...request.text]),
          };
        }),
      dialogue: (request) =>
        Effect.sync(() => {
          calls.dialogue.push(request);
          const said = request.lines.map((line) => line.text).join(' ');
          const starts = request.lines.map((_, i) =>
            request.lines.slice(0, i).reduce((n, line) => n + [...line.text].length, 0),
          );
          return {
            audio_base64: Base64.encode(said + ' '.repeat(calls.dialogue.length)),
            alignment: aligned(request.lines.flatMap((line) => [...line.text])),
            voice_segments: request.lines.map((line, i) => ({
              character_start_index: starts[i] ?? 0,
              voice_id: line.voiceId,
            })),
          };
        }),
      stt: (file) =>
        Effect.sync(() => {
          calls.stt.push(file);
          const bytes = new TextDecoder().decode(files.get(file)).trim();
          // A person's take is fake MP3 bytes: what was said is the recording's, by beat.
          const person = Option.filter(
            Option.fromNullishOr(options.recorded?.get(beatOfTake(file))),
            () => bytes.startsWith('flac '),
          );
          const said = Option.getOrElse(person, () => bytes);
          const heard = Option.getOrElse(
            Option.fromNullishOr(options.heard?.get(said)),
            () => said,
          );
          if (options.untimed === true) return { text: heard };
          return { text: heard, words: heardAt(heard) };
        }),
      // The score's bytes name the plan's styles, so each option hashes apart.
      composeMusic: (plan, _model, out) =>
        Effect.sync(() => {
          calls.music.push(out);
          const styles = plan.chunks.flatMap((c) => c.positive_styles).join(' ');
          files.set(out, new TextEncoder().encode(`music ${styles}`));
        }),
      ready: Effect.void,
      apiKey: Option.match(Option.fromNullishOr(options.apiKey), {
        onNone: () => Effect.fail(ApiKeyMissing.make({})),
        onSome: (key) => Effect.succeed(Redacted.make(key)),
      }),
      soundEffect: (_request, out) => Effect.sync(() => void calls.effects.push(out)),
    }),
  );

export const emptyCalls = (): ElevenLabsCalls => ({
  tts: [],
  dialogue: [],
  stt: [],
  music: [],
  effects: [],
});

/** A take's length as the fake media measures it: a tenth of a second per byte. */
export const fakeLength = (bytes: Uint8Array) => bytes.length / 10;

/**
 * A person's recording as the fake media loads it: half a second of room
 * noise, 0.4 s of tone for each word of what the file says (its bytes are the
 * words, as a staging take's are), then half a second of room noise.
 */
const fakeRecording = (said: string, rate: number): Pcm => {
  const words = said.split(/\s+/).filter((w) => w.length > 0).length;
  const frames = Math.round((1 + words * 0.4) * rate);
  const plane = Float32Array.from({ length: frames }, (_, i) => {
    const t = i / rate;
    const voiced = Number(t >= 0.5 && t < 0.5 + words * 0.4);
    return voiced * 0.1 * Math.sin((2 * Math.PI * 220 * i) / rate) + ((i % 7) - 3) * 1e-5;
  });
  return { rate, frames, channels: [plane] };
};

/**
 * The rest of a fake media that neither loads a recording nor serves a
 * review: loading fails, encoding writes nothing, and the review's stills,
 * phone copies and `.m4a` mixes, and a re-mux, do nothing.
 */
export const noRecording = {
  load: (file: string) =>
    Effect.fail(MediaFailed.make({ op: 'decode', file, reason: 'no recordings here' })),
  encodeFlac: () => Effect.succeed(new Uint8Array()),
  writeAac: () => Effect.void,
  still: () => Effect.void,
  phoneCopy: () => Effect.void,
  remux: () => Effect.void,
} satisfies Pick<
  MediaService,
  'load' | 'encodeFlac' | 'writeAac' | 'still' | 'phoneCopy' | 'remux'
>;

/**
 * Media as the review uses it, on disk: every video lasts `seconds`, and a
 * still or a phone copy is the video copied whole. Each call lands in `calls`
 * (`duration <file>`, `still <video> <at> <width>`, `phone <video>`), so a
 * test counts what was made; a video that is not there fails as the real media does.
 */
export const reviewMedia = (calls: Array<string>, seconds = 12.5) =>
  Layer.effect(
    Media,
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const copy = (op: MediaFailed['op'], video: string, out: string) =>
        fs
          .copyFile(video, out)
          .pipe(
            Effect.mapError((error) =>
              MediaFailed.make({ op, file: video, reason: error.message }),
            ),
          );
      const unused = Effect.die('not used by the review');
      return Media.of({
        ...noRecording,
        duration: (file) =>
          Effect.sync(() => void calls.push(`duration ${file}`)).pipe(Effect.as(seconds)),
        still: (video, at, width, out) =>
          Effect.sync(() => void calls.push(`still ${video} ${at} ${width}`)).pipe(
            Effect.andThen(copy('decode', video, out)),
          ),
        phoneCopy: (video, out) =>
          Effect.sync(() => void calls.push(`phone ${video}`)).pipe(
            Effect.andThen(copy('encode', video, out)),
          ),
        decode: () => unused,
        writeWav: () => unused,
        encodeAac: () => unused,
        join: () => unused,
        shareCopy: () => unused,
      });
    }),
  );

/** What `fakeMedia.encodeFlac` writes: its frames and rate, so the fake measures it. */
const fakeFlac = (pcm: Pcm) => text(`flac ${pcm.frames}/${pcm.rate}`);

/** A fake FLAC's length from its bytes; any other file's is `fakeLength`. */
const fakeDuration = (bytes: Uint8Array) =>
  Option.match(Option.fromNullishOr(new TextDecoder().decode(bytes).match(/^flac (\d+)\/(\d+)$/)), {
    onNone: () => fakeLength(bytes),
    onSome: (said) => Number(said[1]) / Number(said[2]),
  });

/**
 * Media over `files`: a file measures `fakeLength` of its bytes (2.5 s when it
 * is not there) and decodes to `decoded` (a second of mono silence at the
 * mix's rate unless given), a WAV written lands as `wav <frames>`, and a
 * joined film as `mp4 <frames>`, a re-muxed one as `remuxed <video>`. A recording loads as `fakeRecording` of its
 * bytes, and a take encodes to `flac <frames>/<rate>`, which measures its own
 * length. A review's mix lands as `aac <frames>`, a still as `still of
 * <video> at <t> (<width>)`, a phone copy as `phone of <video>`.
 */
export const fakeMedia = (
  files: Map<string, Uint8Array> = new Map(),
  decoded: Pcm = silence(MIX_RATE, MIX_RATE, 1),
) =>
  Layer.succeed(
    Media,
    Media.of({
      duration: (file) =>
        Effect.succeed(
          Option.match(Option.fromNullishOr(files.get(file)), {
            onNone: () => 2.5,
            onSome: fakeDuration,
          }),
        ),
      decode: () => Effect.succeed(decoded),
      writeWav: (file, pcm) => Effect.sync(() => void files.set(file, text(`wav ${pcm.frames}`))),
      encodeAac: () => Effect.succeed({ packets: [], meta: {} }),
      join: (film) => Effect.sync(() => void files.set(film.out, text(`mp4 ${film.frames}`))),
      remux: (video) => Effect.sync(() => void files.set(video, text(`remuxed ${video}`))),
      shareCopy: (master, out) =>
        Effect.sync(() => void files.set(out, text(`share of ${master}`))),
      load: (file, rate) =>
        Option.match(Option.fromNullishOr(files.get(file)), {
          onNone: () =>
            Effect.fail(MediaFailed.make({ op: 'decode', file, reason: 'no such file' })),
          onSome: (bytes) =>
            Effect.succeed(fakeRecording(new TextDecoder().decode(bytes).trim(), rate)),
        }),
      encodeFlac: (pcm) => Effect.succeed(fakeFlac(pcm)),
      writeAac: (file, pcm) => Effect.sync(() => void files.set(file, text(`aac ${pcm.frames}`))),
      still: (video, at, width, out) =>
        Effect.sync(() => void files.set(out, text(`still of ${video} at ${at} (${width})`))),
      phoneCopy: (video, out) => Effect.sync(() => void files.set(out, text(`phone of ${video}`))),
    }),
  );

/** How a fake page answers the export handle's calls: decoded answers, or the failure a page would give. */
type FakeHandle = {
  readonly [K in ExportCall]: (
    ...args: CallArgs[K]
  ) => Effect.Effect<
    CallAnswers[K],
    PageError | PageCrashed | FrameFailed | EncodeFailed | EncoderMissing
  >;
};

/**
 * `handle` behind the same path a tab takes (`Invoke`): each answer
 * encoded by its call's schema as the page would hand it across, a failure
 * the page itself gives kept, any other refused with its message.
 */
const fakeInvoke =
  (handle: FakeHandle): Invoke =>
  (name, args) =>
    handle[name](...args).pipe(
      Effect.flatMap((answer) =>
        Schema.encodeEffect(ExportAnswers[name])(answer).pipe(Effect.orDie),
      ),
      Effect.catchTags({
        FrameFailed: ({ reason }) => Effect.fail(CallRefused.make({ reason })),
        EncodeFailed: ({ reason }) => Effect.fail(CallRefused.make({ reason })),
        EncoderMissing: ({ reason }) => Effect.fail(CallRefused.make({ reason })),
      }),
    );

/** Everything the fake render host opened and closed, so a test can check nothing leaked. */
export interface RenderLedger {
  readonly server: { started: number; stopped: number };
  readonly browser: { launched: number; closed: number };
  readonly pages: { opened: number; closed: number };
  /** Chunks a page began to encode: each finished, or was cut off (killed). */
  readonly encoders: { spawned: number; finished: number; killed: number };
  /** The encoder each chunk was handed, in the order they began. */
  readonly encodedBy: Array<Encoder['_tag']>;
  /** The encoders each page choosing one was allowed, in order. */
  readonly encoderAsked: Array<ReadonlyArray<Encoder['_tag']>>;
  /** Every share copy made by x264 from a joined master. */
  readonly shareCopies: Array<{ readonly master: string; readonly out: string }>;
  /** Every frame drawn, by any page. */
  readonly frames: Array<number>;
  /** Look-books composed, by any page. */
  readonly lookbooks: { composed: number };
  /** The frames of every contact sheet composed. */
  readonly contacts: Array<ReadonlyArray<number>>;
  /** Every film joined. */
  readonly joins: Array<JoinedFilm>;
  /** Every video whose sound was replaced, in order. */
  readonly remuxes: Array<string>;
  /** Every file decoded, in order. */
  readonly decodes: Array<string>;
  /** The frames of every track encoded to AAC. */
  readonly aac: Array<number>;
  /** The URL of every page opened. */
  readonly urls: Array<string>;
  /** AAC encodes cut off before they ended. */
  readonly aacInterrupted: { count: number };
}

export const emptyLedger = (): RenderLedger => ({
  server: { started: 0, stopped: 0 },
  browser: { launched: 0, closed: 0 },
  pages: { opened: 0, closed: 0 },
  encoders: { spawned: 0, finished: 0, killed: 0 },
  encodedBy: [],
  encoderAsked: [],
  shareCopies: [],
  frames: [],
  lookbooks: { composed: 0 },
  contacts: [],
  joins: [],
  remuxes: [],
  decodes: [],
  aac: [],
  aacInterrupted: { count: 0 },
  urls: [],
});

export const testExportInfo: ExportInfo = {
  width: 1920,
  height: 1080,
  fps: 30,
  duration: 20,
  frames: 600,
};

/** A frame as a fake page's look pass draws it: one flat grey, and the faces it declares. */
interface FakeLook {
  readonly grey: number;
  readonly faces: ReadonlyArray<FaceMark>;
  readonly hands?: ReadonlyArray<HandMark>;
}

export interface FakeRenderHost {
  readonly info?: ExportInfo;
  /** The info the page at `url` hands out, where it is not `info` (a short's page and its film's). */
  readonly infoAt?: (url: string) => Option.Option<ExportInfo>;
  /**
   * How page number `page` (1 for the first page opened) draws frame `i`:
   * fail to break it. Every frame first yields for a millisecond, so pages and
   * encoders really run side by side.
   */
  readonly frame?: (
    i: number,
    page: number,
  ) => Effect.Effect<void, PageError | PageCrashed | FrameFailed>;
  /** What a probe of frame `i` reports (nothing by default); failing breaks the page. */
  readonly probe?: (i: number) => Effect.Effect<Probed, PageError | PageCrashed | FrameFailed>;
  /** How long the audio master measures (default: the film's length). */
  readonly master?: number;
  /** The encoders the browser has (both by default): a page chooses the first it is allowed that it has. */
  readonly encoders?: ReadonlyArray<Encoder['_tag']>;
  /** What an AAC encode does once it is recorded (nothing by default). */
  readonly aac?: Effect.Effect<void, MediaFailed>;
  /** What a join does once it is recorded (nothing by default). */
  readonly join?: (film: JoinedFilm) => Effect.Effect<void, MediaFailed>;
  /**
   * Frame `i` as the look pass sees it: the grey its `w` × `h` thumb is filled
   * with, and the faces it declares (default mid grey, no faces).
   */
  readonly looked?: (i: number) => FakeLook;
  /** The luma every sample of frame `i`'s `area` reads, as `luma` reports it (default 128). */
  readonly luma?: (i: number, area: LumaArea) => number;
}

/**
 * A preview server, and a browser whose pages draw one-byte frames and encode
 * chunks of them, each recording in `ledger` when it opens and closes; and
 * media that measures the master and records every film it joins.
 */
export const fakeRenderHost = (ledger: RenderLedger, host: FakeRenderHost = {}) => {
  const info = Option.getOrElse(Option.fromNullishOr(host.info), () => testExportInfo);
  const draw = Option.getOrElse(Option.fromNullishOr(host.frame), () => () => Effect.void);
  const has = Option.getOrElse(
    Option.fromNullishOr(host.encoders),
    (): ReadonlyArray<Encoder['_tag']> => ['Hardware', 'Software'],
  );
  /** The first of `candidates` this browser has, as a page chooses. */
  /** The first of `candidates` this browser has, as a page chooses; `Missing` when it has none. */
  const encoder = (candidates: ReadonlyArray<Encoder>): Effect.Effect<EncoderChoice> =>
    Effect.sync(() => {
      ledger.encoderAsked.push(candidates.map((c) => c._tag));
      return Option.getOrElse(
        Arr.findFirst(candidates, (c): boolean => has.includes(c._tag)),
        (): EncoderChoice => ({
          _tag: 'Missing',
          reason: `no ${candidates.map((c) => c._tag.toLowerCase()).join(' or ')} H.264 encoder`,
        }),
      );
    });
  const looked = Option.getOrElse(Option.fromNullishOr(host.looked), () => (): FakeLook => ({
    grey: 128,
    faces: [],
  }));
  const luma = Option.getOrElse(Option.fromNullishOr(host.luma), () => () => 128);
  const probe = Option.getOrElse(
    Option.fromNullishOr(host.probe),
    () => (): Effect.Effect<Probed> => Effect.succeed({ texts: [], inks: [] }),
  );
  const server = Layer.effect(
    PreviewServer,
    Effect.acquireRelease(
      Effect.sync(() => {
        ledger.server.started += 1;
        return PreviewServer.of({ url: 'http://preview.test/' });
      }),
      () => Effect.sync(() => void (ledger.server.stopped += 1)),
    ),
  );
  /** Page number `page`'s handle: frames of one byte each, every call recorded in `ledger`. */
  const handleOf = (page: number): FakeHandle => {
    const frame = (i: number) =>
      Effect.sleep('1 millis').pipe(
        Effect.andThen(draw(i, page)),
        Effect.map(() => {
          ledger.frames.push(i);
          return new Uint8Array([i % 256]);
        }),
      );
    return {
      frame,
      probe: (i) =>
        Effect.sleep('1 millis').pipe(
          Effect.andThen(probe(i)),
          Effect.tap(() => Effect.sync(() => void ledger.frames.push(i))),
        ),
      lookbook: () =>
        Effect.sync(() => {
          ledger.lookbooks.composed += 1;
          return new Uint8Array([0xff, 0xd8]);
        }),
      encoder: (_scale, _share, candidates) => encoder(candidates),
      encode: (from, to, _scale, share, by) =>
        Effect.acquireUseRelease(
          Effect.sync(() => {
            ledger.encoders.spawned += 1;
            ledger.encodedBy.push(by._tag);
          }),
          () =>
            Effect.forEach(
              Array.from({ length: to - from }, (_, k) => from + k),
              frame,
              { discard: true },
            ),
          (_, exit) =>
            Effect.sync(() =>
              Exit.match(exit, {
                onSuccess: () => void (ledger.encoders.finished += 1),
                onFailure: () => void (ledger.encoders.killed += 1),
              }),
            ),
        ).pipe(
          Effect.as({
            master: text(`mp4 ${from}-${to}`),
            // As the page: only the hardware encoder makes the share copy beside the master.
            share: Option.filter(
              Option.some(text(`share ${from}-${to}`)),
              () => share && sharesInPage(by),
            ),
            timing: { draw: to - from, page: 2 * (to - from) },
          }),
        ),
      contact: (frames) =>
        Effect.sync(() => {
          ledger.contacts.push(frames);
          return new Uint8Array([0xff, 0xd8]);
        }),
      look: (frames, w, h) =>
        Effect.forEach(frames, (i) => Effect.as(frame(i), looked(i))).pipe(
          Effect.map((drawn) => {
            const thumbs = new Uint8Array(frames.length * w * h * 4);
            drawn.forEach(({ grey }, k) => {
              thumbs.fill(grey, k * w * h * 4, (k + 1) * w * h * 4);
            });
            return {
              thumbs,
              faces: drawn.map((d) => d.faces),
              hands: drawn.map((d) => d.hands ?? []),
            };
          }),
        ),
      luma: (i, area) =>
        Effect.as(
          frame(i),
          Array.from({ length: area.cols * area.rows }, () => luma(i, area)),
        ),
      drawTimes: (frames) => Effect.forEach(frames, (i) => Effect.as(frame(i), 1)),
    };
  };
  const browser = Layer.effect(
    Browser,
    Effect.acquireRelease(
      Effect.sync(() => {
        ledger.browser.launched += 1;
        return Browser.of({
          open: (url: string) =>
            Effect.acquireRelease(
              Effect.sync(() => {
                ledger.urls.push(url);
                ledger.pages.opened += 1;
                return ledger.pages.opened;
              }),
              () => Effect.sync(() => void (ledger.pages.closed += 1)),
            ).pipe(
              Effect.map((page) =>
                framePage(
                  Option.getOrElse(
                    Option.flatMap(Option.fromNullishOr(host.infoAt), (at) => at(url)),
                    () => info,
                  ),
                  'Test film',
                  fakeInvoke(handleOf(page)),
                ),
              ),
            ),
        });
      }),
      () => Effect.sync(() => void (ledger.browser.closed += 1)),
    ),
  );
  return Layer.mergeAll(server, browser, fakeRenderMedia(ledger, host));
};

/** The render host's media alone: it measures the master and records every film it joins. */
export const fakeRenderMedia = (ledger: RenderLedger, host: FakeRenderHost = {}) => {
  const info = Option.getOrElse(Option.fromNullishOr(host.info), () => testExportInfo);
  return Layer.succeed(
    Media,
    Media.of({
      ...noRecording,
      duration: () =>
        Effect.succeed(Option.getOrElse(Option.fromNullishOr(host.master), () => info.duration)),
      decode: (file) =>
        Effect.sync(() => void ledger.decodes.push(file)).pipe(
          Effect.as(silence(MIX_RATE, MIX_RATE * info.duration, 2)),
        ),
      writeWav: () => Effect.void,
      encodeAac: (pcm) =>
        Effect.sync(() => void ledger.aac.push(pcm.frames)).pipe(
          Effect.andThen(Option.getOrElse(Option.fromNullishOr(host.aac), () => Effect.void)),
          Effect.onInterrupt(() => Effect.sync(() => void (ledger.aacInterrupted.count += 1))),
          Effect.as({ packets: [], meta: {} }),
        ),
      shareCopy: (master, out) => Effect.sync(() => void ledger.shareCopies.push({ master, out })),
      remux: (video) => Effect.sync(() => void ledger.remuxes.push(video)),
      join: (film) =>
        Effect.sync(() => void ledger.joins.push(film)).pipe(
          Effect.andThen(
            Option.match(Option.fromNullishOr(host.join), {
              onNone: () => Effect.void,
              onSome: (join) => join(film),
            }),
          ),
        ),
    }),
  );
};

export const testVoice: Voice = {
  voiceId: 'voice-1',
  model: 'eleven_v3',
  settings: { stability: 0.5 },
};

/** A small film at `/films/test`, laid out in memory. */
export const testFilm = (
  scenes: ReadonlyArray<Timed>,
  timings: Timings,
  voice: Voice = testVoice,
): LoadedFilm => ({
  paths: {
    name: 'test',
    dir: '/films/test',
    narration: '/films/test/narration',
    sound: '/films/test/sound',
    out: '/out/test',
    timings: {
      file: '/films/test/narration/timings.json',
      codec: TimingsJson,
      empty: { voice: '', scenes: {} },
    },
    manifest: {
      file: '/films/test/sound/manifest.json',
      codec: SoundManifestJson,
      empty: {},
    },
  },
  scenes,
  voice,
  sound: Option.none(),
  shorts: [],
  timings,
  manifest: {},
  heardAs: {},
  look: Option.none(),
  looks: {},
  sounds: NO_SOUNDS,
});

/**
 * A current take of `say`: one word every half second, each 0.4 s long, so
 * twelve words speak from 0 to 5.9 s.
 */
export const spokenTake = (say: string): VoiceTiming => {
  const parsed = Result.getOrThrow(parse('take', say));
  const words = parsed.spoken
    .split(' ')
    .map((text, i) => ({ text, start: i * 0.5, end: i * 0.5 + 0.4 }));
  return {
    hash: hashText(takeScript(parsed)),
    file: 'take.mp3',
    duration: Math.max(0, ...words.map((w) => w.end)),
    words: unmeasured(words),
    source: 'elevenlabs',
  };
};

const TWELVE = 'one two three four five six seven eight nine ten eleven twelve';

/**
 * Three recorded scenes of twelve words each (spoken 0.5–6.4 s, scene-local,
 * 6.5 s long): `held` has no cue after 1.4 s (5 s of speech with none),
 * `brief` none after 3.4 s (3 s), and `ambient` is laid out as `held` is, for
 * a page that draws it moving.
 */
export const holdScenes: ReadonlyArray<Timed> = [
  { id: 'held', say: TWELVE, timeline: { intro: { at: 'start', dur: 1.4 } } },
  { id: 'brief', say: TWELVE, timeline: { intro: { at: 'start', dur: 3.4 } } },
  { id: 'ambient', say: TWELVE, timeline: { intro: { at: 'start', dur: 1.4 } } },
];

export const holdTimings: Timings = {
  voice: voiceKey(testVoice),
  scenes: Object.fromEntries(holdScenes.map((s) => [s.id, spokenTake(TWELVE)])),
};

const TWENTY = `${TWELVE} thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty`;

/**
 * One recorded scene of twenty words (spoken 0.5–10.4 s, scene-local) with
 * no cue after 1.4 s: a 9 s candidate, for a page that draws motion no cue
 * declares inside it.
 */
export const longHoldScenes: ReadonlyArray<Timed> = [
  { id: 'long', say: TWENTY, timeline: { intro: { at: 'start', dur: 1.4 } } },
];

export const longHoldTimings: Timings = {
  voice: voiceKey(testVoice),
  scenes: { long: spokenTake(TWENTY) },
};

export const storeLayer = (files: Map<string, Uint8Array>) =>
  ContentStore.layer.pipe(Layer.provide([memoryFileSystem(files), Path.layer]));

/**
 * A probed line of text: a `w` × `h` box at (`x`, `y`), turned `rot` radians
 * about its centre, in scene `scene`.
 */
export const textBox = (
  text: string,
  x: number,
  y: number,
  w: number,
  h: number,
  options: {
    readonly alpha?: number;
    readonly rot?: number;
    readonly scene?: string;
    readonly order?: number;
    /** The seed of the hand that wrote it: what a stroke's `marks` names. */
    readonly hand?: number;
    /** The `order` of the plate it sits on. */
    readonly on?: number;
    /** Canvas pixels per unit of the space it was drawn in (default 1). */
    readonly scale?: number;
    /** The caption line. */
    readonly caption?: true;
  } = {},
): TextBox => {
  const rot = Option.getOrElse(Option.fromNullishOr(options.rot), () => 0);
  const cx = x + w / 2;
  const cy = y + h / 2;
  const turn = (px: number, py: number): readonly [number, number] => [
    cx + (px - cx) * Math.cos(rot) - (py - cy) * Math.sin(rot),
    cy + (px - cx) * Math.sin(rot) + (py - cy) * Math.cos(rot),
  ];
  const corners: TextBox['corners'] = [
    turn(x, y),
    turn(x + w, y),
    turn(x + w, y + h),
    turn(x, y + h),
  ];
  const xs = corners.map((c) => c[0]);
  const ys = corners.map((c) => c[1]);
  return {
    text,
    scene: Option.getOrElse(Option.fromNullishOr(options.scene), () => 'a'),
    x: Math.min(...xs),
    y: Math.min(...ys),
    w: Math.max(...xs) - Math.min(...xs),
    h: Math.max(...ys) - Math.min(...ys),
    corners,
    alpha: Option.getOrElse(Option.fromNullishOr(options.alpha), () => 1),
    order: Option.getOrElse(Option.fromNullishOr(options.order), () => 0),
    ...Option.match(Option.fromNullishOr(options.hand), {
      onNone: () => ({}),
      onSome: (hand) => ({ hand }),
    }),
    ...Option.match(Option.fromNullishOr(options.on), {
      onNone: () => ({}),
      onSome: (on) => ({ on }),
    }),
    scale: Option.getOrElse(Option.fromNullishOr(options.scale), () => 1),
    ...Option.match(Option.fromNullishOr(options.caption), {
      onNone: () => ({}),
      onSome: (caption) => ({ caption }),
    }),
  };
};

/**
 * A probed mark of ink along `points`: a stroke `width` wide (a fill or a
 * plate takes the points as its outline), drawn `order`-th in the frame.
 */
export const inkMark = (
  kind: InkMark['kind'],
  points: ReadonlyArray<readonly [number, number]>,
  options: {
    readonly width?: number;
    readonly alpha?: number;
    readonly order?: number;
    /** The seeds of the hands whose text this stroke marks on purpose. */
    readonly marks?: ReadonlyArray<number>;
    /** Canvas pixels per unit of the space it was drawn in (default 1). */
    readonly scale?: number;
    /** The caption line's plate. */
    readonly caption?: true;
  } = {},
): InkMark => {
  const xs = points.map((c) => c[0]);
  const ys = points.map((c) => c[1]);
  const mark: InkMark = {
    kind,
    scene: 'a',
    points,
    width: Option.getOrElse(Option.fromNullishOr(options.width), () => 4),
    x: Math.min(...xs),
    y: Math.min(...ys),
    w: Math.max(...xs) - Math.min(...xs),
    h: Math.max(...ys) - Math.min(...ys),
    alpha: Option.getOrElse(Option.fromNullishOr(options.alpha), () => 1),
    order: Option.getOrElse(Option.fromNullishOr(options.order), () => 0),
    scale: Option.getOrElse(Option.fromNullishOr(options.scale), () => 1),
    ...Option.match(Option.fromNullishOr(options.caption), {
      onNone: () => ({}),
      onSome: (caption) => ({ caption }),
    }),
  };
  return Option.match(Option.fromNullishOr(options.marks), {
    onNone: () => mark,
    onSome: (marks) => ({ ...mark, marks }),
  });
};

/**
 * A film folder on disk for the lab's source tools: `f/scenes/` with a hand
 * scene (a literal timeline and knobs, one computed offset), a drawing the
 * registry renames (`alpha` registered as `beta`) beside a decoy file that
 * exports a `beta` of its own, a scene whose timeline the registry builds in
 * code, and one with nothing to edit. Every file is as oxfmt leaves it, under
 * the repo's `.oxfmtrc.json`, copied to the root, and the root's
 * `node_modules/.bin/oxfmt` is the repo's: the source writer's `bunx oxfmt`
 * runs it, as it does in the repo, never fetching one from the registry
 * (which, in a folder with none, it did on every write, parallel workers
 * racing on its one install). `f/voice.ts` lets FilmRepo load it. Returns
 * the films folder.
 */
export const sceneFixture = Effect.fn('test.sceneFixture')(function* (root: string) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const repo = path.join(import.meta.dir, '..', '..', '..', '..');
  const scenes = path.join(root, 'films', 'f', 'scenes');
  yield* fs.makeDirectory(scenes, { recursive: true });
  yield* fs.copyFile(path.join(repo, '.oxfmtrc.json'), path.join(root, '.oxfmtrc.json'));
  const bin = path.join(root, 'node_modules', '.bin');
  yield* fs.makeDirectory(bin, { recursive: true });
  yield* fs.symlink(path.join(repo, 'node_modules', '.bin', 'oxfmt'), path.join(bin, 'oxfmt'));
  const files = {
    'drawing.ts': 'export const drawing = <T>(d: T): T => d;\n',
    '../voice.ts': "export const voice = { voiceId: 'v', model: 'eleven_v3', settings: {} };\n",
    'hand.ts': `import { drawing } from './drawing.ts';

const GAP = 0.2;

/** Faith is the hand, not the price. */
export const hand_ = drawing({
  enter: { kind: 'pan', dur: 0.8, dir: -1 },
  timeline: {
    /** The tower of merit tips and slides off the palm. */
    topple: { mark: 'earns', offset: 0.1, dur: 1.8 },
    late: { after: 'topple', offset: GAP * 2 },
  },
  knobs: {
    /** Where the palm comes to rest. */
    palm: [960, 800],
  },
  draw: () => {},
});

export { hand_ as hand };
`,
    'a.ts': `import { drawing } from './drawing.ts';

export const alpha = drawing({ timeline: { go: { at: 'start', dur: 1 } }, draw: () => {} });
`,
    'decoy.ts': `import { drawing } from './drawing.ts';

export const beta = drawing({ timeline: { go: { at: 'start', dur: 1 } }, draw: () => {} });
`,
    'index.ts': `import { alpha } from './a.ts';
import { hand } from './hand.ts';

export const scenes = [
  { id: 'hand', say: 'Faith {earns} nothing.', ...hand },
  { id: 'beta', ...alpha },
  { id: 'built', timeline: { x: { at: 'start' } } },
  { id: 'plain' },
];
`,
  };
  for (const [name, source] of Object.entries(files))
    yield* fs.writeFileString(path.join(scenes, name), source);
  return path.join(root, 'films');
});

// ---------------------------------------------------------------------------
// Shared review-HTTP fixture (review-http, choices-http, project-http)
// ---------------------------------------------------------------------------

/** A score option as film `f` offers it. */
const reviewOption = (id: string, picked: boolean) => ({
  id,
  label: id,
  lines: [],
  state: 'current' as const,
  picked,
  verbs: Arr.filter(['pick'] as const, () => !picked),
  media: { _tag: 'Heard' as const, alone: false, inPlace: true },
  key: id,
});

/** Film `f`'s choices: one score of two options, `warm` playing. */
export const REVIEW_CHOICES: FilmChoices = {
  film: 'f',
  pictures: [],
  points: [
    withSay(Option.none(), {
      ref: { _tag: 'Score' },
      address: Option.some({ _tag: 'Film' }),
      title: 'score',
      lines: [],
      variants: [reviewOption('warm', true), reviewOption('bright', false)],
    }),
  ],
};

/** Film `f`'s project: one scene, `a`, not yet rendered. */
export const REVIEW_PROJECT: Project = projectOf(
  emptyCatalogue('f'),
  { key: 'fk', sound: Option.none(), acts: [], scenes: [{ scene: 'a', key: 'k1' }] },
  'main',
);

/** The `film project` args each fresh run was asked for. */
export const reviewProjectRuns: Array<ReadonlyArray<string>> = [];

/** The pick of `bright`, in `sound.ts` of film `f` under `films`. */
const reviewPickIn = (films: string): Change => ({
  id: 'pick-bright',
  film: 'f',
  scene: Option.none(),
  file: `${films}/f/sound.ts`,
  target: 'score play bright',
  before: "play: 'warm'",
  after: "play: 'bright'",
  follows: Option.none(),
});

const reviewUnused = Effect.die('not used by the review routes');

/**
 * Film `f`'s services, faked over a films folder that holds only `f`: its
 * choices, a pick of `bright` that lands, an undo of it, and a check with
 * nothing to say. Every other name is no film of the app's.
 */
const reviewFilmServices = (films: string, PICK = reviewPickIn(films)) =>
  Layer.mergeAll(
    Layer.succeed(
      Choices,
      Choices.of({
        list: () => Effect.succeed(REVIEW_CHOICES),
        checked: () => Effect.succeed({ choices: REVIEW_CHOICES, findings: [] }),
        pick: (_, asked) =>
          Effect.succeed({
            file: PICK.file,
            target: `${asked.point} play ${asked.variant}`,
            change: Option.some(PICK),
          }),
        knob: () => reviewUnused,
        say: () => Effect.succeed(REVIEW_CHOICES),
        alone: () => reviewUnused,
        inPlace: () => reviewUnused,
      }),
    ),
    freshFilm({
      project: (args) =>
        Effect.suspend((): Effect.Effect<Project, SceneNotRendered | VerbRefused> => {
          reviewProjectRuns.push(args);
          if (args.includes('b'))
            return Effect.fail(
              VerbRefused.make({
                point: 'render:scenes:b',
                variant: 'main',
                verb: 'approve',
                reason: 'it is stale: its sources changed since it was made',
              }),
            );
          if (args.includes('--scene'))
            return Effect.fail(SceneNotRendered.make({ film: 'f', scene: 'a', variant: 'main' }));
          return Effect.succeed(REVIEW_PROJECT);
        }),
      check: (_, leg) =>
        Effect.succeed(
          Arr.filter(
            [{ level: 'warning', tag: 'DeadAir', message: 'no sound 3.0-4.2 s' }] as const,
            () => leg === 'sound',
          ),
        ),
    }),
    Layer.succeed(
      SourceWriter,
      SourceWriter.of({
        write: () => reviewUnused,
        around: () => reviewUnused,
        undo: () => Effect.succeed({ ...PICK, target: `undo ${PICK.target}` }),
        redo: () => reviewUnused,
        history: () =>
          Effect.succeed({
            undo: Option.none(),
            redo: Option.some(PICK),
            latest: Option.none(),
            landed: [],
          }),
      }),
    ),
    FilmFolder.layer(films),
  );

export class ReviewTestRoot extends Context.Service<ReviewTestRoot, string>()('test/Root') {}

/** The review over `out/art` (a set of two), its videos `seconds` long and a frame the video copied. */
export const reviewHttpFixtureLasting = (seconds: number) =>
  Layer.unwrap(
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const dir = yield* fs.makeTempDirectoryScoped();
      const out = path.join(dir, 'out');
      yield* fs.makeDirectory(path.join(out, 'art'), { recursive: true });
      yield* fs.writeFileString(path.join(out, 'art', 'roof.A.mp4'), '0123456789');
      yield* fs.writeFileString(path.join(out, 'art', 'roof.B.mp4'), 'abcdefghij');
      yield* fs.writeFileString(path.join(out, 'art', 'roof.vtt'), 'WEBVTT');
      yield* fs.writeFileString(
        path.join(out, 'art', 'review.json'),
        '{ "title": "Art", "docs": ["roof.vtt"], "sets": { "roof": { "order": ["A", "B"] } } }',
      );
      yield* fs.writeFileString(path.join(dir, 'secret.mp4'), 'secret');
      const films = path.join(dir, 'films');
      yield* fs.makeDirectory(path.join(films, 'f', 'scenes'), { recursive: true });
      yield* fs.writeFileString(path.join(films, 'f', 'scenes', 'index.ts'), 'export {};\n');
      yield* fs.makeDirectory(path.join(dir, 'beside', 'scenes'), { recursive: true });
      yield* fs.writeFileString(path.join(dir, 'beside', 'scenes', 'index.ts'), 'export {};\n');
      return Review.layer({
        roots: [{ label: 'out', path: out }],
        cache: path.join(dir, 'cache'),
        phoneOver: 1000,
        maxVideo: 10_000,
        phoneCopies: false,
      }).pipe(
        Layer.provide(reviewMedia([], seconds)),
        Layer.provide(RenderCatalogue.layer.pipe(Layer.provide(ContentStore.layer))),
        Layer.merge(Layer.succeed(ReviewTestRoot, dir)),
        Layer.merge(
          Layer.mergeAll(
            noSource,
            noStudio,
            echoPages,
            NotesStore.layer.pipe(
              Layer.provideMerge(ContentStore.layer),
              Layer.provide(
                ConfigProvider.layer(
                  ConfigProvider.fromUnknown({ FILMS_LAB: path.join(dir, 'lab') }),
                ),
              ),
            ),
          ),
        ),
        Layer.merge(reviewFilmServices(films)),
      );
    }),
  ).pipe(Layer.provideMerge(Layer.mergeAll(BunServices.layer, BunHttpPlatform.layer)));

/** The review fixture, its videos 12.5 s long. */
export const reviewHttpFixture = reviewHttpFixtureLasting(12.5);

/** Where the lab listens: every interface, on 8229. */
const reviewTestBound = { hostname: '0.0.0.0', port: 8229 } as const;
const reviewTestAllowed = { hosts: ['box.example:8229'] };

export const reviewTestGet = (path: string, headers: Record<string, string> = {}) =>
  new Request(`http://127.0.0.1:8229${path}`, { method: 'GET', headers });

export const reviewTestAsk = (request: Request) =>
  Effect.gen(function* () {
    const review = yield* labHandler(reviewTestAllowed);
    return yield* Effect.promise(() => review(request, reviewTestBound));
  });

export const reviewTestBody = (response: Response) => Effect.promise(() => response.text());

/** A refusal's JSON, decoded as the page decodes it. */
export const reviewTestRefusalOf = Schema.decodeSync(Schema.fromJsonString(Refusal));

export const reviewTestPost = (
  route: string,
  body: string,
  origin: string,
  type = 'application/json',
) =>
  new Request(`http://127.0.0.1:8229${route}`, {
    method: 'POST',
    headers: { host: 'box.example:8229', origin, 'content-type': type },
    body,
  });

export const REVIEW_TEST_HOME = 'https://box.example:8229';
