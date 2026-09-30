// Media with the real mediabunny, mpg123, FFmpeg (NodeAV) and the AAC and
// FLAC encoders, reading over the in-memory file system and joining films on
// the real disk: a WAV written reads back as the same 16-bit samples, an MP3
// decodes gapless (its encoder padding trimmed, a mono file one channel), a
// person's recording (WAV, M4A, AIFF, MP3) loads and its take encodes with no
// ffmpeg on the machine, a film joins from its segments with its track, and a
// file that is missing or not media fails as MediaFailed. fixtures/tone.mp3 is half a second of
// 440 Hz, mono, 44.1 kHz, with a LAME gapless header. fixtures/segment-*.mp4
// are fifteen frames of H.264 at 30 fps each, encoded in headless Chromium as
// a render encodes a chunk: `a` and `b` 64 × 64, `wide` 96 × 64.

import { BunServices } from '@effect/platform-bun';
import { describe, expect, it } from 'effect-bun-test';
import { Duration, Effect, FileSystem, Layer, Option, Stream } from 'effect';
import { ChildProcess, ChildProcessSpawner } from 'effect/process';
import {
  ALL_FORMATS,
  AudioSample,
  AudioSampleSource,
  BufferSource,
  BufferTarget,
  EncodedPacketSink,
  Input,
  Mp4OutputFormat,
  Output,
} from 'mediabunny';
import { type Pcm, toInt16 } from '../core/audio.ts';
import { Media, ffmpegReady } from './media.ts';
import { collectWithin } from './process.ts';
import { memoryFileSystem, text } from './testing.ts';

/** What a joined film holds: each track's kind and codec, every packet's time, and its length. */
const readBack = Effect.fn('test.readBack')(function* (file: string) {
  const bytes = yield* (yield* FileSystem.FileSystem).readFile(file);
  const input = new Input({ source: new BufferSource(bytes), formats: ALL_FORMATS });
  const tracks = yield* Effect.promise(() => input.getTracks());
  return yield* Effect.forEach(tracks, (track) =>
    Effect.gen(function* () {
      const times = yield* Stream.fromAsyncIterable(
        new EncodedPacketSink(track).packets(),
        String,
      ).pipe(
        Stream.map((packet) => packet.timestamp),
        Stream.runCollect,
        Effect.orDie,
      );
      const duration = yield* Effect.promise(() => track.computeDuration());
      return { type: track.type, codec: track.codec, times: [...times], duration };
    }),
  ).pipe(Effect.ensuring(Effect.sync(() => input.dispose())));
});

/** A second of stereo sine at 44.1 kHz. */
const second = () => {
  const wave = Float32Array.from({ length: 44100 }, (_, i) => Math.sin(i / 7) * 0.5);
  return { rate: 44100, frames: 44100, channels: [wave, wave.slice()] };
};

const fixture = (name: string) => `${import.meta.dir}/fixtures/${name}`;

/** Media over an in-memory disk holding the fixtures and a file that is not media; the disk is there to read back. */
const MediaOnFixtures = Layer.unwrap(
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const files = new Map<string, Uint8Array>([
      ['/tone.mp3', yield* fs.readFile(fixture('tone.mp3'))],
      ['/noise.wav', text('not a sound')],
    ]);
    return Media.layer.pipe(Layer.provideMerge(memoryFileSystem(files)));
  }),
).pipe(Layer.provide(BunServices.layer));

/**
 * Media over the real disk: a joined film is written by position, straight
 * through Bun's file system, so it joins into a temporary directory.
 */
const MediaOnDisk = Layer.provideMerge(Media.layer, BunServices.layer);

/** A machine with no ffmpeg: any process a take's load or encode started would fail the test. */
const noProcesses = ChildProcessSpawner.make(() => Effect.die('a take started a process'));

/** Media over an in-memory disk holding the MP3 fixture, where no process can start. */
const MediaWithoutFfmpeg = Layer.unwrap(
  Effect.gen(function* () {
    const tone = yield* (yield* FileSystem.FileSystem).readFile(fixture('tone.mp3'));
    return Media.layer.pipe(
      Layer.provideMerge(memoryFileSystem(new Map([['/tone.mp3', tone]]))),
      Layer.provide(Layer.succeed(ChildProcessSpawner.ChildProcessSpawner, noProcesses)),
    );
  }),
).pipe(Layer.provide(BunServices.layer));

