// `measure` answers in one measurement how wide `write` sets a line glyph by
// glyph, so a plate or a wrap sized by it fits the lettering exactly: kerned,
// tracked, and with combining marks kept on their letter.

import { describe, expect, test } from 'bun:test';
import { Schema } from 'effect';
import { measure, write } from './type.ts';

/** Kerned advances: every glyph 0.55 em, and "AV" pulls together by 0.08 em. */
const kerned = (font: string, text: string) => {
  const size = Number(/(\d+)px/.exec(font)?.[1] ?? 10);
  const letters = text.normalize('NFC').replace(/\p{M}/gu, '');
  let width = letters.length * 0.55 * size;
  for (let i = 1; i < letters.length; i++)
    if (letters[i - 1] === 'A' && letters[i] === 'V') width -= 0.08 * size;
  return width;
};

/**
 * A stand-in context (bun has no canvas): it measures with `kerned` in its
 * current font and ignores every draw call.
 */
const context = (): CanvasRenderingContext2D => {
  const state = { font: '10px x', globalAlpha: 1 };
  const ctx = new Proxy(state, {
    get: (target, key) =>
      key === 'measureText'
        ? (text: string) => ({ width: kerned(target.font, text) })
        : key in target
          ? target[key as keyof typeof target]
          : () => undefined,
    set: (target, key, value) => Reflect.set(target, key, value),
  });
  return Schema.decodeSync(Schema.Any)(ctx);
};

const hand = { boil: 0, seed: 1 };

describe('measure', () => {
  test.each([
    ['AVATAR', 0],
    ['AVATAR', 0.12],
    ['a line of words', 0.3],
    ['été', 0.1],
    ['A', 0.5],
    ['', 0.2],
  ])('is the width write sets for %p tracked %p em', (text, tracking) => {
    const style = { family: 'x', size: 40, color: '#000', tracking };
    const ctx = context();
    expect(measure(ctx, text, style)).toBeCloseTo(write(ctx, text, 0, 0, style, hand), 9);
  });
});

/** A stand-in context that counts the glyphs filled and outlined, and the clips set. */
const counting = () => {
  const drawn = { fill: 0, outline: 0, clips: 0 };
  const state = { font: '10px x', globalAlpha: 1 };
  const ctx = new Proxy(state, {
    get: (target, key) => {
      if (key === 'measureText') return (text: string) => ({ width: kerned(target.font, text) });
      if (key === 'fillText') return () => drawn.fill++;
      if (key === 'strokeText') return () => drawn.outline++;
      if (key === 'clip') return () => drawn.clips++;
      return key in target ? target[key as keyof typeof target] : () => undefined;
    },
    set: (target, key, value) => Reflect.set(target, key, value),
  });
  return { ctx: Schema.decodeSync(Schema.Any)(ctx), drawn };
};

describe('write: hollow letters', () => {
  const style = { family: 'x', size: 40, color: '#000' };

  test('solid by default: every glyph filled, none outlined', () => {
    const { ctx, drawn } = counting();
    write(ctx, 'Just', 0, 0, style, hand, { reveal: 'rise' });
    expect(drawn).toEqual({ fill: 4, outline: 0, clips: 0 });
  });

  test('an outline with no fill draws each glyph hollow', () => {
    const { ctx, drawn } = counting();
    write(ctx, 'Just', 0, 0, style, hand, { reveal: 'rise', outline: 3, fill: 0 });
    expect(drawn).toEqual({ fill: 0, outline: 4, clips: 0 });
  });

  test('part filled: each glyph filled below its level and outlined', () => {
    const { ctx, drawn } = counting();
    write(ctx, 'Just', 0, 0, style, hand, { reveal: 'rise', outline: 3, fill: 0.4 });
    expect(drawn).toEqual({ fill: 4, outline: 4, clips: 4 });
  });
});
