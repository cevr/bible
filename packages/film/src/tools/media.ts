// Media files, in-process: how long a file plays, a sound decoded to PCM, PCM
// written out as WAV, and a film joined from its video segments with its
// track. mediabunny reads and writes the containers (pure TypeScript); MP3
// decodes through mpg123 (WASM), gapless, sample for sample as ffmpeg decoded
// it; AAC encodes through ffmpeg's encoder built to WASM
// (@mediabunny/aac-encoder). Every byte moves through the FileSystem service
// but a joined film's, which mediabunny writes by position itself.
// H.264 is a browser's codec: a page encodes it (player/encode.ts), and
// joining only copies its packets.
//
// One H.264 encode happens here: the share copy of a film the browser
// encoded in software (`shareCopy`). Chromium's software encoder keeps the
// paper's grain only at 24 Mbps, so its share is x264's, from the joined
// master, through the ffmpeg CLI: CRF 22, preset slow, tune grain. Not
// mediabunny-server (@mediabunny/server 1.60.0, libx264 through NodeAV):
// its encoder sets a fixed `qp` with qmin = qmax on the default preset, with
// no CRF, preset or tune to pass (packages/server/src/video-encoder.ts), and
// at the same size it kept far less grain (q23: 444 MB, 33–67% of the
// grain, against CRF 23 tune grain's 487 MB and 75–83%).
//
// A person's recording comes in whatever a recorder wrote (WAV, FLAC, AIFF,
// M4A, MP3) at whatever rate its microphone ran, and loads in-process as
// ffmpeg loaded it, sample for sample: mediabunny opens the container and
// decodes PCM; MP3 goes through mpg123 as above; FLAC, AAC (and Opus,
// Vorbis) through FFmpeg's own decoders in-process (@mediabunny/server,
// NodeAV: Bun has no WebCodecs audio decoder), an AAC's priming dropped as
// the MP4's edit list says; AIFF, which mediabunny has no
// reader for, is plain PCM read here (`aiff.ts`). The mixdown to one channel
// and the rate change are libswresample's, as ffmpeg's were (`resample.ts`).
// A person's take is the film's final voice, so it leaves lossless: a 24-bit
// FLAC master, libFLAC's (@mediabunny/flac-encoder, WASM), which decodes back
// sample for sample. Staging takes stay the MP3s ElevenLabs sends.

import { registerAacEncoder } from '@mediabunny/aac-encoder';
import { registerFlacEncoder } from '@mediabunny/flac-encoder';
import { registerMediabunnyServer } from '@mediabunny/server';
import { Array as Arr, Context, Effect, FileSystem, Layer, Match, Option, Stream } from 'effect';
import { ChildProcess, ChildProcessSpawner } from 'effect/process';
import {
  ALL_FORMATS,
  AudioSample,
  AudioSampleSink,
  AudioSampleSource,
  BufferSource,
  BufferTarget,
  EncodedAudioPacketSource,
  type EncodedPacket,
  EncodedPacketSink,
  EncodedVideoPacketSource,
  FilePathTarget,
  FLAC,
  FlacOutputFormat,
  Input,
  type InputAudioTrack,
  MP3,
  Mp4OutputFormat,
  NullTarget,
  Output,
  WavOutputFormat,
} from 'mediabunny';
import { MPEGDecoder } from 'mpg123-decoder';
import { type Pcm, concat, toInt16 } from '../core/audio.ts';
import { isAiff, readAiff } from './aiff.ts';
import { MediaFailed } from './errors.ts';
import { collect, isNotFound } from './process.ts';
import { resample } from './resample.ts';

export interface MediaService {
  /**
   * A recording (WAV, FLAC, AIFF, M4A, MP3), mixed down to one channel and
   * resampled to `rate`, as 32-bit float.
   */
  readonly load: (file: string, rate: number) => Effect.Effect<Pcm, MediaFailed>;
  /** `pcm` as a 24-bit FLAC master: a person's take, lossless. */
  readonly encodeFlac: (pcm: Pcm) => Effect.Effect<Uint8Array, MediaFailed>;
  /**
   * How long `file` plays, in seconds: an MP3 or FLAC as decoded (an MP3's
   * encoder padding trimmed), anything else by its container.
   */
  readonly duration: (file: string) => Effect.Effect<number, MediaFailed>;
  /** `file`'s first audio track (MP3, FLAC, WAV, AIFF, M4A) decoded to planar PCM at its own rate, from its first frame. */
  readonly decode: (file: string) => Effect.Effect<Pcm, MediaFailed>;
  /** `pcm` written to `file` as a 16-bit WAV. */
  readonly writeWav: (file: string, pcm: Pcm) => Effect.Effect<void, MediaFailed>;
  /** `pcm` encoded to AAC packets, from its first frame, for `join` to copy. */
  readonly encodeAac: (pcm: Pcm) => Effect.Effect<AacTrack, MediaFailed>;
  /**
   * The film as one MP4 at `out`: each segment's H.264 packets copied, not
   * re-encoded, at its place, and the track's AAC packets, if any, beside
   * them. Every segment must be encoded alike.
   */
  readonly join: (film: JoinedFilm) => Effect.Effect<void, MediaFailed>;
  /**
   * The share copy of the film at `master`, written to `out`: its video
   * encoded again by x264 (`SHARE_X264`), its track copied. `out` appears
   * only once whole.
   */
  readonly shareCopy: (master: string, out: string) => Effect.Effect<void, MediaFailed>;
}

