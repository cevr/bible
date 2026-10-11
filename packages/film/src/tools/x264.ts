// H.264 in Bun: x264, in-process through NodeAV (the FFmpeg
// @mediabunny/server decodes with), registered as mediabunny's encoder for
// `avc`, so a mediabunny conversion encodes with it. @mediabunny/server's own
// libx264 runs the default preset with no tune and loses the paper's grain
// at any size measured. This one encodes the two copies the tools make, told
// apart by the quality a conversion asks for (all mediabunny hands a
// registered encoder): a quantizer is a render's share copy, a bitrate a
// review's phone copy (`SHARE_X264`, `PHONE_ENCODE`). Both are level 4.1
// (preset slow's reference frames would otherwise raise it to 5.0, which some
// phones refuse). x264 places every key frame by its own interval: NodeAV's
// encoder clears the picture type a frame carries, so the key frames a
// conversion asks for never reach it. Packets leave in Annex B, and
// mediabunny's MP4 muxer writes them as AVC.

import { toAvFrame } from '@mediabunny/server';
import { Array as Arr, Effect, Match, Option, Stream } from 'effect';
import { CustomVideoEncoder, EncodedPacket, type VideoCodec, type VideoSample } from 'mediabunny';
import * as NodeAv from 'node-av';
import { FILM_FPS } from '../core/time.ts';

/**
 * A share copy (a quantizer quality): x264's CRF at that value, preset slow,
 * tune grain, the paper's grain kept, on as many threads as x264 takes.
 */
const SHARE_X264 = {
  preset: 'slow',
  tune: 'grain',
  level: '4.1',
};

/**
 * A phone copy (a bitrate quality), everything it is made with: the review
 * names a copy by all of it (`media.ts` `PHONE_COPY`), so a copy made any
 * other way is never served. At most `height` lines high (a shorter video
 * keeps its size, `Media.phoneCopy`), made in the review's own process in
 * the background on `threads` threads, so the review answers while it
 * encodes: CRF 23 at preset medium, no tune, capped at the rate the
 * conversion asks over `bufferSeconds` of buffer (where the cap binds, x264
 * spreads the bits over every frame: each keeps its own picture, softer);
 * `Media.phoneCopy` asks under `rate` by as much as the buffer could add, so
 * even a short copy averages `rate` at most. A key frame comes every
 * `keyEvery` seconds at the video's own frame rate (its first frame's
 * length), so a seek decodes a second of frames at most: the review's player
 * puts a video that drifts from its clock back on it by a seek
 * (`lab/review/sync.ts`), which must land before the clock has moved on
 * again. `recipe` counts the changes to how the copy is made in code (the
 * size rule, the rate and key-frame sums): a change to any of them bumps it.
 */
export const PHONE_ENCODE = {
  recipe: 1,
  height: 720,
  rate: 8_000_000,
  bufferSeconds: 2,
  keyEvery: 1,
  threads: 2,
  x264: { preset: 'medium', level: '4.1', crf: 23 },
} as const;

/** Microseconds: the time base frames and packets carry. */
const MICROS = 1_000_000;

/** An Annex B stream's first SPS (NAL type 7): its profile, constraints and level bytes. */
const spsBytes = (data: Uint8Array): Option.Option<Uint8Array> =>
  Option.map(
    Arr.findFirst(
      Arr.range(0, Math.max(0, data.length - 8)),
      (i) =>
        data[i] === 0 &&
        data[i + 1] === 0 &&
        data[i + 2] === 1 &&
        ((data[i + 3] ?? 0) & 0x1f) === 7,
    ),
    (i) => data.subarray(i + 4, i + 7),
  );

/** The codec string a decoder is configured with: `avc1.PPCCLL` from the SPS. */
const codecString = (sps: Uint8Array) =>
  `avc1.${Array.from(sps, (b) => b.toString(16).padStart(2, '0')).join('')}`;

/** x264's context and settings for the copy mediabunny's config asks for (above), at `fps` frames a second. */
const settingsOf = (config: VideoEncoderConfig, options: VideoEncoderEncodeOptions, fps: number) =>
  Match.value(config.bitrateMode).pipe(
    Match.when('quantizer', () => ({
      context: {},
      options: Option.match(Option.fromNullishOr(options.avc?.quantizer), {
        onNone: () => SHARE_X264,
        onSome: (crf) => ({ ...SHARE_X264, crf }),
      }),
    })),
    Match.orElse(() => ({
      context: {
        threadCount: PHONE_ENCODE.threads,
        // Never a frame past `keyEvery`: at 29.97 frames a second, every 29.
        gopSize: Math.max(1, Math.floor(fps * PHONE_ENCODE.keyEvery)),
        ...Option.match(Option.fromNullishOr(config.bitrate), {
          onNone: () => ({}),
          onSome: (bitrate) => ({
            rcMaxRate: bitrate,
            rcBufferSize: PHONE_ENCODE.bufferSeconds * bitrate,
          }),
        }),
      },
      options: PHONE_ENCODE.x264,
    })),
  );

