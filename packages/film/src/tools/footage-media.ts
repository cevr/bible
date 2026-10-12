// The footage library's media work in Bun (`footage.ts`): an original probed
// in place, its copies made, and a take's voice decoded, all with mediabunny
// over the coders the media service registers (`Media.layer`: H.264 out
// through x264, HEVC and AAC in through @mediabunny/server's FFmpeg).
//
// One clock for all of it. An original's picture starts when its first frame
// shows (`picture.start`, often not zero in a phone's file, and its sound
// may start before it, an AAC encoder's priming, or after it): every copy is
// made from that frame on, stamped from zero, and the voice is laid on the
// same zero, each block of its sound at its own time. So a frame of the
// mezzanine and the voice at that frame's time are one moment of the
// recording, whatever rate the camera ran at (`av-sync.test.ts`).
//
// A copy is made frame by frame (a `VideoSampleSink` into a
// `VideoSampleSource`), not by a `Conversion`, because its content hint must
// reach x264 (`FOOTAGE_HINTS`), which a conversion does not pass on; the
// source's transform makes it constant-rate at its recipe's rate, bakes in
// the original's rotation and sizes it to its recipe's long side, never
// larger than the original. A copy is written whole: beside its file, then
// renamed over it.

import { Context, Effect, FileSystem, Layer, Option, Path, Stream } from 'effect';
import type { Scope } from 'effect';
import {
  ALL_FORMATS,
  AudioSampleSink,
  FilePathSource,
  FilePathTarget,
  Input,
  type InputAudioTrack,
  type InputVideoTrack,
  Mp4OutputFormat,
  Output,
  Quality,
  VideoSampleSink,
  VideoSampleSource,
} from 'mediabunny';
import { type Pcm, toMono } from '../core/audio.ts';
import {
  FOOTAGE_HINTS,
  FOOTAGE_RECIPES,
  type FootageCopy,
  type FootagePicture,
  type FootageProbe,
} from '../core/footage.ts';
import { MediaFailed } from '../core/refusals.ts';
import { writeWhole } from './content-store.ts';
import { Media } from './media.ts';
import { resample } from './resample.ts';

/** What the probe found: what the lock records, and whether the picture is HDR (which import refuses). */
interface FootageProbed {
  readonly probe: FootageProbe;
  readonly hdr: boolean;
}

interface FootageMediaService {
  /** The original at `file`, read in place: its container, picture and sound. */
  readonly probe: (file: string) => Effect.Effect<FootageProbed, MediaFailed>;
  /** The original at `file`'s `copy`, made by its recipe (`FOOTAGE_RECIPES`) and written whole to `out`. */
  readonly copy: (
    file: string,
    picture: FootagePicture,
    copy: FootageCopy,
    out: string,
  ) => Effect.Effect<void, MediaFailed>;
  /** The original at `file`'s sound as one channel at `rate`, on its picture's clock (above). */
  readonly voice: (
    file: string,
    picture: FootagePicture,
    rate: number,
  ) => Effect.Effect<Pcm, MediaFailed>;
}

/** A promise mediabunny made, failing as `op` on `file`. */
const attempt = <A>(op: MediaFailed['op'], file: string, run: () => Promise<A>) =>
  Effect.tryPromise({
    try: run,
    catch: (cause) => MediaFailed.make({ op, file, reason: String(cause) }),
  });

/** `value`, or `op` on `file` failed for want of `what`. */
const present = <A>(op: MediaFailed['op'], file: string, what: string, value: A) =>
  Effect.fromOption(Option.fromNullishOr(value), () =>
    MediaFailed.make({ op, file, reason: `no ${what}` }),
  );

/** `file` opened in place, until the scope closes. */
const opened = (file: string): Effect.Effect<Input, never, Scope.Scope> =>
  Effect.acquireRelease(
    Effect.sync(() => new Input({ source: new FilePathSource(file), formats: ALL_FORMATS })),
    (input) => Effect.sync(() => input.dispose()),
  );

/** `file`'s picture, or why it has none. */
const pictureOf = (file: string, input: Input) =>
  Effect.flatMap(
    attempt('read', file, () => input.getPrimaryVideoTrack()),
    (track) => present('read', file, 'picture in it', track),
  );

/** `file`'s sound, if it has any. */
const soundOf = (file: string, input: Input) =>
  Effect.map(
    attempt('read', file, () => input.getPrimaryAudioTrack()),
    (track) => Option.fromNullishOr(track),
  );

