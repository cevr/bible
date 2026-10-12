// A take's picture and its voice stay together through the footage library's
// copies (`footage-media.ts`): a synthetic clapper's clip (a white frame and
// a click on one moment, `fixtures/sync-clip.ts`) made into its mezzanine
// and its voice keeps the flash and the click within one frame, whether the
// camera's picture starts at zero or after it, and whether its frames run at
// a constant rate or a variable one, and from either camera a talk is shot
// on: an iPhone's HEVC MOV, upright, or a Sony ZV-E10's H.264 MP4, landscape
// and at 24 or 30. Each copy is constant-rate at its recipe's rate, the way up
// its original is, its key frames no further apart than its recipe allows.

import { BunServices } from '@effect/platform-bun';
import { Effect, FileSystem, Layer, Option, Path, Stream } from 'effect';
import { describe, expect, it } from 'effect-bun-test';
import {
  ALL_FORMATS,
  EncodedPacketSink,
  FilePathSource,
  Input,
  type InputVideoTrack,
  VideoSampleSink,
} from 'mediabunny';
import { FOOTAGE_RECIPES } from '../../src/core/footage.ts';
import { MIX_RATE } from '../../src/core/mix.ts';
import { FootageMedia } from '../../src/tools/footage-media.ts';
import { type SyncClip, syncClip } from '../../src/tools/fixtures/sync-clip.ts';
import { Media } from '../../src/tools/media.ts';

const Live = FootageMedia.layer.pipe(
  Layer.provideMerge(Media.layer),
  Layer.provideMerge(BunServices.layer),
);

/** `file`'s picture, open until the scope closes. */
const pictureIn = (file: string) =>
  Effect.gen(function* () {
    const input = yield* Effect.acquireRelease(
      Effect.sync(() => new Input({ source: new FilePathSource(file), formats: ALL_FORMATS })),
      (opened) => Effect.sync(() => opened.dispose()),
    );
    const track = yield* Effect.promise(() => input.getPrimaryVideoTrack());
    return yield* Effect.fromNullishOr(track).pipe(Effect.orDie);
  });

/** When `track`'s first bright frame shows: the flash. Every frame is decoded, so no decoder is left running. */
const flashIn = (track: InputVideoTrack) =>
  Stream.fromAsyncIterable(new VideoSampleSink(track).samples(), String).pipe(
    Stream.mapEffect((sample) =>
      Effect.ensuring(
        Effect.gen(function* () {
          const plane = new Uint8Array(sample.allocationSize({ format: 'I420' }));
          yield* Effect.promise(() => sample.copyTo(plane, { format: 'I420' }));
          const luma = plane.subarray(0, sample.codedWidth * sample.codedHeight);
          const bright = luma.reduce((sum, y) => sum + y, 0) / luma.length > 128;
          return Option.liftPredicate(sample.timestamp, () => bright);
        }),
        Effect.sync(() => sample.close()),
      ),
    ),
    Stream.runCollect,
    Effect.map((each) => Option.getOrElse(Option.firstSomeOf(each), () => Number.NaN)),
    Effect.orDie,
  );

/** Every packet's time and length and whether it is a key frame, in decode order. */
const packetsIn = (track: InputVideoTrack) =>
  Stream.fromAsyncIterable(new EncodedPacketSink(track).packets(), String).pipe(
    Stream.map((packet) => ({
      at: packet.timestamp,
      key: packet.type === 'key',
      length: packet.duration,
    })),
    Stream.runCollect,
    Effect.orDie,
  );

