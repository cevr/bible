// Test doubles for the tools: an in-memory file system, and ElevenLabs and
// ffmpeg that answer from memory and count their calls. No network, no ffmpeg,
// no credits.

import { Effect, Encoding, Exit, FileSystem, Layer, Option, Path, Redacted, Stream } from 'effect';
import * as PlatformError from 'effect/PlatformError';
import {
  type ExportInfo,
  SoundManifestJson,
  type InkMark,
  type Probed,
  type TextBox,
  type Timed,
  type Timings,
  TimingsJson,
  type Voice,
} from '../core/schema.ts';
import { ContentStore } from './content-store.ts';
import { ElevenLabs, type TtsRequest } from './elevenlabs.ts';
import { Browser } from './browser.ts';
import { ApiKeyMissing, type FrameFailed, type PageCrashed, type PageError } from './errors.ts';
import { Ffmpeg } from './ffmpeg.ts';
import type { LoadedFilm } from './film-repo.ts';
import { PreviewServer } from './preview-server.ts';

const notFound = (method: string, path: string) =>
  PlatformError.systemError({
    _tag: 'NotFound',
    module: 'FileSystem',
    method,
    pathOrDescriptor: path,
  });

/** File operations over a map of path → bytes. */
const memoryOps = (files: Map<string, Uint8Array>) =>
  ({
    exists: (path) =>
      Effect.succeed(files.has(path) || [...files.keys()].some((f) => f.startsWith(`${path}/`))),
    readFile: (path) =>
      Option.match(Option.fromNullishOr(files.get(path)), {
        onNone: () => Effect.fail(notFound('readFile', path)),
        onSome: Effect.succeed,
      }),
    readFileString: (path) =>
      Option.match(Option.fromNullishOr(files.get(path)), {
        onNone: () => Effect.fail(notFound('readFileString', path)),
        onSome: (bytes) => Effect.succeed(new TextDecoder().decode(bytes)),
      }),
    writeFile: (path, data) => Effect.sync(() => void files.set(path, data)),
    writeFileString: (path, data) => Effect.sync(() => void files.set(path, text(data))),
    makeDirectory: () => Effect.void,
    rename: (from, to) =>
      Option.match(Option.fromNullishOr(files.get(from)), {
        onNone: () => Effect.fail(notFound('rename', from)),
        onSome: (bytes) =>
          Effect.sync(() => {
            files.delete(from);
            files.set(to, bytes);
          }),
      }),
    remove: (path) => Effect.sync(() => void files.delete(path)),
    readDirectory: (path) =>
      Effect.sync(() =>
        [...files.keys()]
          .filter((f) => f.startsWith(`${path}/`))
          .map((f) => f.slice(path.length + 1))
          .filter((name) => !name.includes('/')),
      ),
  }) satisfies Partial<FileSystem.FileSystem>;

/** A file system over a map of path → bytes. */
export const memoryFileSystem = (files: Map<string, Uint8Array>) =>
  FileSystem.layerNoop(memoryOps(files));

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
    remove: (path) => crash('remove', path).pipe(Effect.andThen(ops.remove(path))),
  });
  return { layer, ops: () => count };
};

export const text = (s: string) => new TextEncoder().encode(s);

/** What the fake ElevenLabs was asked to do. */
export interface ElevenLabsCalls {
  readonly tts: Array<TtsRequest>;
  readonly stt: Array<string>;
  readonly music: Array<string>;
  readonly effects: Array<string>;
}

/**
 * Speech comes back aligned one character per 0.05 s, and its "audio" is the
 * text itself, padded with one space per take so no two takes are the same
 * bytes. The transcript of a take file is what was spoken into it, unless
 * `heard` maps that text to something else.
 */