/**
 * Where each copy's index goes: the proxy streams to a phone, so at its head;
 * the mezzanine is read whole by the render, and too big to hold in memory
 * to put it there.
 */
const FAST_START = { mezzanine: false, proxy: 'in-memory' } as const;

/** A size rounded to an even number of pixels, as H.264's 4:2:0 asks. */
const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);

/** A copy's size: the original's, or brought down to `long` on its long side. */
const sizeFor = (picture: FootagePicture, long: Option.Option<number>) =>
  Option.match(
    Option.filter(long, (side) => side < Math.max(picture.width, picture.height)),
    {
      onNone: () => ({ width: even(picture.width), height: even(picture.height) }),
      onSome: (side) => {
        const scale = side / Math.max(picture.width, picture.height);
        return { width: even(picture.width * scale), height: even(picture.height * scale) };
      },
    },
  );

/** `track`'s probe: its codec, displayed size, rotation, rate and where it starts. */
const probePicture = (file: string, track: InputVideoTrack) =>
  Effect.gen(function* () {
    const codec = yield* attempt('read', file, () => track.getCodec());
    const rate = yield* attempt('read', file, () => track.computeFrameRateMetrics());
    const picture: FootagePicture = {
      codec: Option.getOrElse(Option.fromNullishOr(codec), () => 'unknown'),
      width: yield* attempt('read', file, () => track.getDisplayWidth()),
      height: yield* attempt('read', file, () => track.getDisplayHeight()),
      rotation: yield* attempt('read', file, () => track.getRotation()),
      fps: rate.bestGuessFrameRate,
      variable: Option.isNone(Option.fromNullishOr(rate.underlyingFrameRate)),
      start: yield* attempt('read', file, () => track.getFirstTimestamp()),
    };
    return picture;
  });

/** `track`'s probe: its codec, rate and channels. */
const probeSound = (file: string, track: InputAudioTrack) =>
  Effect.gen(function* () {
    const codec = yield* attempt('read', file, () => track.getCodec());
    return {
      codec: Option.getOrElse(Option.fromNullishOr(codec), () => 'unknown'),
      rate: yield* attempt('read', file, () => track.getSampleRate()),
      channels: yield* attempt('read', file, () => track.getNumberOfChannels()),
    };
  });

/** Blocks of sound, each at its frame on the voice's clock, laid into one channel of `frames` frames. */
const laid = (
  rate: number,
  blocks: ReadonlyArray<{ readonly at: number; readonly pcm: Pcm }>,
): Pcm => {
  const frames = blocks.reduce((end, block) => Math.max(end, block.at + block.pcm.frames), 0);
  const out = new Float32Array(Math.max(0, frames));
  for (const block of blocks) {
    // A block before the picture's first frame keeps only what plays after it.
    const skip = Math.max(0, -block.at);
    for (const mono of toMono(block.pcm).channels)
      out.set(mono.subarray(skip), Math.max(0, block.at));
  }
  return { rate, frames: out.length, channels: [out] };
};

