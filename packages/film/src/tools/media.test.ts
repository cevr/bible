// Media with the real mediabunny, mpg123, FFmpeg (NodeAV) and the AAC and
// FLAC encoders, reading over the in-memory file system and joining films on
// the real disk: a WAV written reads back as the same 16-bit samples, an MP3
// decodes gapless (its encoder padding trimmed, a mono file one channel), a
// person's recording (WAV, M4A, AIFF, MP3) loads and its take encodes, a film
// joins from its segments with its track (and a failed join leaves the file
// that was there), a share copy is made and re-muxes with a new track, a
// still and a phone copy are made, and a
// file that is missing or not media fails as MediaFailed. fixtures/tone.mp3 is half a second of
// 440 Hz, mono, 44.1 kHz, with a LAME gapless header. fixtures/segment-*.mp4
// are fifteen frames of H.264 at 30 fps each, encoded in headless Chromium as
// a render encodes a chunk: `a` and `b` 64 × 64, `wide` 96 × 64.

import { BunServices } from '@effect/platform-bun';
import { describe, expect, it } from 'effect-bun-test';
import { Array as Arr, Duration, Effect, FileSystem, Layer, Option, Order, Stream } from 'effect';
import { ChildProcess, ChildProcessSpawner } from 'effect/process';
import {
  ALL_FORMATS,
  AudioSample,
  AudioSampleSource,
  BufferSource,
  BufferTarget,
  EncodedPacketSink,
  FilePathSource,
  FilePathTarget,
  Input,
  Mp4OutputFormat,
  Output,
  Quality,
  VideoSample,
  VideoSampleSink,
  VideoSampleSource,
} from 'mediabunny';
import { type Pcm, toInt16 } from '../core/audio.ts';
import { ratedVideo } from '../lab/fixtures/rated-video.ts';
import type { RatedTiming } from '../lab/fixtures/rated-video.ts';
import { Media } from './media.ts';
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

