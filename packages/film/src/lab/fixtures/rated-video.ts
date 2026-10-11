// A real video at a frame rate of its own, made with mediabunny: the
// fifteen H.264 frames of `tools/fixtures/segment-a.mp4` (30 fps, encoded in
// headless Chromium as a render encodes a chunk) laid `fps` a second, over
// and over for as many frames as asked, re-muxed as they are (no frame is
// encoded again), as an MP4 that starts fast. A review's clock steps such a
// video by its own frames.

import { Array as Arr, Effect, Option, Stream } from 'effect';
import {
  ALL_FORMATS,
  BufferTarget,
  EncodedPacketSink,
  EncodedVideoPacketSource,
  FilePathSource,
  Input,
  Mp4OutputFormat,
  Output,
} from 'mediabunny';

/** The frames a second the segment was encoded at. */
const SEGMENT_FPS = 30;

const SEGMENT = new URL('../../tools/fixtures/segment-a.mp4', import.meta.url).pathname;

/** `value`, or the fixture dies saying what it lacked. */
const present = <A>(what: string, value: A) =>
  Option.match(Option.fromNullishOr(value), {
    onNone: () => Effect.die(`the segment has no ${what}`),
    onSome: Effect.succeed,
  });

/**
 * `frames` of the segment's frames, laid over and over, at `fps` a second:
 * `frames / fps` seconds, its timestamps whole ticks of `1 / timescale` s
 * (the rate's own by default; 1000 is a millisecond timescale, as a WebM's
 * or a re-mux's).
 */
export const ratedVideo = (fps: number, frames: number, timescale: number = fps) =>
  Effect.scoped(
    Effect.gen(function* () {
      const input = yield* Effect.acquireRelease(
        Effect.sync(() => new Input({ source: new FilePathSource(SEGMENT), formats: ALL_FORMATS })),
        (opened) => Effect.sync(() => opened.dispose()),
      );
      const track = yield* present(
        'video track',
        yield* Effect.promise(() => input.getPrimaryVideoTrack()),
      );
      const decoderConfig = yield* present(
        'decoder config',
        yield* Effect.promise(() => track.getDecoderConfig()),
      );
      const packets = yield* Stream.runCollect(
        Stream.fromAsyncIterable(new EncodedPacketSink(track).packets(), String),
      ).pipe(Effect.orDie);
      const target = new BufferTarget();
      const output = new Output({
        format: new Mp4OutputFormat({ fastStart: 'in-memory' }),
        target,
      });
      const source = new EncodedVideoPacketSource('avc');
      // The track's timestamps snap to whole ticks of `1 / timescale`.
      output.addVideoTrack(source, { frameRate: timescale });
      yield* Effect.promise(() => output.start());
      const laid = Arr.flatMap(Arr.range(0, Math.ceil(frames / packets.length) - 1), (pass) =>
        packets.map((packet) => {
          const frame = pass * packets.length + Math.round(packet.timestamp * SEGMENT_FPS);
          return packet.clone({ timestamp: frame / fps, duration: 1 / fps });
        }),
      ).slice(0, frames);
      // The first packet carries the track's config.
      for (const [i, packet] of laid.entries())
        yield* Effect.promise(() =>
          source.add(
            packet,
            Option.getOrUndefined(
              Option.some({ decoderConfig }).pipe(Option.filter(() => i === 0)),
            ),
          ),
        );
      yield* Effect.promise(() => output.finalize());
      return new Uint8Array(yield* present('written bytes', target.buffer));
    }),
  );
