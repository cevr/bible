// Media files, in-process: how long a file plays, a sound decoded to PCM, PCM
// written out as WAV or as an AAC `.m4a` (a review's mix), and a film joined
// from its video segments with its track. mediabunny reads and writes the
// containers (pure TypeScript); MP3 decodes through mpg123 (WASM), gapless;
// AAC encodes through FFmpeg's encoder built to WASM
// (@mediabunny/aac-encoder). Every byte moves through the FileSystem service
// but a joined film's, which mediabunny writes by position itself, and a
// container's length, which it reads in place. A render's master is a
// browser's H.264 (player/encode.ts), and joining only copies its packets,
// as it does a hardware render's share copy. A software render's share copy
// is made here after the join, a mediabunny conversion through x264
// (`x264.ts`); a re-mux copies its packets, reordered frames and all, beside
// the new track.
//
// The review's stills and phone copies of a render are made here too: a
// still is the frame at a time, decoded by mediabunny and written as a JPEG
// (`jpeg.ts`); a phone copy is a mediabunny conversion to H.264 at 720p at
// most (a smaller video keeps its size) through
// x264 at its own settings (CRF 23 at preset medium, capped at `PHONE_RATE`,
// a key frame every second, on two threads: `x264.ts`), its track copied.
//
// A person's recording comes in whatever a recorder wrote (WAV, FLAC, AIFF,
// M4A, MP3) at whatever rate its microphone ran, and loads in-process,
// sample for sample: mediabunny opens the container and decodes PCM; MP3
// goes through mpg123 as above; FLAC, AAC (and Opus, Vorbis) and H.264
// through FFmpeg's own decoders in-process (@mediabunny/server, NodeAV: Bun
// has no WebCodecs decoder), an AAC's priming dropped as the MP4's edit
// list says; AIFF, which mediabunny has no reader for, is plain PCM read
// here (`aiff.ts`). The mixdown to one channel and the rate change are
// libswresample's (`resample.ts`). A person's take is the film's final
// voice, so it leaves lossless: a 24-bit FLAC master, libFLAC's
// (@mediabunny/flac-encoder, WASM), which decodes back sample for sample.
// Staging takes stay the MP3s ElevenLabs sends.

import { registerAacEncoder } from '@mediabunny/aac-encoder';
import { registerFlacEncoder } from '@mediabunny/flac-encoder';
import { registerMediabunnyServer } from '@mediabunny/server';
import {
  Array as Arr,
  Context,
  Duration,
  Effect,
  FileSystem,
  Layer,
  Match,
  Option,
  Order,
  Stream,
} from 'effect';
import {
  ALL_FORMATS,
  AudioSample,
  AudioSampleSink,
  AudioSampleSource,
  BufferSource,
  BufferTarget,
  Conversion,
  EncodedAudioPacketSource,
  type EncodedPacket,
  EncodedPacketSink,
  EncodedVideoPacketSource,
  FilePathSource,
  FilePathTarget,
  FLAC,
  FlacOutputFormat,
  Input,
  type InputAudioTrack,
  type InputVideoTrack,
  MP3,
  Mp4OutputFormat,
  NullTarget,
  Output,
  Quality,
  VideoSampleSink,
  WavOutputFormat,
  registerEncoder,
} from 'mediabunny';
import { MPEGDecoder } from 'mpg123-decoder';
import { type Pcm, concat, toInt16 } from '../core/audio.ts';
import { isAiff, readAiff } from './aiff.ts';
import { writeWhole } from './content-store.ts';
import { MediaFailed } from '../core/refusals.ts';
import { jpegOf } from './jpeg.ts';
import { resample } from './resample.ts';
import { PHONE_ENCODE, X264Encoder } from './x264.ts';

/** How long a media file plays, in seconds, and its frames a second (none for a file with no video). */
interface Timing {
  readonly seconds: number;
  readonly fps: Option.Option<number>;
}

