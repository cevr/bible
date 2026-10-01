import { describe, expect, test } from 'bun:test';
import { column, house } from './build.ts';
import { recorder } from './fixtures/stand-in.ts';

describe('painted architecture', () => {
  test('casts a column shadow away from either key direction', () => {
    for (const side of [1, -1] as const) {
      const r = recorder();
      column(r.ctx, {
        x: 200,
        y: 400,
        w: 40,
        h: 100,
        stone: '#aaa088',
        light: { side, key: '#f2c58b', shade: '#163d4b' },
      });
      const shadow = r.fills.at(-1);
      expect(shadow?.rect[0]).toBe(side === 1 ? 200 : 150);
      expect(shadow?.style).toMatchObject({
        _tag: 'Linear',
        line: [200, 400, 200 + side * 50, 400],
      });
    }
  });

  test('preserves the caller state when scenery is drawn inside a faded plane', () => {
    const r = recorder();
    r.ctx.globalAlpha = 0.37;
    r.ctx.fillStyle = '#aabbcc';
    r.ctx.globalCompositeOperation = 'screen';
    r.ctx.translate(25, 40);
    const before = r.now();
    const light = { side: 1, key: '#f2c58b', shade: '#163d4b' } as const;
    house(r.ctx, { x: 200, y: 400, w: 100, h: 150, side: 20, wall: '#aaa088', light });
    column(r.ctx, { x: 200, y: 400, w: 40, h: 100, stone: '#aaa088', light });
    expect(r.ctx.globalAlpha).toBe(0.37);
    expect(r.ctx.fillStyle).toBe('#aabbcc');
    expect(r.ctx.globalCompositeOperation).toBe('screen');
    expect(r.now()).toEqual(before);
  });
});
