// The Transcript's words scroll in a box the column clips at its edge, so
// its focus shows the kit's ring inside that edge (`--focus-ring-inset`,
// design language §4: "the same ring inside its edge"). The same ring is
// `--focus-ring` with each of its layers drawn inset: the 1 px gap of the
// ground at the edge, then the 2 px accent band, inside it as the kit's
// stands outside.

import { BunServices } from '@effect/platform-bun';
import { describe, expect, it } from 'effect-bun-test';
import { Effect, FileSystem } from 'effect';

/** The studio's tokens. */
const TOKENS = `${import.meta.dir}/../../player/tokens.css`;

/** The layers of shadow token `name` in `css`, each with its spaces as one. */
const layers = (css: string, name: string) =>
  (new RegExp(`${name}:([^;]*);`).exec(css)?.[1] ?? '')
    .split(',')
    .map((layer) => layer.trim().replace(/\s+/g, ' '))
    .filter((layer) => layer !== '');

describe("the Transcript's focus ring", () => {
  it.effect("is the kit's ring, each layer inside the edge as the kit's stands outside it", () =>
    Effect.gen(function* () {
      const css = yield* (yield* FileSystem.FileSystem).readFileString(TOKENS);
      const ring = layers(css, '--focus-ring');
      expect(ring).toEqual(['0 0 0 1px var(--surface-0)', '0 0 0 3px var(--accent)']);
      expect(layers(css, '--focus-ring-inset')).toEqual(ring.map((layer) => `inset ${layer}`));
    }).pipe(Effect.provide(BunServices.layer)),
  );
});
