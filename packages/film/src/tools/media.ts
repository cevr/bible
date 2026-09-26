// Media files, in-process: how long a file plays, a sound decoded to PCM, PCM
// written out as WAV, and a film joined from its video segments with its
// track. mediabunny reads and writes the containers (pure TypeScript); MP3
// decodes through mpg123 (WASM), gapless, sample for sample as ffmpeg decoded
// it; AAC encodes through ffmpeg's encoder built to WASM
// (@mediabunny/aac-encoder). Every byte moves through the FileSystem service.
// H.264 is a browser's codec: a page encodes it (player/encode.ts), and
// joining only copies its packets.

import { registerAacEncoder } from '@mediabunny/aac-encoder';
import { Array as Arr, Context, Effect, FileSystem, Layer, Option, Stream } from 'effect';
import {
  ALL_FORMATS,
  AudioSample,
  AudioSampleSink,
  AudioSampleSource,
  BufferSource,
  BufferTarget,
  EncodedPacketSink,
  EncodedVideoPacketSource,
  Input,
  type InputAudioTrack,
  MP3,
  Mp4OutputFormat,
  Output,
  StreamTarget,
  type StreamTargetChunk,
  WavOutputFormat,
} from 'mediabunny';
import { MPEGDecoder } from 'mpg123-decoder';
import { type Pcm, concat, toInt16 } from '../core/audio.ts';
import { MediaFailed } from './errors.ts';

export interface MediaService {
  /**
   * How long `file` plays, in seconds: an MP3 as decoded (its encoder
   * padding trimmed), anything else by its container.
   */
  readonly duration: (file: string) => Effect.Effect<number, MediaFailed>;
  /** `file`'s first audio track (MP3, WAV) decoded to planar PCM at its own rate. */
  readonly decode: (file: string) => Effect.Effect<Pcm, MediaFailed>;
  /** `pcm` written to `file` as a 16-bit WAV. */
  readonly writeWav: (file: string, pcm: Pcm) => Effect.Effect<void, MediaFailed>;
  /**
   * The film as one MP4 at `out`: each segment's H.264 packets copied, not
   * re-encoded, at its place; and the track, if any, encoded to AAC beside
   * them. Every segment must be encoded alike.
   */
  readonly join: (film: JoinedFilm) => Effect.Effect<void, MediaFailed>;
}

/** A run of H.264 video in its own MP4, played from `at` seconds into the film. */
export interface Segment {
  readonly file: string;
  readonly at: number;
}

/** What `join` writes. */
export interface JoinedFilm {
  readonly out: string;
  /** In order, each starting where the one before it ends. */
  readonly segments: ReadonlyArray<Segment>;
  /** Frames across every segment: the index at the head of the file is sized by it. */
  readonly frames: number;
  /** The track under the film, from its first frame. */
  readonly audio: Option.Option<Pcm>;
}

/** Sound is written this many frames at a time. */
const WRITE_BLOCK = 65536;

/** The film's track, as AAC: the rate the old ffmpeg mux used. */
const AAC_BITRATE = 192_000;
/** An AAC packet carries this many frames. */
const AAC_FRAME = 1024;
/**
 * The AAC encoder delays its output by one frame of priming yet stamps its
 * first packet 0, so the track would play 23 ms late. Its samples go in that
 * much early instead; the MP4's edit list skips the priming.
 */
const AAC_PRIMING = 1024;

/** A file read and opened: its bytes, mediabunny's view of them, and whether it is an MP3. */
interface Opened {
  readonly file: string;
  readonly bytes: Uint8Array;
  readonly input: Input;
  readonly mp3: boolean;
}

/** A promise from mediabunny or mpg123, failing as `op` on `file`. */
const attempt = <A>(op: MediaFailed['op'], file: string, run: () => Promise<A>) =>
  Effect.tryPromise({
    try: run,
    catch: (cause) => MediaFailed.make({ op, file, reason: String(cause) }),
  });

/** A call that may throw, failing as `op` on `file`. */
const attemptSync = <A>(op: MediaFailed['op'], file: string, run: () => A) =>
  Effect.try({
    try: run,
    catch: (cause) => MediaFailed.make({ op, file, reason: String(cause) }),
  });

