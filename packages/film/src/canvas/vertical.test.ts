// A vertical film's hook (`vertical.ts`), which a short and a talk both draw:
// the line set once in its font, wrapped to the layout's width and centred on
// it, shown at once, held and faded out (`hookAlpha`), and recorded as the
// caption's when probed, in page px at `k` page px per px.

import { describe, expect, test } from 'bun:test';
import { SHORT_LAYOUT, hookAlpha } from '../core/shorts.ts';
import { recorder } from './fixtures/stand-in.ts';
import type { ProbeSink } from './probe.ts';
import { verticalHook } from './vertical.ts';

const STYLE = { font: '600 60px serif', color: '#2a2520' };
const TEXT = 'Why was the law given at all, if no one could keep it?';

/** A font's box, as a canvas measures it: the stand-in measures widths alone. */
const FONT_BOX = { fontBoundingBoxAscent: 48, fontBoundingBoxDescent: 14 };

/** A stand-in page 1080 wide at `k`, logging each call it is asked to make. */
const page = (k: number) => {
  const calls: Array<string> = [];
  const r = recorder(1080 * k, 1920 * k, {
    measure: (_font, text) => text.length * 20,
    onCall: (key) => calls.push(String(key)),
  });
  const ctx = new Proxy(r.ctx, {
    get: (target, key) => {
      if (key !== 'measureText') return Reflect.get(target, key);
      return (text: string) => ({ ...target.measureText(text), ...FONT_BOX });
    },
    set: (target, key, value) => Reflect.set(target, key, value),
  });
  return { ctx, calls };
};

/** The hook drawn at `T`, probed: what it recorded. */
const probedAt = (T: number, k = 1) => {
  const { ctx, calls } = page(k);
  const sink: ProbeSink = { texts: [], inks: [] };
  verticalHook(TEXT, STYLE, k, SHORT_LAYOUT).draw(ctx, T, {
    sink,
    scene: 'one',
    dx: 0,
    alpha: 1,
    caption: true,
  });
  return { sink, calls };
};

describe('verticalHook', () => {
  test("is set in lines no wider than the layout's, centred on it, and probed as the caption's", () => {
    const { sink } = probedAt(0);
    expect(sink.texts.map((t) => t.text).join(' ')).toBe(TEXT);
    expect(sink.texts.length).toBeGreaterThan(1);
    for (const t of sink.texts) {
      expect(t.w).toBeLessThanOrEqual(SHORT_LAYOUT.hook.width);
      expect(t.x + t.w / 2).toBeCloseTo(SHORT_LAYOUT.centre, 6);
      expect(t.caption).toBe(true);
      expect(t.alpha).toBe(1);
    }
    // The block is centred on the hook's height.
    const top = Math.min(...sink.texts.map((t) => t.y));
    const bottom = Math.max(...sink.texts.map((t) => t.y + t.h));
    expect((top + bottom) / 2).toBeCloseTo(SHORT_LAYOUT.hook.y, 6);
  });

  test('is drawn at `k` page px per px', () => {
    const one = probedAt(0, 1).sink.texts;
    const two = probedAt(0, 2).sink.texts;
    expect(two.map((t) => [t.x, t.y, t.w, t.h])).toEqual(
      one.map((t) => [t.x * 2, t.y * 2, t.w * 2, t.h * 2]),
    );
  });

  test('shows at once, holds, fades by `hookAlpha`, then draws nothing', () => {
    const { hold, fade } = SHORT_LAYOUT.hook;
    const fading = hold + fade / 2;
    expect(probedAt(fading).sink.texts.map((t) => t.alpha)).toEqual(
      probedAt(0).sink.texts.map(() => hookAlpha(fading)),
    );
    const gone = probedAt(hold + fade + 0.01);
    expect(gone.sink.texts).toEqual([]);
    expect(gone.calls).not.toContain('fillText');
    const none = page(1);
    verticalHook(undefined, STYLE, 1, SHORT_LAYOUT).draw(none.ctx, 0, undefined);
    expect(none.calls).toEqual([]);
  });

  test('is measured once, on the first frame that draws it', () => {
    const { ctx, calls } = page(1);
    const hook = verticalHook(TEXT, STYLE, 1, SHORT_LAYOUT);
    hook.draw(ctx, 0, undefined);
    const first = calls.filter((c) => c === 'measureText').length;
    hook.draw(ctx, 1, undefined);
    expect(first).toBeGreaterThan(0);
    expect(calls.filter((c) => c === 'measureText').length).toBe(first);
  });
});
