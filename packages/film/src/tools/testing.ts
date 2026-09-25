// Test doubles for the tools: an in-memory file system, and ElevenLabs and
// ffmpeg that answer from memory and count their calls. No network, no ffmpeg,
// no credits.

import { Effect, Encoding, Exit, FileSystem, Layer, Option, Path, Redacted, Stream } from 'effect';
import * as PlatformError from 'effect/PlatformError';
import {
  type ExportInfo,
  SoundManifestJson,
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

/** A file system over a map of path → bytes. */
export const memoryFileSystem = (files: Map<string, Uint8Array>) =>
  FileSystem.layerNoop({
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
  });

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
 * text itself, so the transcript of a take file is what was spoken into it,
 * unless `heard` maps that text to something else.
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
            audio_base64: Encoding.encodeBase64(request.text),
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
          const said = new TextDecoder().decode(files.get(file));
          const heard = Option.fromNullishOr(options.heard?.get(said));
          return { text: Option.getOrElse(heard, () => said) };
        }),
      composeMusic: (_plan, _model, out) => Effect.sync(() => void calls.music.push(out)),
      apiKey: Option.match(Option.fromNullishOr(options.apiKey), {
        onNone: () => Effect.fail(ApiKeyMissing.make({})),
        onSome: (key) => Effect.succeed(Redacted.make(key)),
      }),
      soundEffect: (_request, out) => Effect.sync(() => void calls.effects.push(out)),
    }),
  );

export const emptyCalls = (): ElevenLabsCalls => ({ tts: [], stt: [], music: [], effects: [] });

export const fakeFfmpeg = (runs: Array<ReadonlyArray<string>>) =>
  Layer.succeed(
    Ffmpeg,
    Ffmpeg.of({
      run: (args) => Effect.sync(() => void runs.push(args)),
      probeDuration: () => Effect.succeed(2.5),
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
  /** The text boxes a probe of frame `i` reports (none by default); failing breaks the page. */
  readonly probe?: (
    i: number,
  ) => Effect.Effect<ReadonlyArray<TextBox>, PageError | PageCrashed | FrameFailed>;
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
    () => (): Effect.Effect<ReadonlyArray<TextBox>> => Effect.succeed([]),
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
      probeDuration: () => Effect.succeed(info.duration),
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
  options: { readonly alpha?: number; readonly rot?: number; readonly scene?: string } = {},
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
  };
};
