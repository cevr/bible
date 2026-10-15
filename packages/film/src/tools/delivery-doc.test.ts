// The film skill's ElevenLabs delivery page says what the compiler sends: its
// worked example, compiled on every model the page names, is on the page as
// sent, so a change to either is made in both.

import { BunServices } from '@effect/platform-bun';
import { describe, expect, it } from 'effect-bun-test';
import { Effect, FileSystem, Path, Result } from 'effect';
import { compileDelivery, sentText } from '../core/delivery.ts';
import { parse } from '../core/narration.ts';

const PAGE = [
  '..',
  '..',
  '..',
  '..',
  '.claude',
  'skills',
  'film',
  'reference',
  'elevenlabs-delivery.md',
];

const EXAMPLE = 'Not {/} by works. {//1.5} By {*}faith.';
const MODELS = ['eleven_v4', 'eleven_v3', 'eleven_multilingual_v2', 'eleven_flash_v2_5'];

describe('the delivery page', () => {
  it.effect.layer(BunServices.layer)('shows its example as every model is sent it', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const page = yield* fs.readFileString(path.join(import.meta.dir, ...PAGE));
      const line = Result.getOrThrow(parse('example', EXAMPLE));
      expect(page).toContain(`\`${EXAMPLE}\``);
      const missing = MODELS.filter((model) => !page.includes(model)).concat(
        MODELS.map((model) =>
          sentText(compileDelivery(line.spoken.split(' '), line.delivery, model)),
        ).filter((sent) => !page.includes(`\`${sent}\``)),
      );
      expect(missing).toEqual([]);
    }),
  );
});
