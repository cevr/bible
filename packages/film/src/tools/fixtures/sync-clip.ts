// A synthetic camera file for the A/V sync guard (`av-sync.test.ts`), made
// in the test with mediabunny: a dark picture with one white frame (the
// flash) and a quiet sound with one click at the same moment, as a clapper
// marks a take. Its picture may start after zero (`pictureStart`, as a
// phone's file often does) and its frames may fall off one lattice
// (`variable`, a phone's variable rate, on no lattice); its sound is AAC with the encoder's
// priming before zero, which the edit list skips. It is either camera's file
// (`camera`): an iPhone's, HEVC in a MOV and upright (9:16), or a Sony
// ZV-E10's, XAVC S, which is H.264 in an MP4, and landscape (16:9). No real
// footage is ever used.

import { Effect, Option } from 'effect';
import {
  AudioSample,
  AudioSampleSource,
  BufferTarget,
  MovOutputFormat,
  Mp4OutputFormat,
  Output,
  VideoSample,
  VideoSampleSource,
} from 'mediabunny';

/** The clip's long and short sides, and its sound's rate. */
const LONG = 320;
const SHORT = 180;
const RATE = 48_000;

/** The two cameras a talk is shot on: their picture's codec, their container and which way up. */
const CAMERAS = {
  iphone: {
    codec: 'hevc',
    container: () => new MovOutputFormat({ fastStart: 'in-memory' }),
    width: SHORT,
    height: LONG,
  },
  'zv-e10': {
    codec: 'avc',
    container: () => new Mp4OutputFormat({ fastStart: 'in-memory' }),
    width: LONG,
    height: SHORT,
  },
} as const;

/** A clapper's clip: how long, at what rate, which frame flashes, and how its clocks sit. */
export interface SyncClip {
  /** Whose file it is (above). */
  readonly camera: keyof typeof CAMERAS;
  readonly frames: number;
  readonly fps: number;
  /** The frame that flashes, the click on its first moment. */
  readonly flash: number;
  /** When the picture's first frame shows, seconds after the sound's zero. */
  readonly pictureStart: number;
  /** Whether frames fall off their lattice, each by up to three tenths of a frame, irregularly. */
  readonly variable: boolean;
}

/** When frame `n` of `clip` shows, on the file's clock. */
const frameTime = (clip: SyncClip, n: number): number =>
  clip.pictureStart + (n + Number(clip.variable) * 0.3 * Math.sin(n * 2.1)) / clip.fps;

/** Frame `n`'s picture as I420: white when it flashes, else near black; the chroma grey. */
const picture = (clip: SyncClip, n: number): Uint8Array => {
  const bytes = new Uint8Array(LONG * SHORT * 1.5).fill(128);
  bytes.fill([20, 235][Number(n === clip.flash)] ?? 20, 0, LONG * SHORT);
  return bytes;
};

/** The sound: a quiet hiss, and a 5 ms click when the flash shows. */
const sound = (clip: SyncClip, seconds: number): Float32Array => {
  const out = new Float32Array(Math.round(seconds * RATE));
  for (let i = 0; i < out.length; i += 1) out[i] = 0.001 * Math.sin(i * 0.37);
  const at = Math.round(frameTime(clip, clip.flash) * RATE);
  for (let i = 0; i < Math.round(0.005 * RATE); i += 1) out[at + i] = 0.9 * (1 - 2 * (i % 2));
  return out;
};

/** `clip` as its camera writes it: its picture in the camera's codec and container, and its AAC sound. */
export const syncClip = (clip: SyncClip): Effect.Effect<Uint8Array> =>
  Effect.gen(function* () {
    const camera = CAMERAS[clip.camera];
    const target = new BufferTarget();
    const output = new Output({ format: camera.container(), target });
    const video = new VideoSampleSource({ codec: camera.codec, bitrate: 2_000_000 });
    const audio = new AudioSampleSource({ codec: 'aac', bitrate: 128_000 });
    // No rate declared: the muxer would put every frame on its lattice, and a variable rate on none.
    output.addVideoTrack(video);
    output.addAudioTrack(audio);
    yield* Effect.promise(() => output.start());
    const seconds = frameTime(clip, clip.frames) + 0.2;
    // The sound from a frame of priming before zero, which the edit list skips.
    const samples = sound(clip, seconds + 1024 / RATE);
    yield* Effect.acquireUseRelease(
      Effect.sync(
        () =>
          new AudioSample({
            data: samples,
            format: 'f32-planar',
            numberOfChannels: 1,
            sampleRate: RATE,
            timestamp: -1024 / RATE,
          }),
      ),
      (sample) => Effect.promise(() => audio.add(sample)),
      (sample) => Effect.sync(() => sample.close()),
    );
    yield* Effect.forEach(
      Array.from({ length: clip.frames }, (_, n) => n),
      (n) =>
        Effect.acquireUseRelease(
          Effect.sync(
            () =>
              new VideoSample(picture(clip, n), {
                format: 'I420',
                codedWidth: camera.width,
                codedHeight: camera.height,
                timestamp: frameTime(clip, n),
                duration: frameTime(clip, n + 1) - frameTime(clip, n),
              }),
          ),
          (sample) => Effect.promise(() => video.add(sample)),
          (sample) => Effect.sync(() => sample.close()),
        ),
      { discard: true },
    );
    yield* Effect.promise(() => output.finalize());
    return new Uint8Array(
      yield* Effect.fromOption(Option.fromNullishOr(target.buffer), () => 'the clip wrote nothing'),
    );
  }).pipe(Effect.orDie);