/** Media over an in-memory disk holding the MP3 fixture. */
const MediaWithTone = Layer.unwrap(
  Effect.gen(function* () {
    const tone = yield* (yield* FileSystem.FileSystem).readFile(fixture('tone.mp3'));
    return Media.layer.pipe(Layer.provideMerge(memoryFileSystem(new Map([['/tone.mp3', tone]]))));
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

/** The phone copy's height: a clip this high keeps its size, so its frames compare pixel for pixel. */
const PHONE_TALL = 720;
/** Its width: narrow, so x264 has little to encode and the case stays quick. */
const PHONE_NARROW = 64;

/**
 * A clip `PHONE_NARROW` × `PHONE_TALL` whose every frame holds detail of its
 * own, as a render's grain, dither or crawling hatching does: one seeded
 * texture under grain drawn fresh each frame, and a bar moving down it,
 * `frames` at 30 a second, encoded by x264 near losslessly (quantizer 8).
 * Its frames follow on from one another (no cut), so an encoder places its
 * key frames by its own rhythm.
 */
const grainyClip = (file: string, frames: number) =>
  Effect.gen(function* () {
    const output = new Output({ format: new Mp4OutputFormat(), target: new FilePathTarget(file) });
    const source = new VideoSampleSource({ codec: 'avc', quality: new Quality({ quantizer: 8 }) });
    output.addVideoTrack(source, { frameRate: 30 });
    yield* Effect.promise(() => output.start());
    let seed = 7;
    const next = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    const luma = PHONE_NARROW * PHONE_TALL;
    const texture = Uint8Array.from({ length: luma }, () => 48 + Math.floor(next() * 160));
    for (const k of Arr.range(0, frames - 1)) {
      const data = new Uint8Array(luma * 1.5).fill(128);
      for (const i of Arr.range(0, luma - 1)) {
        const row = Math.floor(i / PHONE_NARROW);
        const grain = Math.floor((next() - 0.5) * 80);
        // The bar is white (255), above any grain on the texture (248 at most).
        const bar = Number(Math.abs(row - k * 8) < 24) * 255;
        data[i] = Math.max(bar, (texture[i] ?? 128) + grain);
      }
      const sample = new VideoSample(data, {
        format: 'I420',
        codedWidth: PHONE_NARROW,
        codedHeight: PHONE_TALL,
        timestamp: k / 30,
        duration: 1 / 30,
      });
      yield* Effect.promise(() => source.add(sample));
      sample.close();
    }
    yield* Effect.promise(() => output.finalize());
  });

/** Each frame of `file`'s video, in order of showing, as its luma plane (`PHONE_NARROW` wide), and its key frames' times. */
const lumas = Effect.fn('test.lumas')(function* (file: string) {
  const input = new Input({ source: new FilePathSource(file), formats: ALL_FORMATS });
  const track = yield* Effect.flatMap(
    Effect.promise(() => input.getPrimaryVideoTrack()),
    (found) => Effect.orDie(Effect.fromOption(Option.fromNullishOr(found))),
  );
  const pictures = yield* Stream.fromAsyncIterable(
    new VideoSampleSink(track).samples(),
    String,
  ).pipe(
    Stream.mapEffect((sample) =>
      Effect.gen(function* () {
        const bytes = new Uint8Array(sample.allocationSize());
        const [plane] = yield* Effect.promise(() => sample.copyTo(bytes));
        sample.close();
        const { offset = 0, stride = PHONE_NARROW } = plane ?? {};
        return Uint8Array.from({ length: PHONE_NARROW * PHONE_TALL }, (_, i) => {
          const row = Math.floor(i / PHONE_NARROW);
          return bytes[offset + row * stride + (i % PHONE_NARROW)] ?? 0;
        });
      }),
    ),
    Stream.runCollect,
    Effect.orDie,
  );
  const keys = yield* Stream.fromAsyncIterable(new EncodedPacketSink(track).packets(), String).pipe(
    Stream.filter((packet) => packet.type === 'key'),
    Stream.map((packet) => packet.timestamp),
    Stream.runCollect,
    Effect.orDie,
  );
  input.dispose();
  return { pictures: [...pictures], keys: Arr.sort([...keys], Order.Number) };
});

/** How near picture `a` is to `b`: the PSNR of their lumas, in dB. */
const psnr = (a: Uint8Array, b: Uint8Array) => {
  const squared = a.reduce((sum, v, i) => sum + (v - (b[i] ?? 0)) ** 2, 0) / a.length;
  return 10 * Math.log10((255 * 255) / Math.max(squared, 1e-9));
};

/** A directory that is gone once the scope closes. */
const tempDir = Effect.gen(function* () {
  return yield* (yield* FileSystem.FileSystem).makeTempDirectoryScoped();
});

describe.concurrent('Media', () => {
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
        expect((yield* media.timing('/out.wav')).seconds).toBeCloseTo(frames / 44100, 9);
      }),
  );

  it.effect.layer(MediaOnFixtures)('an MP3 decodes gapless, and a mono one stays one channel', () =>
    Effect.gen(function* () {
      const media = yield* Media;
      const tone = yield* media.decode('/tone.mp3');
      expect([tone.rate, tone.frames, tone.channels.length]).toEqual([44100, 22050, 1]);
      expect((yield* media.timing('/tone.mp3')).seconds).toBe(0.5);
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

  it.effect.layer(MediaWithTone)(
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
        // Two equal sides meet at libswresample's −3 dB each.
        expect(rms(voice)).toBeCloseTo(0.5, 2);
        // 23.5 kHz is past 44.1 kHz's limit: filtered down (to under a tenth), not folded to
        // 20.6 kHz at nearly half its level as a linear resampler would.
        yield* media.writeWav('/high.wav', { rate: 48000, frames: 48000, channels: [tone(23500)] });
        expect(rms(yield* media.load('/high.wav', 44100))).toBeLessThan(0.035);
        const missing = yield* Effect.flip(media.load('/nowhere.m4a', 44100));
        expect([missing._tag, missing.op]).toEqual(['MediaFailed', 'read']);
      }),
  );

  it.effect.layer(MediaWithTone)(
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

  it.effect.layer(MediaWithTone)('an AIFF loads sample for sample', () =>
    Effect.gen(function* () {
      const media = yield* Media;
      const ints = Int16Array.from({ length: 5000 }, (_, i) => Math.round(Math.sin(i / 5) * 20000));
      yield* (yield* FileSystem.FileSystem).writeFile('/take.aiff', aiff16(44100, ints));
      const loaded = yield* media.load('/take.aiff', 44100);
      expect([loaded.rate, loaded.frames, loaded.channels.length]).toEqual([44100, 5000, 1]);
      expect([...(loaded.channels[0] ?? [])]).toEqual([...ints].map((s) => s / 32768));
    }),
  );

  it.effect.layer(MediaWithTone)('an MP3 at the rate asked for loads as it decodes', () =>
    Effect.gen(function* () {
      const media = yield* Media;
      const loaded = yield* media.load('/tone.mp3', 44100);
      expect([loaded.rate, loaded.frames, loaded.channels.length]).toEqual([44100, 22050, 1]);
      expect(loaded.channels[0]).toEqual((yield* media.decode('/tone.mp3')).channels[0]);
    }),
  );

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

  it.effect.layer(MediaWithTone)(
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
        expect((yield* media.timing('/take.flac')).seconds).toBeCloseTo(30000 / 44100, 6);
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
    "a share copy is x264's encode of the joined film, in-process, every frame in place, its track copied",
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
    "a share copy re-muxes with a new track: x264's reordered frames and the track reach the file side by side",
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const dir = yield* tempDir;
          const media = yield* Media;
          // Two seconds: past x264's first reordered frames, where a re-mux that
          // wrote every video packet before the track's first one failed.
          const wave = Float32Array.from({ length: 88200 }, (_, i) => Math.sin(i / 7) * 0.5);
          const track = (gain: number) =>
            media.encodeAac({ rate: 44100, frames: 88200, channels: [wave.map((s) => s * gain)] });
          yield* media.join({
            out: `${dir}/film.mp4`,
            segments: [
              { file: fixture('segment-a.mp4'), at: 0 },
              { file: fixture('segment-b.mp4'), at: 0.5 },
              { file: fixture('segment-a.mp4'), at: 1 },
              { file: fixture('segment-b.mp4'), at: 1.5 },
            ],
            frames: 60,
            audio: Option.some(yield* track(1)),
          });
          yield* media.shareCopy(`${dir}/film.mp4`, `${dir}/film.share.mp4`);
          yield* media.remux(`${dir}/film.share.mp4`, yield* track(0.5));
          const [video, audio] = yield* readBack(`${dir}/film.share.mp4`);
          expect([video?.codec, audio?.codec]).toEqual(['avc', 'aac']);
          expect(video?.times.length).toBe(60);
          expect(audio?.duration).toBeCloseTo(2, 1);
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
          expect((yield* media.timing(file)).seconds).toBeCloseTo(1, 1);
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

  it.effect.layer(MediaOnDisk)(
    "a review's still is a JPEG, and its phone copy an MP4 its source's size or less",
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const media = yield* Media;
          const fs = yield* FileSystem.FileSystem;
          const dir = yield* tempDir;
          yield* media.still(fixture('segment-a.mp4'), 0.2, 32, `${dir}/still.jpg`);
          expect([...(yield* fs.readFile(`${dir}/still.jpg`)).subarray(0, 2)]).toEqual([
            0xff, 0xd8,
          ]);
          yield* media.phoneCopy(fixture('segment-a.mp4'), `${dir}/phone.mp4`);
          const [video] = yield* readBack(`${dir}/phone.mp4`);
          expect([video?.type, video?.codec]).toEqual(['video', 'avc']);
          // A 64-pixel video under the copy's 720 lines keeps its own size.
          const copy = new Input({
            source: new FilePathSource(`${dir}/phone.mp4`),
            formats: ALL_FORMATS,
          });
          const track = yield* Effect.promise(() => copy.getPrimaryVideoTrack());
          expect([track?.displayWidth, track?.displayHeight]).toEqual([64, 64]);
        }),
      ),
  );

  it.effect.layer(MediaOnDisk)(
    "a phone copy shows every frame's own picture however fine its detail, and a seek in it decodes at most a second",
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const dir = yield* tempDir;
          const frames = 60;
          yield* grainyClip(`${dir}/grain.mp4`, frames);
          yield* (yield* Media).phoneCopy(`${dir}/grain.mp4`, `${dir}/phone.mp4`);
          const made = yield* lumas(`${dir}/grain.mp4`);
          const copy = yield* lumas(`${dir}/phone.mp4`);
          expect(copy.pictures.length).toBe(frames);
          // A frame the encode starved shows the picture before it (or a blend
          // of its neighbours): nearer the frame before than its own.
          const behind = Arr.range(1, frames - 1).filter((k) => {
            const shown = copy.pictures[k] ?? new Uint8Array();
            const own = psnr(shown, made.pictures[k] ?? new Uint8Array());
            return own <= psnr(shown, made.pictures[k - 1] ?? new Uint8Array());
          });
          expect(behind).toEqual([]);
          // A seek starts decoding at the key frame at or before it.
          const spans = Arr.zipWith(
            [...copy.keys, frames / 30],
            [-1, ...copy.keys],
            (b, a) => b - a,
          );
          expect(copy.keys[0]).toBe(0);
          expect(spans.filter((span) => span > 1 + 1e-6)).toEqual([]);
        }),
      ),
  );

  it.effect.layer(MediaOnDisk)('a video measures by its container, read where it lies', () =>
    Effect.gen(function* () {
      expect((yield* (yield* Media).timing(fixture('segment-a.mp4'))).seconds).toBeCloseTo(0.5, 2);
    }),
  );

  it.effect.layer(MediaOnDisk)(
    "a video's timing is its length and its own frame rate, never rounded: none for a file with no video",
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const media = yield* Media;
          const fs = yield* FileSystem.FileSystem;
          const dir = yield* tempDir;
          const rateAt = Effect.fn('Media.test.rateAt')(function* (fps: number) {
            const file = `${dir}/rated-${fps}.mp4`;
            yield* fs.writeFile(file, yield* ratedVideo(fps, 60));
            return (yield* media.timing(file)).fps;
          });
          expect(yield* rateAt(24)).toEqual(Option.some(24));
          expect(yield* rateAt(30000 / 1001)).toEqual(Option.some(30000 / 1001));
          expect(yield* rateAt(24000 / 1001)).toEqual(Option.some(24000 / 1001));
          expect(yield* rateAt(12.5)).toEqual(Option.some(12.5));
          const film = yield* media.timing(fixture('segment-a.mp4'));
          expect(film.fps).toEqual(Option.some(30));
          expect(film.seconds).toBeCloseTo(0.5, 2);
          expect((yield* media.timing(fixture('tone.mp3'))).fps).toEqual(Option.none());
          const missing = yield* Effect.flip(media.timing(fixture('no-such.mp4')));
          expect(missing._tag).toBe('MediaFailed');
        }),
      ),
  );

  it.effect.layer(MediaOnDisk)(
    "a whole or 1000/1001 rate is taken only when its frame grid alone holds every frame's start within a step of the clock the starts sit on",
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const media = yield* Media;
          const fs = yield* FileSystem.FileSystem;
          const dir = yield* tempDir;
          /** The rate read from `frames` frames made at `fps`, timed in the file as `timing` says. */
          const rateAt = Effect.fn('Media.test.rateAt')(function* (
            fps: number,
            frames: number,
            timing?: RatedTiming,
          ) {
            const file = `${dir}/rated.mp4`;
            yield* fs.writeFile(file, yield* ratedVideo(fps, frames, timing));
            return Option.getOrThrow((yield* media.timing(file)).fps);
          });
          const ntsc = 30000 / 1001;
          const ms = { timescale: 1000 };
          // A millisecond timescale, each start rounded to its millisecond: 30's
          // grid holds 23 frames' starts within a millisecond; 29.97's drifts
          // 0.73 ms over them on top of the rounding, past it: 30. Truncated
          // to the millisecond (as a WebM's clock keeps them) they read 30 too.
          expect(yield* rateAt(30, 23, ms)).toBe(30);
          expect(yield* rateAt(30, 23, { ...ms, grid: 0.001 })).toBe(30);
          // At 60 fps the 120 frames drift 2 ms from 59.94's grid: each its own.
          expect(yield* rateAt(60, 120, ms)).toBe(60);
          expect(yield* rateAt(60000 / 1001, 120, ms)).toBe(60000 / 1001);
          // 29.97 and 30 over a long clip, each its own.
          expect(yield* rateAt(30, 200, ms)).toBe(30);
          expect(yield* rateAt(ntsc, 200, ms)).toBe(ntsc);
          // 23.976's frames lie halfway between two milliseconds every 24th frame,
          // and a rounding muxer sends some halves down, some up: its grid holds
          // the starts within a millisecond only with its ends, and 24's not at all.
          expect(yield* rateAt(24000 / 1001, 120, ms)).toBe(24000 / 1001);
          // Eight frames (0.23 s from first start to last) cannot tell 30 from
          // 29.97 (0.23 ms apart by then): kept as measured, taken for neither.
          expect(yield* rateAt(30, 8, ms)).toBeCloseTo(7 / 0.233, 9);
          // A fine timescale tells a rate 0.03% off 30, or halfway to 29.97, from either.
          expect(yield* rateAt(30 * (1 - 3e-4), 120)).toBeCloseTo(30 * (1 - 3e-4), 6);
          const halfway = (30 + ntsc) / 2;
          expect(yield* rateAt(halfway, 120)).toBeCloseTo(halfway, 6);
          // A millisecond clock's starts read alike on whatever timescale keeps
          // them: 1000, 16000 (a WebM's stream copy into an MP4) or 90000.
          for (const frames of [23, 50, 100]) {
            const read = new Set<number>();
            for (const timescale of [1000, 16000, 90000])
              read.add(yield* rateAt(30, frames, { timescale, grid: 0.001 }));
            expect([...read]).toEqual([30]);
          }
          // A last frame's own duration ending a 60 fps clip at 2.001 s (a tick
          // late) names no other rate: 60, never 59.94.
          expect(yield* rateAt(60, 120, { ...ms, grid: 0.001, last: 0.018 })).toBe(60);
          // Twenty frames of 29.97 on a millisecond clock whose last ends at
          // 0.666 s (1⅓ ms short): their starts drift 0.63 ms from 30's grid on
          // top of the truncation, past a millisecond, so 29.97 alone holds them.
          expect(yield* rateAt(ntsc, 20, { ...ms, grid: 0.001, last: 0.033 })).toBe(ntsc);
          // Exactly timed starts sit a frame apart on their clock, as coarse as
          // the frame of the whole rate near them: that clock cannot tell the
          // whole rate (or its 1000/1001 one) from its neighbours, so neither
          // is claimed and each reads as measured, its own rate exactly.
          for (const [fps, timescale] of [
            [0.5, 1000],
            [0.5, 16384],
            [0.5, 90000],
            [0.5, 600],
            [1.25, 1000],
            [4 / 3, 1000],
            [2.4, 90000],
            [6.25, 1000],
            [6.4, 16000],
            [12.4, 12.4],
          ] as const)
            expect(yield* rateAt(fps, 30, { timescale })).toBeCloseTo(fps, 9);
          // 0.5 fps with a start a tick late (or every inner start a tick early):
          // the clock is one tick, and 1 fps's grid holds every start within it,
          // but only on every other line of its own; a grid no two consecutive
          // starts sit on adjacent lines of is no frame grid of theirs: 0.5.
          for (const [timescale, nudge] of [
            [1000, [[7, 0.001]]],
            [90000, [[7, 1 / 90000]]],
            [1000, Arr.range(1, 28).map((frame) => [frame, -0.001] as const)],
          ] as const)
            expect(yield* rateAt(0.5, 30, { timescale, nudge })).toBeCloseTo(0.5, 9);
          // An exactly timed file with three frames dropped from its first 120
          // (its 120 starts span 122 frames), on a clock of a tick a frame too
          // (mediabunny's for a whole rate), names no whole or 1000/1001 rate a
          // frame short: kept as measured, never 29 (or 23, 24, 59, 28.97).
          for (const [fps, timescales] of [
            [30, [30, 15360, 90000]],
            [24, [24, 15360, 90000]],
            [25, [25, 90000]],
            [60, [15360, 90000]],
            [ntsc, [30000, 90000]],
          ] as const)
            for (const timescale of timescales) {
              const read = yield* rateAt(fps, 133, { timescale, drop: [30, 60, 90] });
              expect(read).toBeCloseTo((119 * fps) / 122, 9);
            }
          // One dropped frame from an exactly timed file: as measured too (its
          // clock cannot tell 30 from 29); a rounding millisecond clock tells 30.
          expect(yield* rateAt(30, 131, { timescale: 15360, drop: [50] })).toBe((119 * 30) / 120);
          expect(yield* rateAt(30, 131, { timescale: 1000, drop: [50] })).toBe(30);
          expect(yield* rateAt(ntsc, 131, { timescale: 30000, drop: [50] })).toBeCloseTo(
            (119 * ntsc) / 120,
            9,
          );
          // 90 fps on a millisecond clock kept on 15360: each start a whole 169
          // ticks (11 ms), as coarse as the frame of 90.91 (91000/1001): neither
          // 91 nor 90.91 is claimed over 8 or 9 frames, only as measured.
          for (const frames of [8, 9])
            expect(yield* rateAt(90, frames, { timescale: 15360, grid: 0.001 })).toBeCloseTo(
              15360 / 169,
              9,
            );
        }),
      ),
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

  it.effect.layer(MediaOnDisk)(
    'a join that fails leaves the film that was there, and nothing beside it',
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const media = yield* Media;
          const fs = yield* FileSystem.FileSystem;
          const dir = yield* tempDir;
          const out = `${dir}/film.mp4`;
          const film = (second: string) => ({
            out,
            segments: [
              { file: fixture('segment-a.mp4'), at: 0 },
              { file: fixture(second), at: 0.5 },
            ],
            frames: 30,
            audio: Option.none(),
          });
          yield* media.join(film('segment-b.mp4'));
          const before = yield* fs.readFile(out);
          yield* Effect.flip(media.join(film('segment-wide.mp4')));
          expect(yield* fs.readFile(out)).toEqual(before);
          expect(yield* fs.readDirectory(dir)).toEqual(['film.mp4']);
        }),
      ),
  );
});