export class X264Encoder extends CustomVideoEncoder {
  /** Made on the first frame, which carries the quantizer a CRF comes from. */
  private encoder = Option.none<NodeAv.Encoder>();
  private readonly frame = new NodeAv.Frame();
  /** Whether a packet has carried the decoder's codec string yet. */
  private configured = false;

  static override supports(codec: VideoCodec): boolean {
    return codec === 'avc';
  }

  init(): void {
    this.frame.alloc();
  }

  encode(sample: VideoSample, options: VideoEncoderEncodeOptions): Promise<void> {
    const frame = this.frame;
    const filled = Effect.promise(() => {
      frame.unref();
      return toAvFrame(sample, frame);
    }).pipe(
      Effect.tap(() =>
        Effect.sync(() => {
          frame.pts = BigInt(sample.microsecondTimestamp);
          frame.duration = BigInt(sample.microsecondDuration);
          frame.timeBase = new NodeAv.Rational(1, MICROS);
        }),
      ),
    );
    return Effect.runPromise(
      this.opened(sample, options).pipe(
        Effect.tap(() => filled),
        Effect.flatMap((encoder) => Effect.promise(() => encoder.encodeAll(frame))),
        Effect.map((packets) => this.emit(packets)),
      ),
    );
  }

  flush(): Promise<void> {
    return Effect.runPromise(
      Option.match(this.encoder, {
        onNone: () => Effect.void,
        onSome: (encoder) =>
          Stream.fromAsyncIterable(encoder.flushPackets(), String).pipe(
            Stream.runCollect,
            Effect.orDie,
            Effect.map((rest) => this.emit(rest)),
          ),
      }),
    );
  }

  close(): void {
    Option.map(this.encoder, (encoder) => encoder.close());
    this.frame.free();
  }

  /**
   * The encoder, made on the first frame with the settings its copy asks
   * (`settingsOf`), at the rate the conversion names, else the video's own:
   * one frame in its first frame's length (a conversion that keeps the
   * video's rate names none), else the films' own.
   */
  private opened(
    first: VideoSample,
    options: VideoEncoderEncodeOptions,
  ): Effect.Effect<NodeAv.Encoder> {
    return Option.match(this.encoder, {
      onSome: Effect.succeed,
      onNone: () => {
        const fps = Option.getOrElse(
          Option.orElse(Option.fromNullishOr(this.config.framerate), () =>
            Option.map(
              Option.liftPredicate(first.microsecondDuration, (length) => length > 0),
              (length) => MICROS / length,
            ),
          ),
          () => FILM_FPS,
        );
        const settings = settingsOf(this.config, options, fps);
        return Effect.promise(() =>
          // The time base comes with each frame (`encode`), in microseconds.
          NodeAv.Encoder.create(NodeAv.FF_ENCODER_LIBX264, {
            context: {
              ...settings.context,
              framerate: new NodeAv.Rational(Math.round(fps * 1000), 1000),
            },
            options: settings.options,
          }),
        ).pipe(Effect.tap((made) => Effect.sync(() => (this.encoder = Option.some(made)))));
      },
    });
  }

  /** Packets to mediabunny, in decode order; the first with an SPS carries the decoder's codec string. */
  private emit(packets: Iterable<NodeAv.Packet>): void {
    for (const packet of packets) {
      Option.map(Option.fromNullishOr(packet.data), (data) =>
        this.send(packet, new Uint8Array(data)),
      );
      packet.free();
    }
  }

  private send(packet: NodeAv.Packet, bytes: Uint8Array): void {
    const encoded = new EncodedPacket(
      bytes,
      Match.value((packet.flags & NodeAv.AV_PKT_FLAG_KEY) !== 0).pipe(
        Match.when(true, () => 'key' as const),
        Match.orElse(() => 'delta' as const),
      ),
      Number(packet.pts) / MICROS,
      Number(packet.duration) / MICROS,
    );
    Option.match(
      Option.filter(spsBytes(bytes), () => !this.configured),
      {
        onNone: () => this.onPacket(encoded),
        onSome: (sps) => {
          this.configured = true;
          this.onPacket(encoded, {
            decoderConfig: {
              codec: codecString(sps),
              codedWidth: this.config.width,
              codedHeight: this.config.height,
            },
          });
        },
      },
    );
  }
}
