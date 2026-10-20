import { describe, expect, it } from 'effect-bun-test';
import { Context, Effect, Exit, Layer, Option, Redacted } from 'effect';

import { layer, type Token, Tokens, type TokensService } from './tokens.ts';

const KEY = Redacted.make('11'.repeat(32));
const OTHER_KEY = Redacted.make('22'.repeat(32));

const CONFIRM: Token = { _tag: 'Confirm', subscriber: 7, issued: 1_760_000_000_000 };
const LEAVE: Token = { _tag: 'Unsubscribe', subscriber: 7 };

/** Tokens signed under another key. */
class OtherTokens extends Context.Service<OtherTokens, TokensService>()('test/OtherTokens') {}

const layerOther = Layer.effect(
  OtherTokens,
  Effect.gen(function* () {
    return yield* Tokens;
  }),
).pipe(Layer.provide(layer(OTHER_KEY)));

const test = it.effect.layer(Layer.merge(layer(KEY), layerOther));

/** `text` with the character at `index` changed (its lowest bit flipped). */
const changedAt = (text: string, index: number) =>
  `${text.slice(0, index)}${String.fromCharCode(text.charCodeAt(index) ^ 1)}${text.slice(index + 1)}`;

describe('the list tokens', () => {
  test('read back what they were signed with', () =>
    Effect.gen(function* () {
      const tokens = yield* Tokens;
      for (const token of [CONFIRM, LEAVE]) {
        expect(yield* tokens.read(yield* tokens.sign(token))).toEqual(Option.some(token));
      }
    }));

  test('read as nothing once any character is changed', () =>
    Effect.gen(function* () {
      const tokens = yield* Tokens;
      const text = yield* tokens.sign(CONFIRM);
      for (let index = 0; index < text.length; index += 1) {
        const read = yield* tokens.read(changedAt(text, index));
        expect(read).toEqual(Option.none());
      }
    }));

  test('read as nothing under another key, or when they are not tokens at all', () =>
    Effect.gen(function* () {
      const tokens = yield* Tokens;
      const other = yield* (yield* OtherTokens).sign(LEAVE);
      expect(yield* tokens.read(other)).toEqual(Option.none());
      for (const text of ['', '.', 'u.7', 'u.7.', 'u.0.abc', 'x.7.abc', 'c.7.abc', 'u.7.1.abc']) {
        expect(yield* tokens.read(text)).toEqual(Option.none());
      }
    }));

  test('are refused a key shorter than 32 bytes', () =>
    Effect.gen(function* () {
      const exit = yield* Effect.exit(
        Effect.scoped(Layer.build(layer(Redacted.make('ab'.repeat(16))))),
      );
      expect(Exit.isFailure(exit)).toBe(true);
    }));
});