/** A sound's first channel's root mean square. */
const rms = (pcm: Pcm) => {
  const samples = pcm.channels[0] ?? new Float32Array();
  return Math.sqrt(samples.reduce((sum, s) => sum + s * s, 0) / Math.max(1, samples.length));
};

/**
 * `pcm` as an M4A: AAC in an MP4, as a phone's recorder saves it. Its
 * samples go in a frame of priming early, so the encoder's first packet sits
 * before zero, where the edit list skips it (as `Media.encodeAac` does).
 */
const m4a = (pcm: Pcm) =>
  Effect.gen(function* () {
    const target = new BufferTarget();
    const output = new Output({ format: new Mp4OutputFormat(), target });
    const source = new AudioSampleSource({ codec: 'aac', bitrate: 192_000 });
    output.addAudioTrack(source);
    yield* Effect.promise(() => output.start());
    const data = new Float32Array(pcm.frames * pcm.channels.length);
    for (const [c, plane] of pcm.channels.entries()) data.set(plane, c * pcm.frames);
    const sample = new AudioSample({
      data,
      format: 'f32-planar',
      numberOfChannels: pcm.channels.length,
      sampleRate: pcm.rate,
      timestamp: -1024 / pcm.rate,
    });
    yield* Effect.promise(() => source.add(sample));
    sample.close();
    yield* Effect.promise(() => output.finalize());
    return new Uint8Array(Option.getOrThrow(Option.fromNullishOr(target.buffer)));
  });

/** One channel of 16-bit samples as an AIFF file (big-endian, its rate an 80-bit float). */
const aiff16 = (rate: number, samples: Int16Array) => {
  const bytes = new Uint8Array(54 + samples.length * 2);
  const view = new DataView(bytes.buffer);
  const tag = (at: number, id: string) => bytes.set(new TextEncoder().encode(id), at);
  tag(0, 'FORM');
  view.setUint32(4, bytes.length - 8);
  tag(8, 'AIFF');
  tag(12, 'COMM');
  view.setUint32(16, 18);
  view.setUint16(20, 1);
  view.setUint32(22, samples.length);
  view.setUint16(26, 16);
  // The rate as an extended float: exponent, then a 64-bit mantissa with its top bit set.
  const exponent = Math.floor(Math.log2(rate));
  view.setUint16(28, 16383 + exponent);
  view.setUint32(30, rate * 2 ** (31 - exponent));
  tag(38, 'SSND');
  view.setUint32(42, 8 + samples.length * 2);
  for (const [i, s] of samples.entries()) view.setInt16(54 + i * 2, s);
  return bytes;
};

/** A directory that is gone once the scope closes. */
const tempDir = Effect.gen(function* () {
  return yield* (yield* FileSystem.FileSystem).makeTempDirectoryScoped();
});

