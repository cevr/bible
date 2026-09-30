// `measure` answers in one measurement how wide `write` sets a line glyph by
// glyph, so a plate or a wrap sized by it fits the lettering exactly: kerned,
// tracked, and with combining marks kept on their letter.

import { describe, expect, test } from 'bun:test';
import { recorder } from './fixtures/stand-in.ts';
import { type Probe, probing } from './probe.ts';
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

/** The stand-in, measuring with `kerned` in its current font. */
const context = (): CanvasRenderingContext2D => recorder(1920, 1080, { measure: kerned }).ctx;

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

/**
 * The stand-in, measuring with `kerned`, counting the glyphs filled and
 * outlined and the clips set (`onCall`), and keeping each outline's width.
 */
const counting = () => {
  const drawn = { fill: 0, outline: 0, clips: 0 };
  const widths: number[] = [];
  let lineWidth = 1;
  const { ctx } = recorder(1920, 1080, {
    measure: kerned,
    onCall: (key, args) => {
      if (key === 'lineWidth') lineWidth = Number(args[0]);
      if (key === 'fillText') drawn.fill++;
      if (key === 'strokeText') {
        drawn.outline++;
        widths.push(lineWidth);
      }
      if (key === 'clip') drawn.clips++;
    },
  });
  return { ctx, drawn, widths };
};

const probe = (): Probe => ({ sink: { texts: [], inks: [] }, scene: 'a', dx: 0, alpha: 1 });

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

  test('a line that draws nothing is not recorded as text', () => {
    const { ctx } = counting();
    const p = probe();
    probing(ctx, p, () => write(ctx, 'Just', 0, 0, style, hand, { fill: 0 }));
    expect(p.sink.texts).toEqual([]);
  });

  test('a fill that is not a number reads as empty, not as unfilled glyphs', () => {
    const { ctx, drawn, widths } = counting();
    write(ctx, 'Just', 0, 0, style, hand, { outline: 3, fill: Number.NaN });
    expect(drawn).toEqual({ fill: 0, outline: 4, clips: 0 });
    expect(widths).toEqual([3, 3, 3, 3]);
  });

  test('right-to-left text is drawn hollow and part filled too', () => {
    const hollow = counting();
    write(hollow.ctx, 'שלום', 0, 0, style, hand, { outline: 3, fill: 0 });
    expect(hollow.drawn).toMatchObject({ fill: 0, outline: 1 });
    const part = counting();
    write(part.ctx, 'שלום', 0, 0, style, hand, { outline: 3, fill: 0.4 });
    expect(part.drawn).toMatchObject({ fill: 1, outline: 1 });
    expect(part.drawn.clips).toBe(2);
  });

  test('the outline thins to nothing as the fill completes, with no step at either end', () => {
    const at = (fill: number) => {
      const { ctx, widths } = counting();
      write(ctx, 'J', 0, 0, style, hand, { outline: 3, fill });
      return widths[0] ?? 0;
    };
    expect(at(1)).toBe(0);
    expect(at(0.999)).toBeLessThan(0.1);
    expect(at(0)).toBe(3);
    expect(at(0.5)).toBe(3);
  });
});
