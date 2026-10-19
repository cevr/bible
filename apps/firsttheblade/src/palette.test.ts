import { BunServices } from '@effect/platform-bun';
import { describe, expect, it } from 'effect-bun-test';
import { Effect, FileSystem, Path } from 'effect';

import { PALETTE, type Role } from './palette.ts';

const test = it.effect.layer(BunServices.layer);

const stylesheet = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const css = yield* fs.readFileString(path.join(import.meta.dir, 'styles.css'));
  const open = css.indexOf(':root {');
  const close = css.indexOf('}', open);
  return { root: css.slice(open, close), rest: css.slice(close) };
});

/** `--color-night-ink` as the palette names its role: `nightInk`. */
const roleOf = (token: string) =>
  token.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase());

describe('the colours', () => {
  test('every colour the stylesheet names is palette 09’s, at its value', () =>
    Effect.gen(function* () {
      const { root } = yield* stylesheet;
      const tokens = [...root.matchAll(/--color-([a-z-]+):\s*(#[0-9a-f]{6});/g)];
      expect(tokens.length).toBeGreaterThan(0);
      for (const [, token = '', value = ''] of tokens) {
        const role = roleOf(token);
        expect(role in PALETTE).toBe(true);
        expect(value).toBe(PALETTE[role as Role]);
      }
    }));

  test('the stylesheet sets no colour outside its tokens', () =>
    Effect.gen(function* () {
      const { rest } = yield* stylesheet;
      expect(rest.match(/#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?|oklch)\(/gi) ?? []).toEqual([]);
    }));
});
