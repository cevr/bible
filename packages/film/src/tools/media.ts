// Media files, in-process: how long a file plays, what tracks it holds, a
// sound decoded to PCM, and PCM written out as WAV. mediabunny reads and
// writes the containers (pure TypeScript); MP3 decodes through mpg123 (WASM),
// gapless, sample for sample as ffmpeg decoded it. Every byte moves through
// the FileSystem service. The codecs a browser owns (H.264, AAC) are encoded
// in the page, never here.

import { Array as Arr, Context, Effect, FileSystem, Layer, Option, Stream } from 'effect';
import {
  ALL_FORMATS,
  AudioSample,
  AudioSampleSink,
  AudioSampleSource,
  BufferSource,
  BufferTarget,
  Input,
  type InputAudioTrack,
  MP3,
  Output,
  type TrackType,
  WavOutputFormat,
} from 'mediabunny';
import { MPEGDecoder } from 'mpg123-decoder';
import { type Pcm, concat, toInt16 } from '../core/audio.ts';
import { MediaFailed } from './errors.ts';

/** What a track carries: `video`, `audio` or `subtitle`. */
export type TrackKind = TrackType;

export interface MediaService {
  /**
   * How long `file` plays, in seconds: an MP3 as decoded (its encoder
   * padding trimmed), anything else by its container.
   */
  readonly duration: (file: string) => Effect.Effect<number, MediaFailed>;
  /** The kind of each track in `file`. */
  readonly tracks: (file: string) => Effect.Effect<ReadonlyArray<TrackKind>, MediaFailed>;
  /** `file`'s first audio track (MP3, WAV) decoded to planar PCM at its own rate. */
  readonly decode: (file: string) => Effect.Effect<Pcm, MediaFailed>;
  /** `pcm` written to `file` as a 16-bit WAV. */
  readonly writeWav: (file: string, pcm: Pcm) => Effect.Effect<void, MediaFailed>;
}

/** A WAV is written this many frames at a time. */
const WRITE_BLOCK = 65536;

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

export class Media extends Context.Service<Media, MediaService>()('@bible/film/tools/Media') {
  static readonly layer = Layer.effect(
    Media,
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;

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

      const tracks = Effect.fn('Media.tracks')(function* (file: string) {
        return yield* Effect.scoped(
          Effect.gen(function* () {
            const opened = yield* open(file);
            const found = yield* attempt('read', file, () => opened.input.getTracks());
            return found.map((track) => track.type);
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

      return Media.of({ duration, tracks, decode, writeWav });
    }),
  );
}
