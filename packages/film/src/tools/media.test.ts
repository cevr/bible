// Media over the in-memory file system, with the real mediabunny and mpg123:
// a WAV written reads back as the same 16-bit samples, an MP3 decodes gapless
// (its encoder padding trimmed, a mono file one channel), and a file that is
// missing or not media fails as MediaFailed. fixtures/tone.mp3 is half a
// second of 440 Hz, mono, 44.1 kHz, with a LAME gapless header.

import { BunServices } from '@effect/platform-bun';
import { describe, expect, it } from 'effect-bun-test';
import { Effect, FileSystem, Layer } from 'effect';
import { toInt16 } from '../core/audio.ts';
import { Media } from './media.ts';
import { memoryFileSystem, text } from './testing.ts';

/** Media over an in-memory disk holding the tone and a file that is not media. */
const MediaOnFixtures = Layer.unwrap(
  Effect.gen(function* () {
    const tone = yield* (yield* FileSystem.FileSystem).readFile(
      `${import.meta.dir}/fixtures/tone.mp3`,
    );
    const files = new Map<string, Uint8Array>([
      ['/tone.mp3', tone],
      ['/noise.wav', text('not a sound')],
    ]);
    return Media.layer.pipe(Layer.provide(memoryFileSystem(files)));
  }),
).pipe(Layer.provide(BunServices.layer));

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
        expect(yield* media.tracks('/out.wav')).toEqual(['audio']);
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
});