export const fakeElevenLabs = (
  files: Map<string, Uint8Array>,
  calls: ElevenLabsCalls,
  options: { readonly heard?: ReadonlyMap<string, string>; readonly apiKey?: string } = {},
) =>
  Layer.succeed(
    ElevenLabs,
    ElevenLabs.of({
      tts: (request) =>
        Effect.sync(() => {
          calls.tts.push(request);
          const characters = [...request.text];
          return {
            audio_base64: Encoding.encodeBase64(request.text + ' '.repeat(calls.tts.length)),
            alignment: {
              characters,
              character_start_times_seconds: characters.map((_, i) => i * 0.05),
              character_end_times_seconds: characters.map((_, i) => i * 0.05 + 0.05),
            },
          };
        }),
      stt: (file) =>
        Effect.sync(() => {
          calls.stt.push(file);
          const said = new TextDecoder().decode(files.get(file)).trim();
          const heard = Option.fromNullishOr(options.heard?.get(said));
          return { text: Option.getOrElse(heard, () => said) };
        }),
      composeMusic: (_plan, _model, out) => Effect.sync(() => void calls.music.push(out)),
      ready: Effect.void,
      apiKey: Option.match(Option.fromNullishOr(options.apiKey), {
        onNone: () => Effect.fail(ApiKeyMissing.make({})),
        onSome: (key) => Effect.succeed(Redacted.make(key)),
      }),
      soundEffect: (_request, out) => Effect.sync(() => void calls.effects.push(out)),
    }),
  );

export const emptyCalls = (): ElevenLabsCalls => ({ tts: [], stt: [], music: [], effects: [] });

/** A take's length as the fake ffmpeg measures it: a tenth of a second per byte. */
export const fakeLength = (bytes: Uint8Array) => bytes.length / 10;

/** An ffmpeg that records its runs; with `files`, it measures a file by `fakeLength`, else as 2.5 s. */
export const fakeFfmpeg = (runs: Array<ReadonlyArray<string>>, files?: Map<string, Uint8Array>) =>
  Layer.succeed(
    Ffmpeg,
    Ffmpeg.of({
      run: (args) => Effect.sync(() => void runs.push(args)),
      version: Effect.void,
      probeDuration: (file) =>
        Effect.succeed(
          Option.match(Option.fromNullishOr(files?.get(file)), {
            onNone: () => 2.5,
            onSome: fakeLength,
          }),
        ),
      probeStreams: () => Effect.succeed(['audio']),
      encode: (args, input) =>
        Stream.runDrain(input).pipe(Effect.tap(() => Effect.sync(() => void runs.push(args)))),
    }),
  );

/** Everything the fake render host opened and closed, so a test can check nothing leaked. */
export interface RenderLedger {
  readonly server: { started: number; stopped: number };
  readonly browser: { launched: number; closed: number };
  readonly pages: { opened: number; closed: number };
  readonly encoders: { spawned: number; finished: number; killed: number };
  /** Every frame drawn, by any page. */
  readonly frames: Array<number>;
  /** Every ffmpeg run that is not an encode (concat, contact sheet). */
  readonly runs: Array<ReadonlyArray<string>>;
}

export const emptyLedger = (): RenderLedger => ({
  server: { started: 0, stopped: 0 },
  browser: { launched: 0, closed: 0 },
  pages: { opened: 0, closed: 0 },
  encoders: { spawned: 0, finished: 0, killed: 0 },
  frames: [],
  runs: [],
});

export const testExportInfo: ExportInfo = {
  width: 1920,
  height: 1080,
  fps: 30,
  duration: 20,
  frames: 600,
};

export interface FakeRenderHost {
  readonly info?: ExportInfo;
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
  /** How long ffprobe measures the audio master (default: the film's length). */
  readonly master?: number;
  /** The streams ffprobe finds in the rendered video (default: video, plus audio if the film has it). */
  readonly streams?: ReadonlyArray<string>;
}

/**
 * A preview server, a browser whose pages draw one-byte frames, and an ffmpeg
 * that drains its input, each recording in `ledger` when it opens and closes.
 */
