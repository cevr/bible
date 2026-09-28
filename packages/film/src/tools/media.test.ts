// Media with the real mediabunny, mpg123 and AAC encoder, reading over the
// in-memory file system and joining films on the real disk: a WAV written reads back as the same 16-bit samples, an MP3
// decodes gapless (its encoder padding trimmed, a mono file one channel), a
// film joins from its segments with its track, and a file that is missing or
// not media fails as MediaFailed. fixtures/tone.mp3 is half a second of
// 440 Hz, mono, 44.1 kHz, with a LAME gapless header. fixtures/segment-*.mp4
// are fifteen frames of H.264 at 30 fps each, encoded in headless Chromium as
// a render encodes a chunk: `a` and `b` 64 × 64, `wide` 96 × 64.

import { BunServices } from '@effect/platform-bun';
import { describe, expect, it } from 'effect-bun-test';
import { Effect, FileSystem, Layer, Option, Stream } from 'effect';
import { ALL_FORMATS, BufferSource, EncodedPacketSink, Input } from 'mediabunny';
import { toInt16 } from '../core/audio.ts';
import { Media } from './media.ts';
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