const audioTrack = (opened: Opened) =>
  Effect.flatMap(
    attempt('decode', opened.file, () => opened.input.getPrimaryAudioTrack()),
    (track) =>
      Option.match(Option.fromNullishOr(track), {
        onNone: () =>
          Effect.fail(
            MediaFailed.make({ op: 'decode', file: opened.file, reason: 'no audio track' }),
          ),
        onSome: Effect.succeed,
      }),
  );

/**
 * An MP3, decoded whole by mpg123 so its encoder delay and padding come off
 * (gapless). mpg123 always hands back two channels; the track says how many
 * are real.
 */
const decodeMp3 = (opened: Opened, track: InputAudioTrack) =>
  Effect.acquireUseRelease(
    Effect.sync(() => new MPEGDecoder()),
    (decoder) =>
      Effect.gen(function* () {
        yield* attempt('decode', opened.file, () => decoder.ready);
        const out = yield* attemptSync('decode', opened.file, () => decoder.decode(opened.bytes));
        const broken = Arr.head(out.errors);
        if (Option.isSome(broken))
          return yield* MediaFailed.make({
            op: 'decode',
            file: opened.file,
            reason: broken.value.message,
          });
        const pcm: Pcm = {
          rate: out.sampleRate,
          frames: out.samplesDecoded,
          channels: out.channelData
            .slice(0, track.numberOfChannels)
            .map((channel) => channel.subarray(0, out.samplesDecoded)),
        };
        return pcm;
      }),
    (decoder) => Effect.sync(() => decoder.free()),
  );

/** One block of samples as planar PCM; the block is closed once copied. */
const planar = (file: string, track: InputAudioTrack, sample: AudioSample) =>
  attemptSync('decode', file, (): Pcm => ({
    rate: sample.sampleRate,
    frames: sample.numberOfFrames,
    channels: Array.from({ length: track.numberOfChannels }, (_, planeIndex) => {
      const plane = new Float32Array(sample.numberOfFrames);
      sample.copyTo(plane, { planeIndex, format: 'f32-planar' });
      return plane;
    }),
  })).pipe(Effect.ensuring(Effect.sync(() => sample.close())));

/** Any other sound mediabunny decodes itself (PCM in a WAV), block by block. */
const decodeSamples = (opened: Opened, track: InputAudioTrack) =>
  Stream.fromAsyncIterable(new AudioSampleSink(track).samples(), (cause) =>
    MediaFailed.make({ op: 'decode', file: opened.file, reason: String(cause) }),
  ).pipe(
    Stream.mapEffect((sample) => planar(opened.file, track, sample)),
    Stream.runFold(
      (): Array<Pcm> => [],
      (blocks, block) => {
        blocks.push(block);
        return blocks;
      },
    ),
    Effect.map((blocks) => concat(track.sampleRate, track.numberOfChannels, blocks)),
  );

const decodeOpened = (opened: Opened) =>
  Effect.gen(function* () {
    const track = yield* audioTrack(opened);
    if (opened.mp3) return yield* decodeMp3(opened, track);
    return yield* decodeSamples(opened, track);
  });

/** `pcm`'s frames `[from, from + frames)` as one sample, `at` seconds in. */
const block = (pcm: Pcm, from: number, frames: number, at: number) => {
  const data = new Float32Array(frames * pcm.channels.length);
  for (const [c, plane] of pcm.channels.entries())
    data.set(plane.subarray(from, from + frames), c * frames);
  return new AudioSample({
    data,
    format: 'f32-planar',
    numberOfChannels: pcm.channels.length,
    sampleRate: pcm.rate,
    timestamp: at,
  });
};

/** An H.264 description (its SPS and PPS) as hex. */
const hex = (description: AllowSharedBufferSource) => {
  if (ArrayBuffer.isView(description))
    return new Uint8Array(
      description.buffer,
      description.byteOffset,
      description.byteLength,
    ).toHex();
  return new Uint8Array(description).toHex();
};

/** What must agree between segments for their packets to play on in one track. */
const configKey = (config: VideoDecoderConfig) =>
  [
    config.codec,
    `${config.codedWidth}x${config.codedHeight}`,
    Option.match(Option.fromNullishOr(config.description), { onNone: () => '', onSome: hex }),
  ].join(' ');