export const fakeRenderHost = (ledger: RenderLedger, host: FakeRenderHost = {}) => {
  const info = Option.getOrElse(Option.fromNullishOr(host.info), () => testExportInfo);
  const draw = Option.getOrElse(Option.fromNullishOr(host.frame), () => () => Effect.void);
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
  const browser = Layer.effect(
    Browser,
    Effect.acquireRelease(
      Effect.sync(() => {
        ledger.browser.launched += 1;
        return Browser.of({
          open: () =>
            Effect.acquireRelease(
              Effect.sync(() => {
                ledger.pages.opened += 1;
                return ledger.pages.opened;
              }),
              () => Effect.sync(() => void (ledger.pages.closed += 1)),
            ).pipe(
              Effect.map((page) => ({
                info,
                frame: (i: number) =>
                  Effect.sleep('1 millis').pipe(
                    Effect.andThen(draw(i, page)),
                    Effect.map(() => {
                      ledger.frames.push(i);
                      return new Uint8Array([i % 256]);
                    }),
                  ),
                probe: (i: number) =>
                  Effect.sleep('1 millis').pipe(
                    Effect.andThen(probe(i)),
                    Effect.tap(() => Effect.sync(() => void ledger.frames.push(i))),
                  ),
              })),
            ),
        });
      }),
      () => Effect.sync(() => void (ledger.browser.closed += 1)),
    ),
  );
  const ffmpeg = Layer.succeed(
    Ffmpeg,
    Ffmpeg.of({
      run: (args) => Effect.sync(() => void ledger.runs.push(args)),
      version: Effect.void,
      probeDuration: () =>
        Effect.succeed(Option.getOrElse(Option.fromNullishOr(host.master), () => info.duration)),
      probeStreams: () =>
        Effect.succeed(
          Option.getOrElse(Option.fromNullishOr(host.streams), () =>
            Option.match(Option.fromNullishOr(info.audio), {
              onNone: () => ['video'],
              onSome: () => ['video', 'audio'],
            }),
          ),
        ),
      encode: (_args, input) =>
        Effect.acquireUseRelease(
          Effect.sync(() => void (ledger.encoders.spawned += 1)),
          () => Stream.runDrain(input),
          (_, exit) =>
            Effect.sync(() =>
              Exit.match(exit, {
                onSuccess: () => void (ledger.encoders.finished += 1),
                onFailure: () => void (ledger.encoders.killed += 1),
              }),
            ),
        ),
    }),
  );
  return Layer.mergeAll(server, browser, ffmpeg);
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
      empty: { effects: {} },
    },
  },
  scenes,
  voice,
  sound: Option.none(),
  timings,
  manifest: { effects: {} },
});

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
    readonly marks?: string;
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
 * the repo's `.oxfmtrc.json`, copied to the root; `f/voice.ts` lets FilmRepo
 * load it. Returns the films folder.
 */
export const sceneFixture = Effect.fn('test.sceneFixture')(function* (root: string) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const scenes = path.join(root, 'films', 'f', 'scenes');
  yield* fs.makeDirectory(scenes, { recursive: true });
  yield* fs.copyFile(
    path.join(import.meta.dir, '..', '..', '..', '..', '.oxfmtrc.json'),
    path.join(root, '.oxfmtrc.json'),
  );
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

export const alpha = drawing({ timeline: { go: { scene: 'start', dur: 1 } }, draw: () => {} });
`,
    'decoy.ts': `import { drawing } from './drawing.ts';

export const beta = drawing({ timeline: { go: { scene: 'start', dur: 1 } }, draw: () => {} });
`,
    'index.ts': `import { alpha } from './a.ts';
import { hand } from './hand.ts';

export const scenes = [
  { id: 'hand', say: 'Faith {earns} nothing.', ...hand },
  { id: 'beta', ...alpha },
  { id: 'built', timeline: { x: { scene: 'start' } } },
  { id: 'plain' },
];
`,
  };
  for (const [name, source] of Object.entries(files))
    yield* fs.writeFileString(path.join(scenes, name), source);
  return path.join(root, 'films');
});
