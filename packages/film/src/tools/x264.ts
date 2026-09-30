// H.264 in Bun: x264, in-process through NodeAV (the FFmpeg
// @mediabunny/server decodes with), registered as mediabunny's encoder for
// `avc`, so a mediabunny conversion encodes with it. @mediabunny/server's own
// libx264 runs the default preset with no tune and loses the paper's grain
// at any size measured; this one runs preset slow, tune grain, level 4.1
// (preset slow's reference frames would otherwise raise it to 5.0, which some
// phones refuse). A quantizer quality is x264's CRF at that value; a bitrate
// is its average, capped at that rate over two seconds of buffer. Packets
// leave in Annex B, and mediabunny's MP4 muxer writes them as AVC.

import { toAvFrame } from '@mediabunny/server';
import { Array as Arr, Effect, Match, Option, Stream } from 'effect';
import { CustomVideoEncoder, EncodedPacket, type VideoCodec, type VideoSample } from 'mediabunny';
import * as NodeAv from 'node-av';

/** x264's settings for every encode: the grain kept, playable on every phone. */
const X264_SETTINGS = {
  preset: 'slow',
  tune: 'grain',
  level: '4.1',
};

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

/** x264's rate control for mediabunny's config: a CRF for a quantizer, else a capped average. */
const rateOf = (config: VideoEncoderConfig, options: VideoEncoderEncodeOptions) =>
  Match.value(config.bitrateMode).pipe(
    Match.when('quantizer', () => ({
      context: {},
      crf: Option.fromNullishOr(options.avc?.quantizer),
    })),
    Match.orElse(() => ({
      context: Option.match(Option.fromNullishOr(config.bitrate), {
        onNone: () => ({}),
        onSome: (bitrate) => ({ bitRate: bitrate, rcMaxRate: bitrate, rcBufferSize: 2 * bitrate }),
      }),
      crf: Option.none<number>(),
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
          frame.pictType = Match.value(options.keyFrame === true).pipe(
            Match.when(true, () => NodeAv.AV_PICTURE_TYPE_I),
            Match.orElse(() => NodeAv.AV_PICTURE_TYPE_NONE),
          );
        }),
      ),
    );
    return Effect.runPromise(
      this.opened(options).pipe(
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

  /** The encoder, made on the first frame at the rate its options ask. */
  private opened(options: VideoEncoderEncodeOptions): Effect.Effect<NodeAv.Encoder> {
    return Option.match(this.encoder, {
      onSome: Effect.succeed,
      onNone: () => {
        const rate = rateOf(this.config, options);
        const fps = Math.round(
          Option.getOrElse(Option.fromNullishOr(this.config.framerate), () => 30),
        );
        return Effect.promise(() =>
          // The time base comes with each frame (`encode`), in microseconds.
          NodeAv.Encoder.create(NodeAv.FF_ENCODER_LIBX264, {
            context: { ...rate.context, framerate: new NodeAv.Rational(fps, 1) },
            options: {
              ...X264_SETTINGS,
              ...Option.match(rate.crf, { onNone: () => ({}), onSome: (crf) => ({ crf }) }),
            },
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