export class FootageMedia extends Context.Service<FootageMedia, FootageMediaService>()(
  '@bible/film/tools/FootageMedia',
) {
  /** Over the media service's coders, and the files on disk. */
  static readonly layer = Layer.effect(
    FootageMedia,
    Effect.gen(function* () {
      // Built for its coders: mediabunny's in Bun, registered as it is built.
      yield* Media;
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;

      const probe = Effect.fn('FootageMedia.probe')(function* (file: string) {
        return yield* Effect.scoped(
          Effect.gen(function* () {
            const input = yield* opened(file);
            const format = yield* attempt('read', file, () => input.getFormat());
            const video = yield* pictureOf(file, input);
            const sound = yield* soundOf(file, input);
            const heard = yield* Option.match(sound, {
              onNone: () => Effect.succeed({}),
              onSome: (track) => Effect.map(probeSound(file, track), (found) => ({ sound: found })),
            });
            const probed: FootageProbed = {
              probe: {
                container: format.name,
                duration: yield* attempt('read', file, () => input.computeDuration()),
                picture: yield* probePicture(file, video),
                ...heard,
              },
              hdr: yield* attempt('read', file, () => video.hasHighDynamicRange()),
            };
            return probed;
          }),
        );
      });

      /** The copy written to `partial`, frame by frame. */
      const copyInto = (
        file: string,
        picture: FootagePicture,
        copy: FootageCopy,
        partial: string,
      ) =>
        Effect.scoped(
          Effect.gen(function* () {
            const recipe = FOOTAGE_RECIPES[copy];
            const input = yield* opened(file);
            const video = yield* pictureOf(file, input);
            const output = new Output({
              format: new Mp4OutputFormat({ fastStart: FAST_START[copy] }),
              target: new FilePathTarget(partial),
            });
            const source = new VideoSampleSource({
              codec: 'avc',
              quality: new Quality({ quantizer: recipe.crf }),
              keyFrameInterval: recipe.keyEvery,
              contentHint: FOOTAGE_HINTS[copy],
              transform: {
                ...sizeFor(picture, recipe.longSide),
                fit: 'fill',
                frameRate: recipe.fps,
                // The original's rotation baked into the pixels, so every reader sees it upright.
                force: true,
              },
            });
            output.addVideoTrack(source, { frameRate: recipe.fps });
            yield* Effect.gen(function* () {
              yield* attempt('encode', file, () => output.start());
              yield* Stream.fromAsyncIterable(
                new VideoSampleSink(video).samples(picture.start),
                (cause) => MediaFailed.make({ op: 'decode', file, reason: String(cause) }),
              ).pipe(
                Stream.runForEach((sample) =>
                  Effect.ensuring(
                    Effect.suspend(() => {
                      // On the copy's clock: its first frame at zero.
                      sample.setTimestamp(Math.max(0, sample.timestamp - picture.start));
                      return attempt('encode', file, () => source.add(sample));
                    }),
                    Effect.sync(() => sample.close()),
                  ),
                ),
              );
              yield* attempt('encode', file, () => output.finalize());
            }).pipe(
              Effect.onError(() => Effect.ignore(attempt('encode', file, () => output.cancel()))),
            );
          }),
        );

      const copy = Effect.fn('FootageMedia.copy')(function* (
        file: string,
        picture: FootagePicture,
        which: FootageCopy,
        out: string,
      ) {
        yield* fs
          .makeDirectory(path.dirname(out), { recursive: true })
          .pipe(
            Effect.mapError((e) => MediaFailed.make({ op: 'write', file: out, reason: e.message })),
          );
        yield* writeWhole(fs, out, (partial) => copyInto(file, picture, which, partial)).pipe(
          Effect.mapError((error) =>
            Option.match(
              Option.liftPredicate(error, (e) => e._tag === 'MediaFailed'),
              {
                onSome: (failed) => failed,
                onNone: () => MediaFailed.make({ op: 'write', file: out, reason: error.message }),
              },
            ),
          ),
        );
      });

      const voice = Effect.fn('FootageMedia.voice')(function* (
        file: string,
        picture: FootagePicture,
        rate: number,
      ) {
        const blocks = yield* Effect.scoped(
          Effect.gen(function* () {
            const input = yield* opened(file);
            const track = yield* Effect.flatMap(soundOf(file, input), (found) =>
              Effect.fromOption(found, () =>
                MediaFailed.make({ op: 'decode', file, reason: 'no sound in it' }),
              ),
            );
            const own = yield* attempt('decode', file, () => track.getSampleRate());
            return yield* Stream.fromAsyncIterable(new AudioSampleSink(track).samples(), (cause) =>
              MediaFailed.make({ op: 'decode', file, reason: String(cause) }),
            ).pipe(
              Stream.map((sample) => {
                const channels = Array.from(
                  { length: sample.numberOfChannels },
                  (_, planeIndex) => {
                    const plane = new Float32Array(sample.numberOfFrames);
                    sample.copyTo(plane, { planeIndex, format: 'f32-planar' });
                    return plane;
                  },
                );
                // Each block at its own time on the picture's clock: a gap stays a gap, priming falls before zero.
                const at = Math.round((sample.timestamp - picture.start) * own);
                const block = { at, pcm: { rate: own, frames: sample.numberOfFrames, channels } };
                sample.close();
                return block;
              }),
              Stream.runCollect,
              Effect.map((collected) => laid(own, collected)),
            );
          }),
        );
        if (blocks.rate === rate) return blocks;
        return yield* resample(file, blocks, rate, 1);
      });

      return FootageMedia.of({ probe, copy, voice });
    }),
  );
}