/** `value`, or a failed join of `file` for want of `what`. */
const present = <A>(file: string, what: string, value: A) =>
  Option.match(Option.fromNullishOr(value), {
    onNone: () => Effect.fail(MediaFailed.make({ op: 'join', file, reason: `no ${what}` })),
    onSome: (found) => Effect.succeed(found),
  });

/**
 * `film` written to its file through `fs`, which stays open while the scope
 * does. mediabunny writes the index into the space reserved at the head
 * (fast start) once the last packet is in, so the file is written by position.
 */
const joinInto = (fs: FileSystem.FileSystem, film: JoinedFilm) =>
  Effect.gen(function* () {
    const { out } = film;
    const file = yield* fs
      .open(out, { flag: 'w' })
      .pipe(
        Effect.mapError((error) =>
          MediaFailed.make({ op: 'write', file: out, reason: error.message }),
        ),
      );
    const run = Effect.runPromiseWith(yield* Effect.context<never>());
    const target = new StreamTarget(
      new WritableStream<StreamTargetChunk>({
        write: (chunk) =>
          run(
            file
              .seek(BigInt(chunk.position), 'start')
              .pipe(Effect.andThen(file.writeAll(chunk.data))),
          ),
      }),
      { chunked: true },
    );
    const output = new Output({ format: new Mp4OutputFormat({ fastStart: 'reserve' }), target });
    const video = new EncodedVideoPacketSource('avc');
    output.addVideoTrack(video, { maximumPacketCount: film.frames });
    const audio = Option.map(film.audio, (pcm) => {
      const source = new AudioSampleSource({ codec: 'aac', bitrate: AAC_BITRATE });
      output.addAudioTrack(source, {
        maximumPacketCount: Math.ceil((pcm.frames + AAC_PRIMING) / AAC_FRAME) + 1,
      });
      return { pcm, source, written: 0 };
    });

    /** The track up to `until` seconds, so video and audio reach the file side by side. */
    const soundTo = (until: number) =>
      Option.match(audio, {
        onNone: () => Effect.void,
        onSome: (track) =>
          Effect.gen(function* () {
            const end = Math.min(track.pcm.frames, Math.round(until * track.pcm.rate));
            while (track.written < end) {
              const frames = Math.min(WRITE_BLOCK, end - track.written);
              const at = (track.written - AAC_PRIMING) / track.pcm.rate;
              yield* Effect.acquireUseRelease(
                attemptSync('write', out, () => block(track.pcm, track.written, frames, at)),
                (sample) => attempt('write', out, () => track.source.add(sample)),
                (sample) => Effect.sync(() => sample.close()),
              );
              track.written += frames;
            }
          }),
      });

    /** One segment's packets, moved to its place; its end, in seconds. */
    const copy = (segment: Segment, first: Option.Option<string>) =>
      Effect.scoped(
        Effect.gen(function* () {
          const bytes = yield* fs
            .readFile(segment.file)
            .pipe(
              Effect.mapError((error) =>
                MediaFailed.make({ op: 'read', file: segment.file, reason: error.message }),
              ),
            );
          const input = yield* Effect.acquireRelease(
            Effect.sync(() => new Input({ source: new BufferSource(bytes), formats: ALL_FORMATS })),
            (opened) => Effect.sync(() => opened.dispose()),
          );
          const track = yield* present(
            segment.file,
            'video track',
            yield* attempt('join', segment.file, () => input.getPrimaryVideoTrack()),
          );
          const config = yield* present(
            segment.file,
            'decoder config',
            yield* attempt('join', segment.file, () => track.getDecoderConfig()),
          );
          const key = configKey(config);
          if (Option.isSome(first) && first.value !== key)
            return yield* MediaFailed.make({
              op: 'join',
              file: segment.file,
              reason: `encoded unlike the first segment (${key} vs ${first.value})`,
            });
          let end = segment.at;
          let meta = Option.filter(Option.some({ decoderConfig: config }), () =>
            Option.isNone(first),
          );
          const packets = Stream.fromAsyncIterable(
            new EncodedPacketSink(track).packets(),
            (cause) => MediaFailed.make({ op: 'join', file: segment.file, reason: String(cause) }),
          );
          yield* Stream.runForEach(packets, (packet) =>
            Effect.gen(function* () {
              const moved = packet.clone({ timestamp: packet.timestamp + segment.at });
              yield* attempt('write', out, () => video.add(moved, Option.getOrUndefined(meta)));
              meta = Option.none();
              end = Math.max(end, moved.timestamp + moved.duration);
            }),
          );
          return { end, key };
        }),
      );

    yield* Effect.gen(function* () {
      yield* attempt('write', out, () => output.start());
      let first = Option.none<string>();
      for (const segment of film.segments) {
        const copied = yield* copy(segment, first);
        first = Option.some(copied.key);
        yield* soundTo(copied.end);
      }
      yield* soundTo(Infinity);
      yield* attempt('write', out, () => output.finalize());
    }).pipe(Effect.onError(() => Effect.ignore(attempt('write', out, () => output.cancel()))));
  });

