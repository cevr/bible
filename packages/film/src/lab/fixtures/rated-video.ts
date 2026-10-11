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

/** How a rated video's frames are timed in its file. */
export interface RatedTiming {
  /** Ticks a second of the track's timescale: the rate's own by default (1000 is a millisecond one). */
  readonly timescale?: number;
  /**
   * A coarser clock each frame's time is first truncated to (s), as a
   * millisecond clock's times (a WebM's) are kept on a finer timescale by a
   * stream copy into an MP4 (16000 is FFmpeg's for a 1/1000 time base).
   */
  readonly grid?: number;
  /** The last frame's own duration (s), as a whole clip's is written apart; a frame's by default. */
  readonly last?: number;
  /**
   * Frames left out, their places kept empty, as a capture drops frames under
   * load: a file for its timing only, since a dropped frame's pictures after
   * it (or all, with frame 0, the one key frame) no longer decode.
   */
  readonly drop?: ReadonlyArray<number>;
}

/**
 * `frames` of the segment's frames, laid over and over, at `fps` a second:
 * `frames / fps` seconds, timed as `timing` says (`RatedTiming`).
 */
export const ratedVideo = (
  fps: number,
  frames: number,
  { timescale = fps, grid, last, drop = [] }: RatedTiming = {},
) =>
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
      /** Frame `frame`'s time: on the coarser clock, when there is one, truncated. */
      const at = (frame: number) =>
        Option.match(Option.fromUndefinedOr(grid), {
          onNone: () => frame / fps,
          onSome: (step) => Math.floor(frame / fps / step + 1e-9) * step,
        });
      const laid = Arr.flatMap(Arr.range(0, Math.ceil(frames / packets.length) - 1), (pass) =>
        packets.map((packet) => {
          const frame = pass * packets.length + Math.round(packet.timestamp * SEGMENT_FPS);
          const duration = Option.getOrElse(
            Option.filter(Option.fromUndefinedOr(last), () => frame === frames - 1),
            () => at(frame + 1) - at(frame),
          );
          return { frame, packet: packet.clone({ timestamp: at(frame), duration }) };
        }),
      )
        .slice(0, frames)
        .filter(({ frame }) => !drop.includes(frame))
        .map(({ packet }) => packet);
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
