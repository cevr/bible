// A synthetic camera clip for the footage tests, made in the test with
// mediabunny and x264 (`tools/x264.ts`): each frame carries its own number
// as bars (`numbered-frames.ts`), so a frame read back anywhere (a luma
// readout of the page, a decoded export) says which source frame it shows.
// No real footage is ever used.

import { BunServices } from '@effect/platform-bun';
import { Effect, Layer, Option } from 'effect';
import {
  ALL_FORMATS,
  BufferSource,
  BufferTarget,
  Input,
  Mp4OutputFormat,
  Output,
  VideoSample,
  VideoSampleSink,
  VideoSampleSource,
} from 'mediabunny';
import { Media } from '../../tools/media.ts';
import { BITS, CLIP_H, CLIP_W, numberOf } from './numbered-frames.ts';

/** The Y (luma) of a one bar and a zero bar: video white and video black. */
const LUMA = [16, 235] as const;

/**
 * mediabunny's coders in Bun, registered once for every clip: the media
 * service registers them as it is built (x264 for H.264, FFmpeg to decode).
 */
const registered = Effect.runSync(
  Effect.cached(Effect.scoped(Layer.build(Layer.provide(Media.layer, BunServices.layer)))),
);

/** Frame `n`'s picture, as I420: its bars in the luma plane, the chroma grey. */
const picture = (n: number): Uint8Array => {
  const luma = CLIP_W * CLIP_H;
  const bytes = new Uint8Array(luma * 1.5).fill(128);
  const bar = CLIP_W / BITS;
  for (let y = 0; y < CLIP_H; y += 1)
    for (let x = 0; x < CLIP_W; x += 1)
      bytes[y * CLIP_W + x] = LUMA[(n >> (BITS - 1 - Math.floor(x / bar))) & 1] ?? LUMA[0];
  return bytes;
};

/** A clip of `frames` numbered frames at `fps`, a key frame every `keyEvery` seconds: its MP4 bytes. */
export const numberedClip = (options: {
  readonly frames: number;
  readonly fps: number;
  readonly keyEvery: number;
}): Effect.Effect<Uint8Array> =>
  Effect.gen(function* () {
    yield* registered;
    const target = new BufferTarget();
    const output = new Output({ format: new Mp4OutputFormat({ fastStart: 'in-memory' }), target });
    const source = new VideoSampleSource({
      codec: 'avc',
      bitrate: 2_000_000,
      keyFrameInterval: options.keyEvery,
    });
    output.addVideoTrack(source, { frameRate: options.fps });
    yield* Effect.promise(() => output.start());
    yield* Effect.forEach(
      Array.from({ length: options.frames }, (_, n) => n),
      (n) =>
        Effect.acquireUseRelease(
          Effect.sync(
            () =>
              new VideoSample(picture(n), {
                format: 'I420',
                codedWidth: CLIP_W,
                codedHeight: CLIP_H,
                timestamp: n / options.fps,
                duration: 1 / options.fps,
              }),
          ),
          (sample) => Effect.promise(() => source.add(sample)),
          (sample) => Effect.sync(() => sample.close()),
        ),
      { discard: true },
    );
    yield* Effect.promise(() => output.finalize());
    const buffer = yield* Effect.fromOption(
      Option.fromNullishOr(target.buffer),
      () => 'the numbered clip wrote nothing',
    );
    return new Uint8Array(buffer);
  }).pipe(Effect.orDie);

/** The number decoded `sample` shows, read across its middle row's luma. */
const numberShown = (sample: VideoSample): Effect.Effect<number> =>
  Effect.gen(function* () {
    const plane = new Uint8Array(sample.allocationSize({ format: 'I420' }));
    const layouts = yield* Effect.promise(() => sample.copyTo(plane, { format: 'I420' }));
    const luma = Option.fromNullishOr(layouts[0]);
    const stride = Option.match(luma, { onNone: () => sample.codedWidth, onSome: (l) => l.stride });
    const offset = Option.match(luma, { onNone: () => 0, onSome: (l) => l.offset });
    const row = Math.floor(sample.codedHeight / 2);
    const bar = sample.codedWidth / BITS;
    return numberOf(
      Array.from(
        { length: BITS },
        (_, b) => plane[offset + row * stride + Math.floor((b + 0.5) * bar)] ?? 0,
      ),
    );
  });

/** The sample a decode's step gave, if it gave one: none once it is over. */
const sampleIn = (got: IteratorResult<VideoSample, void>): Option.Option<VideoSample> => {
  if (got.done === true) return Option.none();
  return Option.some(got.value);
};

/** The number each frame of the MP4 `bytes` shows, in order, read from its decoded luma. */
export const numbersIn = (bytes: Uint8Array): Effect.Effect<ReadonlyArray<number>> =>
  Effect.gen(function* () {
    yield* registered;
    const input = yield* Effect.acquireRelease(
      Effect.sync(() => new Input({ source: new BufferSource(bytes), formats: ALL_FORMATS })),
      (opened) => Effect.sync(() => opened.dispose()),
    );
    const track = yield* Effect.flatMap(
      Effect.promise(() => input.getPrimaryVideoTrack()),
      (found) => Effect.fromOption(Option.fromNullishOr(found), () => 'the export has no picture'),
    );
    const samples = new VideoSampleSink(track).samples()[Symbol.asyncIterator]();
    const numbers: Array<number> = [];
    let more = true;
    while (more) {
      const got = yield* Effect.promise(() => samples.next());
      more = got.done !== true;
      yield* Option.match(sampleIn(got), {
        onNone: () => Effect.void,
        onSome: (sample) =>
          Effect.map(
            Effect.ensuring(
              numberShown(sample),
              Effect.sync(() => sample.close()),
            ),
            (n) => {
              numbers.push(n);
            },
          ),
      });
    }
    return numbers;
  }).pipe(Effect.scoped, Effect.orDie);