describe('Media', () => {
  it.effect.layer(MediaOnFixtures)(
    'a WAV written reads back as the same 16-bit samples, and measures its length',
    () =>
      Effect.gen(function* () {
        const media = yield* Media;
        const frames = 70000;
        const wave = (phase: number) =>
          Float32Array.from({ length: frames }, (_, i) => Math.sin(i / 7 + phase) * 0.8);
        const pcm = { rate: 44100, frames, channels: [wave(0), wave(1)] };
        yield* media.writeWav('/out.wav', pcm);
        const back = yield* media.decode('/out.wav');
        expect([back.rate, back.frames, back.channels.length]).toEqual([44100, frames, 2]);
        expect(toInt16(back)).toEqual(toInt16(pcm));
        expect(yield* media.duration('/out.wav')).toBeCloseTo(frames / 44100, 9);
      }),
  );

  it.effect.layer(MediaOnFixtures)('an MP3 decodes gapless, and a mono one stays one channel', () =>
    Effect.gen(function* () {
      const media = yield* Media;
      const tone = yield* media.decode('/tone.mp3');
      expect([tone.rate, tone.frames, tone.channels.length]).toEqual([44100, 22050, 1]);
      expect(yield* media.duration('/tone.mp3')).toBe(0.5);
      const peak = Math.max(...(tone.channels[0] ?? []).map(Math.abs));
      expect(peak).toBeGreaterThan(0.1);
    }),
  );

  it.effect.layer(MediaOnFixtures)('a file missing or not media fails as MediaFailed', () =>
    Effect.gen(function* () {
      const media = yield* Media;
      const missing = yield* Effect.flip(media.decode('/nowhere.wav'));
      expect([missing._tag, missing.op, missing.file]).toEqual([
        'MediaFailed',
        'read',
        '/nowhere.wav',
      ]);
      const noise = yield* Effect.flip(media.decode('/noise.wav'));
      expect([noise._tag, noise.file]).toEqual(['MediaFailed', '/noise.wav']);
    }),
  );

  it.effect.layer(MediaWithoutFfmpeg)(
    'a recording at 48 kHz loads as one channel at the rate asked for, its top octave filtered, not folded down',
    () =>
      Effect.gen(function* () {
        const media = yield* Media;
        const tone = (hz: number) =>
          Float32Array.from(
            { length: 48000 },
            (_, i) => Math.sin((2 * Math.PI * hz * i) / 48000) * 0.5,
          );
        yield* media.writeWav('/voice.wav', {
          rate: 48000,
          frames: 48000,
          channels: [tone(1000), tone(1000)],
        });
        const voice = yield* media.load('/voice.wav', 44100);
        expect([voice.rate, voice.channels.length]).toEqual([44100, 1]);
        expect(Math.abs(voice.frames - 44100)).toBeLessThanOrEqual(2);
        // Two equal sides meet at libswresample's −3 dB each (ffmpeg's `-ac 1`).
        expect(rms(voice)).toBeCloseTo(0.5, 2);
        // 23.5 kHz is past 44.1 kHz's limit: filtered down (to under a tenth), not folded to
        // 20.6 kHz at nearly half its level as a linear resampler would.
        yield* media.writeWav('/high.wav', { rate: 48000, frames: 48000, channels: [tone(23500)] });
        expect(rms(yield* media.load('/high.wav', 44100))).toBeLessThan(0.035);
        const missing = yield* Effect.flip(media.load('/nowhere.m4a', 44100));
        expect([missing._tag, missing.op]).toEqual(['MediaFailed', 'read']);
      }),
  );

  it.effect.layer(MediaWithoutFfmpeg)(
    "an M4A (AAC) loads from its first frame: the encoder's priming is not in it",
    () =>
      Effect.gen(function* () {
        const media = yield* Media;
        // One click a quarter second into a second of silence at 48 kHz.
        const plane = new Float32Array(48000);
        plane[12000] = 0.9;
        yield* (yield* FileSystem.FileSystem).writeFile(
          '/click.m4a',
          yield* m4a({ rate: 48000, frames: 48000, channels: [plane] }),
        );
        const samples = (yield* media.load('/click.m4a', 44100)).channels[0] ?? new Float32Array();
        const peak = Math.max(...samples.map(Math.abs));
        const loudest = samples.findIndex((s) => Math.abs(s) === peak);
        // Frame 11025 at 44.1 kHz; the priming left in would put it 941 frames late.
        expect(Math.abs(loudest - 11025)).toBeLessThanOrEqual(3);
      }),
  );

  it.effect.layer(MediaWithoutFfmpeg)('an AIFF loads sample for sample', () =>
    Effect.gen(function* () {
      const media = yield* Media;
      const ints = Int16Array.from({ length: 5000 }, (_, i) => Math.round(Math.sin(i / 5) * 20000));
      yield* (yield* FileSystem.FileSystem).writeFile('/take.aiff', aiff16(44100, ints));
      const loaded = yield* media.load('/take.aiff', 44100);
      expect([loaded.rate, loaded.frames, loaded.channels.length]).toEqual([44100, 5000, 1]);
      expect([...(loaded.channels[0] ?? [])]).toEqual([...ints].map((s) => s / 32768));
    }),
  );

  it.effect.layer(MediaWithoutFfmpeg)('an MP3 at the rate asked for loads as it decodes', () =>
    Effect.gen(function* () {
      const media = yield* Media;
      const loaded = yield* media.load('/tone.mp3', 44100);
      expect([loaded.rate, loaded.frames, loaded.channels.length]).toEqual([44100, 22050, 1]);
      expect(loaded.channels[0]).toEqual((yield* media.decode('/tone.mp3')).channels[0]);
    }),
  );

  it.effect.layer(MediaOnDisk)('doctor finds ffmpeg', () => ffmpegReady());

  it.live.layer(MediaOnDisk)(
    'the extension encoders run in their workers and the process ends by itself',
    () =>
      Effect.gen(function* () {
        const done = yield* collectWithin(
          yield* ChildProcessSpawner.ChildProcessSpawner,
          'encode-and-exit',
          ChildProcess.make('bun', [fixture('encode-and-exit.ts')]),
          Duration.seconds(30),
        );
        expect([done.exitCode, done.stderr]).toEqual([0, '']);
        expect(done.stdout).toMatch(/^aac packets=\d+\nflac bytes=\d+$/m);
      }),
    40_000,
  );

  it.effect.layer(MediaWithoutFfmpeg)(
    "a person's take is a 24-bit FLAC master: it decodes to its samples, and measures its length",
    () =>
      Effect.gen(function* () {
        const media = yield* Media;
        const wave = Float32Array.from({ length: 30000 }, (_, i) => Math.sin(i / 9) * 0.3);
        const bytes = yield* media.encodeFlac({ rate: 44100, frames: 30000, channels: [wave] });
        expect(new TextDecoder().decode(bytes.subarray(0, 4))).toBe('fLaC');
        yield* (yield* FileSystem.FileSystem).writeFile('/take.flac', bytes);
        const back = yield* media.decode('/take.flac');
        expect([back.rate, back.frames, back.channels.length]).toEqual([44100, 30000, 1]);
        // 24 bits: every sample within two 24-bit steps (16 bits would be off by ~1.5e-5).
        const plane = back.channels[0] ?? new Float32Array();
        const worst = wave.reduce((m, s, i) => Math.max(m, Math.abs(s - (plane[i] ?? 0))), 0);
        expect(worst).toBeLessThan(2 ** -22);
        expect(yield* media.duration('/take.flac')).toBeCloseTo(30000 / 44100, 6);
      }),
  );

  it.effect.layer(MediaOnDisk)(
    'a film joins its segments in order, with the track encoded beside them from its first frame',
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const out = `${yield* tempDir}/film.mp4`;
          yield* (yield* Media).join({
            out,
            segments: [
              { file: fixture('segment-a.mp4'), at: 0 },
              { file: fixture('segment-b.mp4'), at: 0.5 },
            ],
            frames: 30,
            audio: Option.some(yield* (yield* Media).encodeAac(second())),
          });
          const [video, audio] = yield* readBack(out);
          expect([video?.type, video?.codec, audio?.type, audio?.codec]).toEqual([
            'video',
            'avc',
            'audio',
            'aac',
          ]);
          expect(video?.times.length).toBe(30);
          for (const [k, t] of (video?.times ?? []).entries()) expect(t).toBeCloseTo(k / 30, 6);
          // The priming plays before zero, where the edit list skips it: the track starts on the first frame.
          expect(audio?.times[0]).toBeCloseTo(-1024 / 44100, 6);
          expect(audio?.duration).toBeCloseTo(1, 1);
        }),
      ),
  );

  it.effect.layer(MediaOnDisk)(
    "a share copy is x264's encode of the joined film, every frame in place, its track copied",
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const dir = yield* tempDir;
          const media = yield* Media;
          const fs = yield* FileSystem.FileSystem;
          yield* media.join({
            out: `${dir}/film.mp4`,
            segments: [
              { file: fixture('segment-a.mp4'), at: 0 },
              { file: fixture('segment-b.mp4'), at: 0.5 },
            ],
            frames: 30,
            audio: Option.some(yield* media.encodeAac(second())),
          });
          yield* media.shareCopy(`${dir}/film.mp4`, `${dir}/film.share.mp4`);
          const [video, audio] = yield* readBack(`${dir}/film.share.mp4`);
          expect([video?.codec, audio?.codec]).toEqual(['avc', 'aac']);
          expect(video?.times.length).toBe(30);
          expect(video?.duration).toBeCloseTo(1, 1);
          expect(audio?.duration).toBeCloseTo(1, 1);
          // Nothing else is left beside it.
          expect([...(yield* fs.readDirectory(dir))].sort()).toEqual([
            'film.mp4',
            'film.share.mp4',
          ]);
        }),
      ),
  );

  it.effect.layer(MediaOnDisk)(
    'a mix written as an m4a is AAC in an MP4 a phone streams, and measures its length',
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const media = yield* Media;
          const file = `${yield* tempDir}/mix.m4a`;
          yield* media.writeAac(file, second());
          const [track, ...rest] = yield* readBack(file);
          expect(rest).toEqual([]);
          expect([track?.type, track?.codec]).toEqual(['audio', 'aac']);
          expect(yield* media.duration(file)).toBeCloseTo(1, 1);
          // Fast start: the index (moov) comes before the samples (mdat).
          const head = new TextDecoder('latin1').decode(
            (yield* (yield* FileSystem.FileSystem).readFile(file)).subarray(0, 4096),
          );
          const moov = head.indexOf('moov');
          expect(moov).toBeGreaterThan(-1);
          expect(moov).toBeLessThan(head.indexOf('mdat'));
        }),
      ),
  );

  it.effect.layer(MediaOnDisk)("a review's still is a JPEG, and its phone copy an MP4", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const media = yield* Media;
        const fs = yield* FileSystem.FileSystem;
        const dir = yield* tempDir;
        yield* media.still(fixture('segment-a.mp4'), 0.2, 32, `${dir}/still.jpg`);
        expect([...(yield* fs.readFile(`${dir}/still.jpg`)).subarray(0, 2)]).toEqual([0xff, 0xd8]);
        yield* media.phoneCopy(fixture('segment-a.mp4'), `${dir}/phone.mp4`);
        const [video] = yield* readBack(`${dir}/phone.mp4`);
        expect([video?.type, video?.codec]).toEqual(['video', 'avc']);
      }),
    ),
  );

  it.effect.layer(MediaOnDisk)('a video measures by its container, read where it lies', () =>
    Effect.gen(function* () {
      expect(yield* (yield* Media).duration(fixture('segment-a.mp4'))).toBeCloseTo(0.5, 2);
    }),
  );

  it.effect.layer(MediaOnDisk)('a share copy that fails leaves no file behind', () =>
    Effect.scoped(
      Effect.gen(function* () {
        const dir = yield* tempDir;
        const error = yield* Effect.flip(
          (yield* Media).shareCopy('/nonexistent/film-probe-x.mp4', `${dir}/x.share.mp4`),
        );
        expect([error._tag, error.op]).toEqual(['MediaFailed', 'encode']);
        expect(yield* (yield* FileSystem.FileSystem).readDirectory(dir)).toEqual([]);
      }),
    ),
  );

  it.effect.layer(MediaOnDisk)('a film with no track has video only', () =>
    Effect.scoped(
      Effect.gen(function* () {
        const out = `${yield* tempDir}/silent.mp4`;
        yield* (yield* Media).join({
          out,
          segments: [{ file: fixture('segment-a.mp4'), at: 0 }],
          frames: 15,
          audio: Option.none(),
        });
        expect((yield* readBack(out)).map((t) => t.type)).toEqual(['video']);
      }),
    ),
  );

  it.effect.layer(MediaOnDisk)('a segment encoded unlike the first fails the join', () =>
    Effect.scoped(
      Effect.gen(function* () {
        const error = yield* Effect.flip(
          (yield* Media).join({
            out: `${yield* tempDir}/mixed.mp4`,
            segments: [
              { file: fixture('segment-a.mp4'), at: 0 },
              { file: fixture('segment-wide.mp4'), at: 0.5 },
            ],
            frames: 30,
            audio: Option.none(),
          }),
        );
        expect([error._tag, error.op, error.file]).toEqual([
          'MediaFailed',
          'join',
          fixture('segment-wide.mp4'),
        ]);
      }),
    ),
  );
});