export interface MediaService {
  /**
   * A recording (WAV, FLAC, AIFF, M4A, MP3), mixed down to one channel and
   * resampled to `rate`, as 32-bit float.
   */
  readonly load: (file: string, rate: number) => Effect.Effect<Pcm, MediaFailed>;
  /** `pcm` as a 24-bit FLAC master: a person's take, lossless. */
  readonly encodeFlac: (pcm: Pcm) => Effect.Effect<Uint8Array, MediaFailed>;
  /**
   * How long `file` plays, in seconds (an MP3 or FLAC as decoded, its
   * encoder padding trimmed; anything else by its container), and its
   * frames a second as its own packets say (`rateOf`: a whole or 1000/1001
   * rate within its timestamps' precision, else as measured), none for a file with no
   * video: one read of the file.
   */
  readonly timing: (file: string) => Effect.Effect<Timing, MediaFailed>;
  /** `file`'s first audio track (MP3, FLAC, WAV, AIFF, M4A) decoded to planar PCM at its own rate, from its first frame. */
  readonly decode: (file: string) => Effect.Effect<Pcm, MediaFailed>;
  /** `pcm` written to `file` as a 16-bit WAV. */
  readonly writeWav: (file: string, pcm: Pcm) => Effect.Effect<void, MediaFailed>;
  /** `pcm` encoded to AAC packets, from its first frame, for `join` to copy. */
  readonly encodeAac: (pcm: Pcm) => Effect.Effect<AacTrack, MediaFailed>;
  /** `pcm` written to `file` as an AAC track in an MP4 (an `.m4a`, fast start): what a phone plays. */
  readonly writeAac: (file: string, pcm: Pcm) => Effect.Effect<void, MediaFailed>;
  /**
   * The film as one MP4 at `out`: each segment's H.264 packets copied, not
   * re-encoded, at its place, and the track's AAC packets, if any, beside
   * them. Every segment must be encoded alike. The file is written beside
   * `out` and renamed over it once whole.
   */
  readonly join: (film: JoinedFilm) => Effect.Effect<void, MediaFailed>;
  /**
   * `video` with its sound replaced by `audio`: its H.264 packets copied, not
   * re-encoded, and the track's AAC packets beside them. The file is written
   * beside `video` and renamed over it once whole.
   */
  readonly remux: (video: string, audio: AacTrack) => Effect.Effect<void, MediaFailed>;
  /**
   * The share copy of the film at `master`, written to `out`: its video
   * encoded again by x264 at CRF `SHARE_CRF` (`x264.ts`), its track copied.
   * `out` appears only once whole.
   */
  readonly shareCopy: (master: string, out: string) => Effect.Effect<void, MediaFailed>;
  /**
   * A JPEG of the frame `video` shows at `at` seconds, `width` pixels wide,
   * written to `out` whatever its name.
   */
  readonly still: (
    video: string,
    at: number,
    width: number,
    out: string,
  ) => Effect.Effect<void, MediaFailed>;
  /**
   * The copy of `video` a phone streams, written to `out` (an MP4 whatever
   * its name, the index at its head): `PHONE_HEIGHT` pixels high at most (a
   * shorter video keeps its size), H.264 at
   * CRF 23 capped at `PHONE_RATE`, a key frame every second (`x264.ts`,
   * `PHONE_ENCODE`), its track copied. The review makes one of every render
   * too big or too dense to play as made, and names it by `PHONE_COPY`.
   */
  readonly phoneCopy: (video: string, out: string) => Effect.Effect<void, MediaFailed>;
}

/**
 * x264's CRF for a share copy (preset slow, tune grain: `x264.ts`), chosen
 * against righteousness-by-faith's lossless stills (packages/film/README.md,
 * "Software share").
 */
const SHARE_CRF = 22;

/** A phone copy's height at most, in pixels. */
const PHONE_HEIGHT = 720;

/**
 * The most bits a second a phone is taken to play smoothly: the review
 * serves a video over it as its phone copy (`review.ts`), and a copy is
 * capped at it. Seen on the looks study (2026-10-11): its 2D renders at 7.1
 * and 7.8 Mbps played as made, its 3D ones at 14 and 21 Mbps choppily
 * (packages/film/README.md, "Phone copies").
 */
export const PHONE_RATE = 8_000_000;

/**
 * Everything a phone copy is made with: the review names its copies by it
 * beside their source (`review.ts`), so a copy made with other settings is
 * never served.
 */
export const PHONE_COPY: ReadonlyArray<string | number> = [
  PHONE_HEIGHT,
  PHONE_RATE,
  PHONE_ENCODE.keyEvery,
  ...Object.entries(PHONE_ENCODE.x264).flat(),
];

