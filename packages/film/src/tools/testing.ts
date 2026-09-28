// Test doubles for the tools: an in-memory file system, and ElevenLabs, media,
// a browser and its pages that answer from memory and count their calls. No
// network, no Chromium, no credits.

import { Effect, Encoding, Exit, FileSystem, Layer, Option, Path, Redacted, Schema } from 'effect';
import * as PlatformError from 'effect/PlatformError';
import { silence } from '../core/audio.ts';
import { MIX_RATE } from '../core/mix.ts';
import { hashText, parse, takeScript, voiceKey } from '../core/narration.ts';
import {
  type ExportInfo,
  type VoiceTiming,
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
import { type DialogueRequest, ElevenLabs, type TtsRequest } from './elevenlabs.ts';
import { Browser, type LumaArea } from './browser.ts';
import {
  ApiKeyMissing,
  EncodeFailed,
  type EncoderMissing,
  type FrameFailed,
  type PageCrashed,
  type PageError,
  type MediaFailed,
} from './errors.ts';
import type { LoadedFilm } from './film-repo.ts';
import { type JoinedFilm, Media } from './media.ts';
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
    // A folder goes with everything under it, as `recursive` asks.
    remove: (path) =>
      Effect.sync(() => {
        for (const file of [...files.keys()])
          if (file === path || file.startsWith(`${path}/`)) files.delete(file);
      }),
    makeTempDirectoryScoped: () => Effect.succeed('/tmp/film-test'),
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

/**
 * Speech comes back aligned one character per 0.05 s, and its "audio" is the
 * text itself, padded with one space per take so no two takes are the same
 * bytes. A dialogue aligns its lines joined with nothing between them, as the
 * API does, and its audio is the lines read one after another. The transcript
 * of a take file is what was spoken into it, unless `heard` maps that text to
 * something else.
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
          return {
            audio_base64: Encoding.encodeBase64(request.text + ' '.repeat(calls.tts.length)),
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
            audio_base64: Encoding.encodeBase64(said + ' '.repeat(calls.dialogue.length)),
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
 * Media over `files`: a file measures `fakeLength` of its bytes (2.5 s when it
 * is not there), decodes to a second of mono silence at the mix's rate, and a
 * WAV written lands as `wav <frames>`, and a joined film as `mp4 <frames>`.
 */
export const fakeMedia = (files: Map<string, Uint8Array> = new Map()) =>
  Layer.succeed(
    Media,
    Media.of({
      duration: (file) =>
        Effect.succeed(
          Option.match(Option.fromNullishOr(files.get(file)), {
            onNone: () => 2.5,
            onSome: fakeLength,
          }),
        ),
      decode: () => Effect.succeed(silence(MIX_RATE, MIX_RATE, 1)),
      writeWav: (file, pcm) => Effect.sync(() => void files.set(file, text(`wav ${pcm.frames}`))),
      encodeAac: () => Effect.succeed({ packets: [], meta: {} }),
      join: (film) => Effect.sync(() => void files.set(film.out, text(`mp4 ${film.frames}`))),
    }),
  );

/** Everything the fake render host opened and closed, so a test can check nothing leaked. */
export interface RenderLedger {
  readonly server: { started: number; stopped: number };
  readonly browser: { launched: number; closed: number };
  readonly pages: { opened: number; closed: number };
  /** Chunks a page began to encode: each finished, or was cut off (killed). */
  readonly encoders: { spawned: number; finished: number; killed: number };
  /** Every frame drawn, by any page. */
  readonly frames: Array<number>;
  /** Look-books composed, by any page. */
  readonly lookbooks: { composed: number };
  /** The frames of every contact sheet composed. */
  readonly contacts: Array<ReadonlyArray<number>>;
  /** Every film joined. */
  readonly joins: Array<JoinedFilm>;
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
  frames: [],
  lookbooks: { composed: 0 },
  contacts: [],
  joins: [],
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
  /** How long the audio master measures (default: the film's length). */
  readonly master?: number;
  /** What a page's encoder check finds (ready by default). */
  readonly encoder?: Effect.Effect<void, EncoderMissing>;
  /** What an AAC encode does once it is recorded (nothing by default). */
  readonly aac?: Effect.Effect<void, MediaFailed>;
  /** What a join does once it is recorded (nothing by default). */
  readonly join?: (film: JoinedFilm) => Effect.Effect<void, MediaFailed>;
  /** How many milliseconds frame `i` takes to draw, as `time` reports it (default 10). */
  readonly drawMs?: (i: number) => number;
  /** The pixel hash `hash` reports for frame `i` (default `px<i>`). */
  readonly pixels?: (i: number) => string;
  /** The luma every sample of frame `i` reads, as `luma` reports it (default 128). */
  readonly luma?: (i: number) => number;
}

/**
 * A preview server, and a browser whose pages draw one-byte frames and encode
 * chunks of them, each recording in `ledger` when it opens and closes; and
 * media that measures the master and records every film it joins.
 */
export const fakeRenderHost = (ledger: RenderLedger, host: FakeRenderHost = {}) => {
  const info = Option.getOrElse(Option.fromNullishOr(host.info), () => testExportInfo);
  const draw = Option.getOrElse(Option.fromNullishOr(host.frame), () => () => Effect.void);
  const encoder = Option.getOrElse(Option.fromNullishOr(host.encoder), () => Effect.void);
  const drawMs = Option.getOrElse(Option.fromNullishOr(host.drawMs), () => () => 10);
  const pixels = Option.getOrElse(Option.fromNullishOr(host.pixels), () => (i: number) => `px${i}`);
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
              Effect.map((page) => {
                const frame = (i: number) =>
                  Effect.sleep('1 millis').pipe(
                    Effect.andThen(draw(i, page)),
                    Effect.map(() => {
                      ledger.frames.push(i);
                      return new Uint8Array([i % 256]);
                    }),
                  );
                return {
                  info,
                  title: 'Test film',
                  frame,
                  probe: (i: number) =>
                    Effect.sleep('1 millis').pipe(
                      Effect.andThen(probe(i)),
                      Effect.tap(() => Effect.sync(() => void ledger.frames.push(i))),
                    ),
                  lookbook: Effect.sync(() => {
                    ledger.lookbooks.composed += 1;
                    return new Uint8Array([0xff, 0xd8]);
                  }),
                  encoder: () => encoder,
                  encode: (
                    chunk: { readonly from: number; readonly to: number },
                    _scale: number,
                    share: boolean,
                  ) =>
                    Effect.acquireUseRelease(
                      Effect.sync(() => void (ledger.encoders.spawned += 1)),
                      () =>
                        Effect.forEach(
                          Array.from({ length: chunk.to - chunk.from }, (_, k) => chunk.from + k),
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
                      Effect.catchTag('FrameFailed', (error) =>
                        Effect.fail(
                          EncodeFailed.make({
                            from: chunk.from,
                            to: chunk.to,
                            reason: error.reason,
                          }),
                        ),
                      ),
                      Effect.as({
                        master: text(`mp4 ${chunk.from}-${chunk.to}`),
                        share: Option.filter(
                          Option.some(text(`share ${chunk.from}-${chunk.to}`)),
                          () => share,
                        ),
                      }),
                    ),
                  contact: (frames: ReadonlyArray<number>) =>
                    Effect.sync(() => {
                      ledger.contacts.push(frames);
                      return new Uint8Array([0xff, 0xd8]);
                    }),
                  time: (frames: ReadonlyArray<number>) =>
                    Effect.forEach(frames, (i) => Effect.as(frame(i), drawMs(i))),
                  hash: (frames: ReadonlyArray<number>) =>
                    Effect.forEach(frames, (i) => Effect.as(frame(i), pixels(i))),
                  luma: (i: number, area: LumaArea) =>
                    Effect.as(
                      frame(i),
                      Array.from({ length: area.cols * area.rows }, () => luma(i)),
                    ),
                };
              }),
            ),
        });
      }),
      () => Effect.sync(() => void (ledger.browser.closed += 1)),
    ),
  );
  const media = Layer.succeed(
    Media,
    Media.of({
      duration: () =>
        Effect.succeed(Option.getOrElse(Option.fromNullishOr(host.master), () => info.duration)),
      decode: () => Effect.succeed(silence(MIX_RATE, MIX_RATE * info.duration, 2)),
      writeWav: () => Effect.void,
      encodeAac: (pcm) =>
        Effect.sync(() => void ledger.aac.push(pcm.frames)).pipe(
          Effect.andThen(Option.getOrElse(Option.fromNullishOr(host.aac), () => Effect.void)),
          Effect.onInterrupt(() => Effect.sync(() => void (ledger.aacInterrupted.count += 1))),
          Effect.as({ packets: [], meta: {} }),
        ),
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
  return Layer.mergeAll(server, browser, media);
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
  shorts: [],
  timings,
  manifest: { effects: {} },
});

/**
 * A current take of `say`: one word every half second, each 0.4 s long, so
 * twelve words speak from 0 to 5.9 s.
 */
export const spokenTake = (say: string): VoiceTiming => {
  const parsed = parse(say);
  const words = parsed.spoken
    .split(' ')
    .map((text, i) => ({ text, start: i * 0.5, end: i * 0.5 + 0.4 }));
  return {
    hash: hashText(takeScript(parsed)),
    file: 'take.mp3',
    duration: Math.max(0, ...words.map((w) => w.end)),
    words,
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
  { id: 'held', say: TWELVE, timeline: { intro: { scene: 'start', dur: 1.4 } } },
  { id: 'brief', say: TWELVE, timeline: { intro: { scene: 'start', dur: 3.4 } } },
  { id: 'ambient', say: TWELVE, timeline: { intro: { scene: 'start', dur: 1.4 } } },
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
  { id: 'long', say: TWENTY, timeline: { intro: { scene: 'start', dur: 1.4 } } },
];

export const longHoldTimings: Timings = {
  voice: voiceKey(testVoice),
  scenes: { long: spokenTake(TWENTY) },
};

/**
 * A stand-in 2D context (bun has no canvas) that the kit can draw a stroke or
 * a cutout into, under a transform that scales by `zoom`: drawing does
 * nothing, and the probe reads the transform and the opacity.
 */
export const stubContext = (zoom: number): CanvasRenderingContext2D =>
  Schema.decodeSync(Schema.Any)({
    globalAlpha: 1,
    fillStyle: '#000',
    getTransform: () => ({ a: zoom, b: 0, c: 0, d: zoom, e: 0, f: 0 }),
    save: () => {},
    restore: () => {},
    beginPath: () => {},
    moveTo: () => {},
    lineTo: () => {},
    closePath: () => {},
    fill: () => {},
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