export class Media extends Context.Service<Media, MediaService>()('@bible/film/tools/Media') {
  static readonly layer = Layer.effect(
    Media,
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      // Bun has no AAC of its own; this one is mediabunny's to use from here on.
      // Its worker is patched (patches/): under Bun it listened on `self`,
      // where no message ever arrives, and hung.
      yield* Effect.sync(registerAacEncoder);

      /** `file` read and open until the scope closes. */
      const open = (file: string) =>
        Effect.gen(function* () {
          const bytes = yield* fs
            .readFile(file)
            .pipe(
              Effect.mapError((error) =>
                MediaFailed.make({ op: 'read', file, reason: error.message }),
              ),
            );
          const input = yield* Effect.acquireRelease(
            Effect.sync(() => new Input({ source: new BufferSource(bytes), formats: ALL_FORMATS })),
            (opened) => Effect.sync(() => opened.dispose()),
          );
          const format = yield* attempt('read', file, () => input.getFormat());
          const opened: Opened = { file, bytes, input, mp3: format === MP3 };
          return opened;
        });

      const duration = Effect.fn('Media.duration')(function* (file: string) {
        return yield* Effect.scoped(
          Effect.gen(function* () {
            const opened = yield* open(file);
            if (!opened.mp3)
              return yield* attempt('read', file, () => opened.input.computeDuration());
            const pcm = yield* decodeOpened(opened);
            return pcm.frames / pcm.rate;
          }),
        );
      });

      const decode = Effect.fn('Media.decode')(function* (file: string) {
        return yield* Effect.scoped(Effect.flatMap(open(file), decodeOpened));
      });

      const writeWav = Effect.fn('Media.writeWav')(function* (file: string, pcm: Pcm) {
        const channels = pcm.channels.length;
        const samples = toInt16(pcm);
        const target = new BufferTarget();
        const output = new Output({ format: new WavOutputFormat(), target });
        const source = new AudioSampleSource({ codec: 'pcm-s16' });
        output.addAudioTrack(source);
        const block = (at: number) =>
          Effect.acquireUseRelease(
            attemptSync(
              'write',
              file,
              () =>
                new AudioSample({
                  data: samples.subarray(
                    at * channels,
                    Math.min(pcm.frames, at + WRITE_BLOCK) * channels,
                  ),
                  format: 's16',
                  numberOfChannels: channels,
                  sampleRate: pcm.rate,
                  timestamp: at / pcm.rate,
                }),
            ),
            (sample) => attempt('write', file, () => source.add(sample)),
            (sample) => Effect.sync(() => sample.close()),
          );
        yield* Effect.gen(function* () {
          yield* attempt('write', file, () => output.start());
          for (let at = 0; at < pcm.frames; at += WRITE_BLOCK) yield* block(at);
          yield* attempt('write', file, () => output.finalize());
        }).pipe(Effect.onError(() => Effect.ignore(attempt('write', file, () => output.cancel()))));
        const bytes = yield* Option.match(Option.fromNullishOr(target.buffer), {
          onNone: () =>
            Effect.fail(MediaFailed.make({ op: 'write', file, reason: 'nothing was written' })),
          onSome: (buffer) => Effect.succeed(new Uint8Array(buffer)),
        });
        yield* fs
          .writeFile(file, bytes)
          .pipe(
            Effect.mapError((error) =>
              MediaFailed.make({ op: 'write', file, reason: error.message }),
            ),
          );
      });

      const join = Effect.fn('Media.join')(function* (film: JoinedFilm) {
        yield* Effect.scoped(joinInto(fs, film));
      });

      return Media.of({ duration, decode, writeWav, join });
    }),
  );
}