/**
 * x264's settings for a share copy, measured on righteousness-by-faith
 * against its lossless stills (packages/film/README.md, "Encoders"): CRF 22
 * at preset slow with tune grain kept 78–89% of the paper's grain at its 7
 * review frames (SSIM 0.86–0.91) at 616 MB, in 289 s on 16 cores, against
 * the in-page software share's 72–90% at 1.16 GB. Level 4.1 keeps
 * it playable on every phone (preset slow's five reference frames would
 * otherwise raise it to 5.0).
 */
export const SHARE_X264: ReadonlyArray<string> = [
  '-c:v',
  'libx264',
  '-preset',
  'slow',
  '-tune',
  'grain',
  '-crf',
  '22',
  '-level:v',
  '4.1',
  '-pix_fmt',
  'yuv420p',
  '-c:a',
  'copy',
  '-movflags',
  '+faststart',
];

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
  readonly audio: Option.Option<AacTrack>;
}

/** A track encoded once to AAC, so every film joined with it copies the same packets. */
export interface AacTrack {
  /** In decode order; the first carries the priming, stamped before zero. */
  readonly packets: ReadonlyArray<EncodedPacket>;
  /** The encoder's metadata for the first packet: its decoder config. */
  readonly meta: EncodedAudioChunkMetadata;
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

/**
 * A file read and opened: its bytes, mediabunny's view of them, and what
 * decodes it: mpg123 an MP3, `aiff.ts` an AIFF, mediabunny anything else (a
 * FLAC through FFmpeg's decoder, measured as decoded).
 */
interface Opened {
  readonly file: string;
  readonly bytes: Uint8Array;
  readonly input: Input;
  readonly codec: 'mp3' | 'flac' | 'aiff' | 'other';
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
      Effect.fromOption(Option.fromNullishOr(track), () =>
        MediaFailed.make({ op: 'decode', file: opened.file, reason: 'no audio track' }),
      ),
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

/**
 * One block of samples as planar PCM, less any frames before zero (an AAC
 * encoder's priming, which the MP4's edit list skips, as ffmpeg skips it);
 * the block is closed once copied.
 */
const planar = (file: string, track: InputAudioTrack, sample: AudioSample) =>
  attemptSync('decode', file, (): Pcm => {
    const early = Math.round(-sample.timestamp * sample.sampleRate);
    const skip = Math.min(sample.numberOfFrames, Math.max(0, early));
    return {
      rate: sample.sampleRate,
      frames: sample.numberOfFrames - skip,
      channels: Array.from({ length: track.numberOfChannels }, (_, planeIndex) => {
        const plane = new Float32Array(sample.numberOfFrames);
        sample.copyTo(plane, { planeIndex, format: 'f32-planar' });
        return plane.subarray(skip);
      }),
    };
  }).pipe(Effect.ensuring(Effect.sync(() => sample.close())));

/**
 * Any other sound, block by block: PCM (a WAV) mediabunny decodes itself;
 * AAC, Opus and Vorbis go through @mediabunny/server's FFmpeg decoders.
 */
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
    if (opened.codec === 'aiff')
      return yield* Effect.mapError(Effect.fromResult(readAiff(opened.bytes)), (reason) =>
        MediaFailed.make({ op: 'decode', file: opened.file, reason }),
      );
    const track = yield* audioTrack(opened);
    if (opened.codec === 'mp3') return yield* decodeMp3(opened, track);
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
  Effect.fromOption(Option.fromNullishOr(value), () =>
    MediaFailed.make({ op: 'join', file, reason: `no ${what}` }),
  );

/**
 * `film` written to its file. mediabunny writes the index into the space
 * reserved at the head (fast start) once the last packet is in, so the file is
 * written by position: `FilePathTarget` holds its own handle on Bun's file
 * system and writes each chunk at its offset, closing the handle when the
 * output finalizes or cancels. (Effect's file handle cannot: under Bun, its
 * `fs.write(fd, data, undefined, undefined, position)` appends.) Segments
 * still come in through `fs`.
 */
const joinInto = (fs: FileSystem.FileSystem, film: JoinedFilm) =>
  Effect.gen(function* () {
    const { out } = film;
    const target = new FilePathTarget(out);
    const output = new Output({ format: new Mp4OutputFormat({ fastStart: 'reserve' }), target });
    const video = new EncodedVideoPacketSource('avc');
    output.addVideoTrack(video, { maximumPacketCount: film.frames });
    const audio = Option.map(film.audio, (aac) => {
      const source = new EncodedAudioPacketSource('aac');
      output.addAudioTrack(source, { maximumPacketCount: aac.packets.length });
      return { aac, source, written: 0 };
    });

    /** The track's packets that start before `until` seconds, so video and audio reach the file side by side. */
    const soundTo = (until: number) =>
      Option.match(audio, {
        onNone: () => Effect.void,
        onSome: (track) =>
          Effect.gen(function* () {
            const { packets, meta } = track.aac;
            const from = track.written;
            const due = Arr.takeWhile(packets.slice(from), (packet) => packet.timestamp < until);
            yield* Effect.forEach(
              due,
              (packet, k) =>
                attempt('write', out, () =>
                  track.source.add(
                    packet,
                    Option.getOrUndefined(Option.filter(Option.some(meta), () => from + k === 0)),
                  ),
                ),
              { discard: true },
            );
            track.written = from + due.length;
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

/** The name a track's encode fails under: it has no file of its own. */
const TRACK = 'the track';
/** The name a take's master encodes under, as `takes.ts` names the file it keeps. */
const TAKE = 'take.flac';

/**
 * `pcm` through the AAC encoder into a muxer that keeps nothing, its packets
 * kept as they come out. The samples go in `AAC_PRIMING` frames early, so the
 * first packet is stamped before zero and the MP4's edit list skips it.
 */
const encodeTrack = (pcm: Pcm) =>
  Effect.gen(function* () {
    const packets: Array<EncodedPacket> = [];
    const metas: Array<EncodedAudioChunkMetadata> = [];
    const output = new Output({ format: new Mp4OutputFormat(), target: new NullTarget() });
    const source = new AudioSampleSource({
      codec: 'aac',
      bitrate: AAC_BITRATE,
      onEncodedPacket: (packet, meta) => {
        packets.push(packet);
        metas.push(...Option.toArray(Option.fromNullishOr(meta)));
      },
    });
    output.addAudioTrack(source, {
      maximumPacketCount: Math.ceil((pcm.frames + AAC_PRIMING) / AAC_FRAME) + 1,
    });
    yield* Effect.gen(function* () {
      yield* attempt('encode', TRACK, () => output.start());
      for (let written = 0; written < pcm.frames; written += WRITE_BLOCK) {
        const frames = Math.min(WRITE_BLOCK, pcm.frames - written);
        const at = (written - AAC_PRIMING) / pcm.rate;
        yield* Effect.acquireUseRelease(
          attemptSync('encode', TRACK, () => block(pcm, written, frames, at)),
          (sample) => attempt('encode', TRACK, () => source.add(sample)),
          (sample) => Effect.sync(() => sample.close()),
        );
      }
      yield* attempt('encode', TRACK, () => output.finalize());
    }).pipe(Effect.onError(() => Effect.ignore(attempt('encode', TRACK, () => output.cancel()))));
    const meta = yield* Effect.fromOption(Arr.head(metas), () =>
      MediaFailed.make({ op: 'encode', file: TRACK, reason: 'no decoder config' }),
    );
    const track: AacTrack = { packets, meta };
    return track;
  });

/** `ffmpeg <args>` run to its end, failing as `op` on `file`. */
const runFfmpeg = (
  spawner: ChildProcessSpawner.ChildProcessSpawner['Service'],
  op: MediaFailed['op'],
  file: string,
  args: ReadonlyArray<string>,
) =>
  collect(
    spawner,
    ChildProcess.make('ffmpeg', ['-hide_banner', '-v', 'error', '-nostdin', '-y', ...args]),
  ).pipe(
    Effect.mapError((error) => {
      if (isNotFound(error))
        return MediaFailed.make({
          op,
          file,
          reason: 'ffmpeg is not on PATH; install it (brew install ffmpeg)',
        });
      return MediaFailed.make({ op, file, reason: error.message });
    }),
    Effect.flatMap((done) => {
      if (done.exitCode === 0) return Effect.void;
      return Effect.fail(MediaFailed.make({ op, file, reason: done.stderr.trim() }));
    }),
  );

/** Whether ffmpeg runs, for `film doctor`: a software render's share copy is x264's, through it. */
export const ffmpegReady = Effect.fn('Media.ffmpegReady')(function* () {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  yield* runFfmpeg(spawner, 'decode', 'ffmpeg', ['-version']);
});

export class Media extends Context.Service<Media, MediaService>()('@bible/film/tools/Media') {
  static readonly layer = Layer.effect(
    Media,
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
      // Bun has no AAC of its own; this one is mediabunny's to use from here on.
      // It encodes in a worker thread, which listens on `worker_threads` under
      // Bun since mediabunny 1.61.0 (before, on `self`, where no message ever
      // arrived, and it hung).
      // So is libFLAC's, for a take's master, in its own worker the same way.
      // mediabunny takes the first coder registered that can: these two come
      // before @mediabunny/server's FFmpeg ones, which are here for the
      // decoders Bun lacks (AAC, Opus, Vorbis) and would otherwise encode too.
      yield* Effect.sync(() => {
        registerAacEncoder();
        registerFlacEncoder();
        registerMediabunnyServer();
      });

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
          // mediabunny has no AIFF reader: one is read by `aiff.ts`, the Input left unread.
          if (isAiff(bytes)) {
            const aiff: Opened = { file, bytes, input, codec: 'aiff' };
            return aiff;
          }
          const format = yield* attempt('read', file, () => input.getFormat());
          // By identity: mediabunny's formats are singletons (a Match pattern would compare fields).
          const codec = Match.value(format).pipe(
            Match.when(
              (f) => f === MP3,
              (): Opened['codec'] => 'mp3',
            ),
            Match.when(
              (f) => f === FLAC,
              (): Opened['codec'] => 'flac',
            ),
            Match.orElse((): Opened['codec'] => 'other'),
          );
          const opened: Opened = { file, bytes, input, codec };
          return opened;
        });

      const duration = Effect.fn('Media.duration')(function* (file: string) {
        return yield* Effect.scoped(
          Effect.gen(function* () {
            const opened = yield* open(file);
            if (opened.codec === 'other')
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
        yield* joinInto(fs, film);
      });

      const encodeAac = Effect.fn('Media.encodeAac')(function* (pcm: Pcm) {
        return yield* encodeTrack(pcm);
      });

      const load = Effect.fn('Media.load')(function* (file: string, rate: number) {
        const recording = yield* decode(file);
        // One channel at the rate already: nothing to convert, as ffmpeg converted nothing.
        if (recording.channels.length === 1 && recording.rate === rate) return recording;
        return yield* resample(file, recording, rate, 1);
      });

      const encodeFlac = Effect.fn('Media.encodeFlac')(function* (pcm: Pcm) {
        const target = new BufferTarget();
        const output = new Output({ format: new FlacOutputFormat(), target });
        // Float in, 24 bits out (libFLAC's depth for float samples): the one
        // quantisation, 144 dB down, needs no dither.
        const source = new AudioSampleSource({ codec: 'flac' });
        output.addAudioTrack(source);
        yield* Effect.gen(function* () {
          yield* attempt('encode', TAKE, () => output.start());
          for (let written = 0; written < pcm.frames; written += WRITE_BLOCK) {
            const frames = Math.min(WRITE_BLOCK, pcm.frames - written);
            yield* Effect.acquireUseRelease(
              attemptSync('encode', TAKE, () => block(pcm, written, frames, written / pcm.rate)),
              (sample) => attempt('encode', TAKE, () => source.add(sample)),
              (sample) => Effect.sync(() => sample.close()),
            );
          }
          yield* attempt('encode', TAKE, () => output.finalize());
        }).pipe(
          Effect.onError(() => Effect.ignore(attempt('encode', TAKE, () => output.cancel()))),
        );
        return yield* Option.match(Option.fromNullishOr(target.buffer), {
          onNone: () =>
            Effect.fail(
              MediaFailed.make({ op: 'encode', file: TAKE, reason: 'nothing was written' }),
            ),
          onSome: (buffer) => Effect.succeed(new Uint8Array(buffer)),
        });
      });

      const shareCopy = Effect.fn('Media.shareCopy')(function* (master: string, out: string) {
        // Beside `out` until whole, so a failed or cut-off encode leaves no share behind.
        const part = `${out}.part`;
        yield* runFfmpeg(spawner, 'encode', out, [
          '-i',
          master,
          ...SHARE_X264,
          '-f',
          'mp4',
          part,
        ]).pipe(
          Effect.andThen(fs.rename(part, out)),
          Effect.mapError((error) =>
            Match.value(error).pipe(
              Match.tag('MediaFailed', (failed) => failed),
              Match.orElse((other) =>
                MediaFailed.make({ op: 'write', file: out, reason: other.message }),
              ),
            ),
          ),
          Effect.onExit(() => Effect.ignore(fs.remove(part, { force: true }))),
        );
      });

      return Media.of({
        duration,
        decode,
        writeWav,
        encodeAac,
        join,
        load,
        encodeFlac,
        shareCopy,
      });
    }),
  );
}