/** The clip made, imported into its mezzanine and proxy and its voice; where the flash and the click fall in them. */
const synced = (clip: SyncClip) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const dir = yield* fs.makeTempDirectoryScoped();
    const file = path.join(dir, `take${CONTAINERS[clip.camera]}`);
    yield* fs.writeFile(file, yield* syncClip(clip));
    const media = yield* FootageMedia;
    const { probe } = yield* media.probe(file);
    const mezzanine = path.join(dir, 'mezzanine.mp4');
    const proxy = path.join(dir, 'proxy.mp4');
    yield* media.copy(file, probe.picture, 'mezzanine', mezzanine);
    yield* media.copy(file, probe.picture, 'proxy', proxy);
    const voice = yield* media.voice(file, probe.picture, MIX_RATE);
    const samples = voice.channels[0] ?? new Float32Array(0);
    const click = samples.findIndex((x) => Math.abs(x) > 0.5) / voice.rate;
    const picture = yield* pictureIn(mezzanine);
    return {
      probe,
      upright: picture.displayHeight > picture.displayWidth,
      click,
      flash: yield* flashIn(picture),
      mezzanine: yield* packetsIn(picture),
      proxy: yield* packetsIn(yield* pictureIn(proxy)),
    };
  });

/** The longest run between key frames, in seconds, by their times. */
const longestGap = (packets: ReadonlyArray<{ readonly at: number; readonly key: boolean }>) => {
  const keys = packets.filter((p) => p.key).map((p) => p.at);
  const end = Math.max(...packets.map((p) => p.at));
  return Math.max(...[...keys, end].slice(1).map((at, k) => at - (keys[k] ?? 0)));
};

/** Each camera's file extension, as it names its files. */
const CONTAINERS = { iphone: '.mov', 'zv-e10': '.mp4' } as const;

/** Each camera's picture codec, as the probe names it. */
const CODECS = { iphone: 'hevc', 'zv-e10': 'avc' } as const;

const CLIPS: ReadonlyArray<readonly [string, SyncClip]> = [
  [
    'a ZV-E10 picture from zero',
    { camera: 'zv-e10', frames: 60, fps: 30, flash: 30, pictureStart: 0, variable: false },
  ],
  [
    'a ZV-E10 picture starting a tenth of a second in',
    { camera: 'zv-e10', frames: 60, fps: 30, flash: 30, pictureStart: 0.1, variable: false },
  ],
  [
    'a ZV-E10 picture at 24',
    { camera: 'zv-e10', frames: 48, fps: 24, flash: 25, pictureStart: 0, variable: false },
  ],
  [
    'an iPhone picture from zero',
    { camera: 'iphone', frames: 60, fps: 30, flash: 30, pictureStart: 0, variable: false },
  ],
  [
    "an iPhone's variable rate, its picture starting late",
    { camera: 'iphone', frames: 60, fps: 30, flash: 31, pictureStart: 0.05, variable: true },
  ],
];

describe('a take keeps its picture and its voice together', () => {
  for (const [what, clip] of CLIPS)
    it.live(
      `the flash and the click are within one frame in the mezzanine and the voice: ${what}`,
      () =>
        Effect.scoped(
          Effect.gen(function* () {
            const made = yield* synced(clip);
            expect(made.probe.picture.variable).toBe(clip.variable);
            expect(made.probe.picture.codec).toBe(CODECS[clip.camera]);
            expect(made.upright).toBe(clip.camera === 'iphone');
            expect(Math.abs(made.click - made.flash)).toBeLessThanOrEqual(1 / 30);
            // Constant-rate at the recipe's rate.
            expect(new Set(made.mezzanine.map((p) => p.length.toFixed(5)))).toEqual(
              new Set([(1 / FOOTAGE_RECIPES.mezzanine.fps).toFixed(5)]),
            );
          }),
        ).pipe(Effect.provide(Live)),
      60_000,
    );

  it.live(
    "each copy's key frames are no further apart than its recipe allows",
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const made = yield* synced({
            camera: 'zv-e10',
            frames: 150,
            fps: 30,
            flash: 30,
            pictureStart: 0,
            variable: false,
          });
          expect(longestGap(made.mezzanine)).toBeLessThanOrEqual(
            FOOTAGE_RECIPES.mezzanine.keyEvery + 1e-6,
          );
          expect(longestGap(made.proxy)).toBeLessThanOrEqual(FOOTAGE_RECIPES.proxy.keyEvery + 1e-6);
        }),
      ).pipe(Effect.provide(Live)),
    60_000,
  );
});
