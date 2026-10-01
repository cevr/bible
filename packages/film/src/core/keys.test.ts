// The keys paid assets are kept under: a take is named by its voice's key and
// its words' hash, a score by its plan's key, and timings.json is read and
// written byte for byte. A codec or key change that moved one byte would
// orphan every committed take and score, so each is pinned to the value it
// was committed with, on a three-beat fixture (`fixtures/tiny-timings.json`).

import { BunServices } from '@effect/platform-bun';
import { describe, expect, it } from 'effect-bun-test';
import { Effect, FileSystem, Path, Result, Schema } from 'effect';
import { layout } from './layout.ts';
import { hashText, parse, takeScript, voiceKey } from './narration.ts';
import { type Music, TimingsJson, Voice } from './schema.ts';
import { musicKey, musicPlan } from './sound.ts';

/** The fixture's three beats, as its script says them. */
const scenes = [
  { id: 'open', say: 'A small page {begins}begins here.', min: 3.5 },
  { id: 'turn', say: 'Then the {page}page turns over.' },
  { id: 'close', say: 'And it ends.' },
];

/** The fixture's reader. */
const voice: typeof Voice.Encoded = {
  voiceId: 'fixture-voice',
  model: 'eleven_v3',
  settings: { stability: 0.5, similarity_boost: 0.75, style: 0, speed: 1 },
};

/** The fixture's one score option, in two movements. */
const piano: Music = {
  model: 'music_v2_5',
  styles: ['instrumental', 'felt piano'],
  avoid: ['vocals'],
  movements: [
    { from: 'open', name: 'The page', styles: ['quiet', 'searching'] },
    { from: 'turn', name: 'The turn', styles: ['resolved'] },
  ],
};

/** The fixture's timings.json, as committed. */
const committed = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  return yield* fs.readFileString(path.join(import.meta.dir, 'fixtures', 'tiny-timings.json'));
});

describe('the keys of paid assets', () => {
  it.effect.layer(BunServices.layer)('timings.json decodes and re-encodes byte for byte', () =>
    Effect.gen(function* () {
      const text = yield* committed;
      const timings = yield* Schema.decodeEffect(TimingsJson)(text);
      expect(yield* Schema.encodeEffect(TimingsJson)(timings)).toBe(text);
    }),
  );

  it.effect.layer(BunServices.layer)('the voice and every take keep their committed keys', () =>
    Effect.gen(function* () {
      const timings = yield* Schema.decodeEffect(TimingsJson)(yield* committed);
      expect(voiceKey(yield* Schema.decodeEffect(Voice)(voice))).toBe(timings.voice);
      // Pinned, not recomputed: a change to the take hash would orphan every take.
      expect(timings.scenes['open']?.hash).toBe('af95d9f8');
      for (const scene of scenes)
        expect(timings.scenes[scene.id]?.hash).toBe(
          hashText(takeScript(Result.getOrThrow(parse(scene.id, scene.say)))),
        );
    }),
  );

  it.effect.layer(BunServices.layer)('the score keeps the key of its committed asset', () =>
    Effect.gen(function* () {
      const timings = yield* Schema.decodeEffect(TimingsJson)(yield* committed);
      const plan = yield* Effect.fromResult(
        musicPlan(piano, Result.getOrThrow(layout(scenes, timings))),
      );
      expect(musicKey(piano, plan)).toBe('20920098');
    }),
  );
});
