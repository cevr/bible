// A decoded video frame as a JPEG `width` pixels wide, in-process through
// NodeAV (the FFmpeg @mediabunny/server decodes with): libavfilter scales it
// and moves it to the JPEG's full range, and FFmpeg's MJPEG encoder writes
// it at quality 3. mediabunny has no image encoder, and Bun no canvas.

import { toAvFrame } from '@mediabunny/server';
import { Array as Arr, Effect } from 'effect';
import type { VideoSample } from 'mediabunny';
import * as NodeAv from 'node-av';
import { MediaFailed } from './errors.ts';

/** MJPEG's quantizer scale: 2 is near lossless, 31 the coarsest. */
const JPEG_QUALITY = 3;

/** `sample` (a frame of `file`) scaled to `width`, its height kept in proportion and even, as JPEG bytes. */
export const jpegOf = (file: string, sample: VideoSample, width: number) => {
  const failed = (cause: unknown) =>
    MediaFailed.make({ op: 'encode', file, reason: String(cause) });
  const attempt = <A>(run: () => Promise<A>) => Effect.tryPromise({ try: run, catch: failed });
  return Effect.scoped(
    Effect.gen(function* () {
      const frame = yield* Effect.acquireRelease(
        Effect.sync(() => {
          const made = new NodeAv.Frame();
          made.alloc();
          return made;
        }),
        (made) => Effect.sync(() => made.free()),
      );
      const filter = yield* Effect.acquireRelease(
        Effect.sync(() =>
          NodeAv.FilterAPI.create(`scale=${width}:-2:out_range=full,format=yuvj420p`),
        ),
        (made) => Effect.sync(() => made.close()),
      );
      yield* attempt(() => toAvFrame(sample, frame));
      // Every frame the scaler gives is freed with the scope; the first is the JPEG's.
      const frames = yield* Effect.acquireRelease(
        attempt(() => filter.processAll(frame)),
        (made) => Effect.sync(() => made.forEach((each) => each.free())),
      );
      const scaled = yield* Effect.fromOption(Arr.head(frames)).pipe(
        Effect.mapError(() => failed('the scaler gave no frame')),
      );
      const bytes = yield* attempt(() =>
        NodeAv.Encoder.encodeOne(NodeAv.FF_ENCODER_MJPEG, scaled, {
          // A fixed quantizer scale, which each frame carries (FFmpeg's `-q:v`).
          configure: (context) => {
            context.setFlags(NodeAv.AV_CODEC_FLAG_QSCALE);
            context.globalQuality = JPEG_QUALITY * NodeAv.FF_QP2LAMBDA;
          },
        }),
      );
      return new Uint8Array(bytes);
    }),
  );
};