/** How long one still may take, and one phone copy. */
const STILL_LIMIT = Duration.minutes(1);
const PHONE_LIMIT = Duration.minutes(30);

/** A run of H.264 video in its own MP4, played from `at` seconds into the film. */
interface Segment {
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
interface AacTrack {
  /** In decode order; the first carries the priming, stamped before zero. */
  readonly packets: ReadonlyArray<EncodedPacket>;
  /** The encoder's metadata for the first packet: its decoder config. */
  readonly meta: EncodedAudioChunkMetadata;
}

/** Sound is written this many frames at a time. */
const WRITE_BLOCK = 65536;

/** The film's track, as AAC, at this many bits a second. */
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
 * encoder's priming, which the MP4's edit list skips);
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

/** `value`, or `op` on `file` failed for want of `what`. */
const present = <A>(op: MediaFailed['op'], file: string, what: string, value: A) =>
  Effect.fromOption(Option.fromNullishOr(value), () =>
    MediaFailed.make({ op, file, reason: `no ${what}` }),
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

    /**
     * The track's packets that start before `until` seconds and are not yet
     * written. Each video packet is preceded by the sound due before it, so
     * the two reach the muxer side by side: it holds every track's chunks in
     * memory until all of its tracks have one, and a fast start sizes its
     * index only then (a track of reordered frames, x264's, with no sound yet
     * fails there).
     */
    const soundTo = (until: number) =>
      Option.match(audio, {
        onNone: () => Effect.void,
        onSome: (track) =>
          Effect.gen(function* () {
            const { packets, meta } = track.aac;
            const due = () =>
              Option.filter(Arr.get(packets, track.written), (packet) => packet.timestamp < until);
            for (let next = due(); Option.isSome(next); next = due()) {
              const packet = next.value;
              const first = Option.liftPredicate(meta, () => track.written === 0);
              yield* attempt('write', out, () =>
                track.source.add(packet, Option.getOrUndefined(first)),
              );
              track.written += 1;
            }
          }),
      });

    /** One segment's packets, moved to its place, each after the sound due before it; its config's key. */
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
            'join',
            segment.file,
            'video track',
            yield* attempt('join', segment.file, () => input.getPrimaryVideoTrack()),
          );
          const config = yield* present(
            'join',
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
              yield* soundTo(moved.timestamp);
              yield* attempt('write', out, () => video.add(moved, Option.getOrUndefined(meta)));
              meta = Option.none();
            }),
          );
          return key;
        }),
      );

    yield* Effect.gen(function* () {
      yield* attempt('write', out, () => output.start());
      let first = Option.none<string>();
      for (const segment of film.segments) {
        first = Option.some(yield* copy(segment, first));
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

/** `effect` failed as `op` on `file` once it runs past `limit`. */
const within = <A>(
  op: MediaFailed['op'],
  file: string,
  limit: Duration.Duration,
  effect: Effect.Effect<A, MediaFailed>,
) =>
  Effect.timeoutOrElse(effect, {
    duration: limit,
    orElse: () =>
      Effect.fail(MediaFailed.make({ op, file, reason: `took over ${Duration.format(limit)}` })),
  });

/** `file` opened by mediabunny where it lies (a render is never read whole), until the scope closes. */
const openInPlace = (file: string) =>
  Effect.acquireRelease(
    Effect.sync(() => new Input({ source: new FilePathSource(file), formats: ALL_FORMATS })),
    (opened) => Effect.sync(() => opened.dispose()),
  );

/** `file`'s video track, failing as `op` when it has none. */
const videoTrackOf = (op: MediaFailed['op'], file: string, input: Input) =>
  Effect.flatMap(
    attempt(op, file, () => input.getPrimaryVideoTrack()),
    (track) => present(op, file, 'video track', track),
  );

/** The frames a video's frame rate is read from: a few seconds of a film. */
const RATE_PACKETS = 120;

/** The greatest whole count of ticks both `a` and `b` are whole multiples of. */
const gcd = (a: number, b: number): number => {
  let [x, y] = [Math.abs(a), Math.abs(b)];
  while (y > 0) [x, y] = [y, x % y];
  return x;
};

/**
 * The rate frames starting at `ticks` (whole ticks of `1 / resolution` s
 * from the first frame's start, in order) were made at, as far as their
 * times can tell:
 *
 * - their clock is the coarsest step every start is a whole count of (their
 *   greatest common divisor), not the timescale that keeps them: a
 *   millisecond clock's times copied onto a 16000 timescale tell no more
 *   than they did on a 1000 one;
 * - the candidates are the whole rate (30) and its 1000/1001 rate
 *   (30000/1001, NTSC's 29.97) nearest the measured one;
 * - a clock of half a candidate's frame or more cannot tell that rate from
 *   its neighbours: it is the frames' own spacing (an exactly timed file,
 *   whose starts all lie on its frames, at 0.5 or 1.25 fps or with frames
 *   dropped), and a grid of the rate near it could hold the starts by
 *   putting two on one of its frames (1.25 fps on 1 fps's grid), or by
 *   skipping every other frame of its own (0.5 fps on 1 fps's). When either
 *   candidate's frame is that coarse, neither is claimed (the two are a
 *   thousandth apart: a clock that cannot tell one cannot tell them apart):
 *   as measured, below, which is exact for an exactly timed file;
 * - a grid holds the starts only if some two consecutive starts sit on
 *   adjacent lines of it, so a grid that holds them by skipping lines (0.5
 *   fps a tick off its frames on 1 fps's grid, on a clock fine enough to
 *   tell) names no rate;
 * - a candidate is taken when its frame grid puts every start within one
 *   step of its time and the other's does not. Each start is its frame's time put on the
 *   clock, truncated or rounded, so the made rate's offsets from its grid lie
 *   within a step of each other: strictly, unless a time lay halfway between
 *   two ticks and was rounded the other way from another, when they lie a
 *   whole step apart. So a grid holding every start strictly within a step
 *   is taken first; one that needs a start a whole step off, only when no
 *   grid holds them strictly. The frame times alone judge, so a last frame's
 *   own duration (written apart, rounded on its own) names no rate;
 * - else, both fitting (the times cannot tell them apart, as 10 frames on a
 *   millisecond clock cannot) or neither (another rate, or a variable one),
 *   the rate as measured: the frames over their span, in whole ticks, so a
 *   file timed exactly (a frame a whole count of ticks) reads its rate
 *   exactly. Neither is claimed: as measured, every start the times hold is
 *   within a step of its frame either way.
 *
 * None for fewer than two frames, or frames with no span.
 */
const rateOfTicks = (ticks: ReadonlyArray<number>, resolution: number): Option.Option<number> =>
  Option.map(
    Option.filter(Arr.last(ticks), (span) => ticks.length > 1 && span > 0),
    (span) => {
      const step = Arr.reduce(ticks, 0, gcd);
      const measured = ((ticks.length - 1) * resolution) / span;
      /**
       * How far apart `num / den` frames a second's grid puts the starts'
       * offsets from it, and the step they are judged against, both in ticks
       * times `num`: whole counts, so a bound is met or not, exactly. A grid
       * no two consecutive starts sit on adjacent lines of holds them by
       * skipping lines, so it is no frame grid of theirs: it holds nothing.
       * The clock tells this grid only while its step is under half the
       * grid's frame.
       */
      const spreadOf = (num: number, den: number) => {
        const period = resolution * den;
        const lines = ticks.map((at) => Math.round((at * num) / period));
        const offsets = Arr.zipWith(ticks, lines, (at, line) => at * num - line * period);
        const adjacent = Arr.zip(lines, Arr.drop(lines, 1)).some(([from, to]) => to - from === 1);
        return {
          spread: Match.value(adjacent).pipe(
            Match.when(true, () => Math.max(...offsets) - Math.min(...offsets)),
            Match.orElse(() => Infinity),
          ),
          step: step * num,
          tells: step * num * 2 < period,
        };
      };
      const whole = Math.round(measured);
      const ntsc = Math.round((measured * 1001) / 1000);
      const spreads = Arr.filter(
        [
          { rate: whole, ...spreadOf(whole, 1) },
          { rate: (ntsc * 1000) / 1001, ...spreadOf(ntsc * 1000, 1001) },
        ],
        (each) => each.rate > 0,
      );
      /** The one rate whose spread `holds` against its step, if one alone does. */
      const only = (holds: (each: { spread: number; step: number }) => boolean) => {
        const fitting = Arr.filter(spreads, holds);
        return Option.map(
          Option.filter(Arr.head(fitting), () => fitting.length === 1),
          (each) => each.rate,
        );
      };
      const strictly = Arr.filter(spreads, (each) => each.spread < each.step);
      return Option.getOrElse(
        Option.flatMap(
          Option.filter(Option.some(spreads), (each) => each.every((one) => one.tells)),
          () =>
            Match.value(strictly.length).pipe(
              Match.when(0, () => only((each) => each.spread <= each.step)),
              Match.orElse(() => only((each) => each.spread < each.step)),
            ),
        ),
        () => measured,
      );
    },
  );

/**
 * The start times (s) of the first `RATE_PACKETS` frames of `track`, in
 * presentation order: read on past them while a packet still comes before
 * the latest, as a reordered (B-frame) stream sends one.
 */
const firstFrameTimes = (file: string, track: InputVideoTrack) => {
  // From the first packet to the last: no packet bounds the read.
  const unbounded = Option.getOrUndefined(Option.none<EncodedPacket>());
  return Stream.fromAsyncIterable(
    new EncodedPacketSink(track).packets(unbounded, unbounded, { metadataOnly: true }),
    (cause) => MediaFailed.make({ op: 'read', file, reason: String(cause) }),
  ).pipe(
    Stream.mapAccum(
      () => ({ count: 0, latest: -Infinity }),
      (seen, packet) =>
        [
          { count: seen.count + 1, latest: Math.max(seen.latest, packet.timestamp) },
          [
            {
              at: packet.timestamp,
              past: seen.count >= RATE_PACKETS && packet.timestamp >= seen.latest,
            },
          ],
        ] as const,
    ),
    Stream.takeWhile((frame) => !frame.past),
    Stream.map((frame) => frame.at),
    Stream.runCollect,
    Effect.map((times) => Arr.sort(times, Order.Number)),
  );
};

/**
 * The frame rate of the video in `input` (`file` opened), as its own frames'
 * times say (`rateOfTicks`, over its first `RATE_PACKETS`). None for a file
 * with no video track, or none readable.
 */
const frameRateIn = (file: string, input: Input): Effect.Effect<Option.Option<number>> =>
  Effect.gen(function* () {
    const track = yield* videoTrackOf('read', file, input);
    const resolution = yield* attempt('read', file, () => track.getTimeResolution());
    const times = yield* firstFrameTimes(file, track);
    const ticks = times.map((at) => Math.round(at * resolution));
    const first = Option.getOrElse(Arr.head(ticks), () => 0);
    return rateOfTicks(
      ticks.map((at) => at - first),
      resolution,
    );
  }).pipe(Effect.orElseSucceed(() => Option.none<number>()));

/** An even count of pixels, as H.264's 4:2:0 wants. */
const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);

/**
 * `video` converted by mediabunny into an MP4 at `out`: its picture decoded,
 * sized by `size` from its own (none: as it is) and encoded again to H.264
 * at `quality` (x264, `x264.ts`), its track copied, the index at the head.
 * Cancelled when interrupted.
 */
const reencode = (
  video: string,
  out: string,
  quality: Quality,
  size: (width: number, height: number) => Option.Option<{ width: number; height: number }>,
) =>
  Effect.scoped(
    Effect.gen(function* () {
      const input = yield* openInPlace(video);
      const track = yield* videoTrackOf('encode', video, input);
      const output = new Output({
        format: new Mp4OutputFormat({ fastStart: 'in-memory' }),
        target: new FilePathTarget(out),
      });
      const sized = Option.match(size(track.displayWidth, track.displayHeight), {
        onNone: () => ({}),
        onSome: (to) => ({ ...to, fit: 'fill' as const }),
      });
      const conversion = yield* attempt('encode', video, () =>
        Conversion.init({
          input,
          output,
          tracks: 'primary',
          video: { ...sized, codec: 'avc', quality, forceTranscode: true },
          showWarnings: false,
        }),
      );
      if (!conversion.isValid)
        return yield* MediaFailed.make({
          op: 'encode',
          file: video,
          reason: conversion.discardedTracks.map((d) => d.reason).join(', '),
        });
      yield* Effect.tryPromise({
        try: (signal) => {
          signal.addEventListener('abort', () => void conversion.cancel());
          return conversion.execute();
        },
        catch: (cause) => MediaFailed.make({ op: 'encode', file: video, reason: String(cause) }),
      });
    }),
  );

/** The frame `video` shows at `at` seconds, decoded, as a JPEG `width` pixels wide. */
const frameJpeg = (video: string, at: number, width: number) =>
  Effect.scoped(
    Effect.gen(function* () {
      const input = yield* openInPlace(video);
      const track = yield* videoTrackOf('decode', video, input);
      const sample = yield* Effect.acquireRelease(
        Effect.flatMap(
          attempt('decode', video, () => new VideoSampleSink(track).getSample(Math.max(0, at))),
          (found) => present('decode', video, `frame at ${at.toFixed(3)} s`, found),
        ),
        (found) => Effect.sync(() => found.close()),
      );
      return yield* jpegOf(video, sample, even(width));
    }),
  );

/**
 * `pcm` as an AAC track in an MP4 held in memory: the encoder's packets
 * muxed with the index at the head (fast start), so a phone plays it as it
 * streams.
 */
const aacFile = (file: string, track: AacTrack) =>
  Effect.gen(function* () {
    const target = new BufferTarget();
    const output = new Output({ format: new Mp4OutputFormat({ fastStart: 'in-memory' }), target });
    const source = new EncodedAudioPacketSource('aac');
    output.addAudioTrack(source);
    yield* Effect.gen(function* () {
      yield* attempt('write', file, () => output.start());
      for (const [k, packet] of track.packets.entries())
        yield* attempt('write', file, () =>
          source.add(
            packet,
            Option.getOrUndefined(Option.liftPredicate(track.meta, () => k === 0)),
          ),
        );
      yield* attempt('write', file, () => output.finalize());
    }).pipe(Effect.onError(() => Effect.ignore(attempt('write', file, () => output.cancel()))));
    return yield* Effect.fromOption(Option.fromNullishOr(target.buffer), () =>
      MediaFailed.make({ op: 'write', file, reason: 'nothing was written' }),
    );
  });

export class Media extends Context.Service<Media, MediaService>()('@bible/film/tools/Media') {
  static readonly layer = Layer.effect(
    Media,
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      // Bun has no AAC of its own; this one is mediabunny's to use from here on.
      // It encodes in a worker thread, which listens on `worker_threads` under
      // Bun (mediabunny 1.61.0 and later).
      // So is libFLAC's, for a take's master, in its own worker the same way.
      // mediabunny takes the first coder registered that can: these two come
      // before @mediabunny/server's FFmpeg ones, which are here for the
      // decoders Bun lacks (AAC, Opus, Vorbis, H.264) and the scaling a phone
      // copy needs; H.264 encodes through x264 (`x264.ts`), registered first
      // too. No hardware context: nothing here asks the GPU.
      yield* Effect.sync(() => {
        registerAacEncoder();
        registerFlacEncoder();
        registerEncoder(X264Encoder);
        // oxlint-disable-next-line effect/noNullish -- @mediabunny/server's own "no GPU"
        registerMediabunnyServer({ hardwareContext: null });
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

      /**
       * `file`'s length by its container's index, read in place on the disk
       * by mediabunny (a render of hundreds of megabytes is never read whole).
       * None for an MP3 or a FLAC, whose length is what they decode to, and
       * for a file it cannot open there (an AIFF, or a file on a test's
       * in-memory disk): those are read through `fs` as before.
       */
      const indexedTiming = (file: string) =>
        Effect.scoped(
          Effect.gen(function* () {
            const input = yield* Effect.acquireRelease(
              Effect.sync(
                () => new Input({ source: new FilePathSource(file), formats: ALL_FORMATS }),
              ),
              (opened) => Effect.sync(() => opened.dispose()),
            );
            const format = yield* Effect.option(attempt('read', file, () => input.getFormat()));
            if (Option.isNone(format) || format.value === MP3 || format.value === FLAC)
              return Option.none<Timing>();
            const seconds = yield* attempt('read', file, () => input.computeDuration());
            const timing: Timing = { seconds, fps: yield* frameRateIn(file, input) };
            return Option.some(timing);
          }),
        );

      const timing = Effect.fn('Media.timing')(function* (file: string) {
        const indexed = yield* indexedTiming(file);
        if (Option.isSome(indexed)) return indexed.value;
        return yield* Effect.scoped(
          Effect.gen(function* () {
            const opened = yield* open(file);
            if (opened.codec === 'other') {
              const seconds = yield* attempt('read', file, () => opened.input.computeDuration());
              const read: Timing = { seconds, fps: yield* frameRateIn(file, opened.input) };
              return read;
            }
            const pcm = yield* decodeOpened(opened);
            const decoded: Timing = { seconds: pcm.frames / pcm.rate, fps: Option.none() };
            return decoded;
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

      /** The video packets `file` holds, counted by mediabunny in place on the disk. */
      const videoPackets = (file: string) =>
        Effect.scoped(
          Effect.gen(function* () {
            const track = yield* videoTrackOf('join', file, yield* openInPlace(file));
            const stats = yield* attempt('join', file, () => track.computePacketStats());
            return stats.packetCount;
          }),
        );

      /** `file` written whole by `write` (`writeWhole`); a failure is the file's `MediaFailed`. */
      const mediaWhole = <E extends { readonly message: string }>(
        file: string,
        write: (partial: string) => Effect.Effect<void, E | MediaFailed>,
      ) =>
        writeWhole(fs, file, write).pipe(
          Effect.mapError((error) =>
            Match.value(error).pipe(
              Match.tag('MediaFailed', (failed) => failed),
              Match.orElse((other) =>
                MediaFailed.make({ op: 'write', file, reason: other.message }),
              ),
            ),
          ),
        );

      // A failed or interrupted join leaves the file that was there before.
      const join = Effect.fn('Media.join')(function* (film: JoinedFilm) {
        yield* mediaWhole(film.out, (partial) => joinInto(fs, { ...film, out: partial }));
      });

      const remux = Effect.fn('Media.remux')(function* (video: string, audio: AacTrack) {
        const frames = yield* videoPackets(video);
        yield* mediaWhole(video, (partial) =>
          joinInto(fs, {
            out: partial,
            segments: [{ file: video, at: 0 }],
            frames,
            audio: Option.some(audio),
          }),
        );
      });

      const encodeAac = Effect.fn('Media.encodeAac')(function* (pcm: Pcm) {
        return yield* encodeTrack(pcm);
      });

      const writeAac = Effect.fn('Media.writeAac')(function* (file: string, pcm: Pcm) {
        const bytes = yield* aacFile(file, yield* encodeTrack(pcm));
        yield* fs
          .writeFile(file, new Uint8Array(bytes))
          .pipe(
            Effect.mapError((error) =>
              MediaFailed.make({ op: 'write', file, reason: error.message }),
            ),
          );
      });

      const still = Effect.fn('Media.still')(function* (
        video: string,
        at: number,
        width: number,
        out: string,
      ) {
        const bytes = yield* within('decode', video, STILL_LIMIT, frameJpeg(video, at, width));
        yield* fs
          .writeFile(out, bytes)
          .pipe(
            Effect.mapError((error) =>
              MediaFailed.make({ op: 'write', file: out, reason: error.message }),
            ),
          );
      });

      const phoneCopy = Effect.fn('Media.phoneCopy')(function* (video: string, out: string) {
        // A video no taller than the copy keeps its size: a copy never scales up.
        const phone = reencode(video, out, new Quality({ bitrate: PHONE_RATE }), (w, h) =>
          Option.map(
            Option.liftPredicate(h, (tall) => tall > PHONE_HEIGHT),
            (tall) => ({ width: even((PHONE_HEIGHT * w) / tall), height: PHONE_HEIGHT }),
          ),
        );
        yield* within('encode', video, PHONE_LIMIT, phone);
      });

      const shareCopy = Effect.fn('Media.shareCopy')(function* (master: string, out: string) {
        // Written whole, so a failed or cut-off encode leaves no share behind.
        yield* mediaWhole(out, (partial) =>
          reencode(master, partial, new Quality({ quantizer: SHARE_CRF }), () => Option.none()),
        );
      });

      const load = Effect.fn('Media.load')(function* (file: string, rate: number) {
        const recording = yield* decode(file);
        // One channel at the rate already: nothing to convert.
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

      return Media.of({
        timing,
        decode,
        writeWav,
        encodeAac,
        writeAac,
        join,
        remux,
        load,
        encodeFlac,
        shareCopy,
        still,
        phoneCopy,
      });
    }),
  );
}
