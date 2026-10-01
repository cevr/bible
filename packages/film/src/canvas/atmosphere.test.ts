import { expect, test } from 'bun:test';
import { motes, rays, rain, stars } from './atmosphere.ts';
import { recorder } from './fixtures/stand-in.ts';

const alphas = (draw: (ctx: CanvasRenderingContext2D) => void, inherited: number) => {
  const r = recorder();
  const cores: number[] = [];
  r.ctx.fill = () => cores.push(r.ctx.globalAlpha);
  r.ctx.globalAlpha = inherited;
  r.ctx.fillStyle = '#123456';
  r.ctx.globalCompositeOperation = 'multiply';
  r.ctx.translate(7, 11);
  const before = r.now();
  draw(r.ctx);
  expect(r.ctx.globalAlpha).toBe(inherited);
  expect(r.ctx.fillStyle).toBe('#123456');
  expect(r.ctx.globalCompositeOperation).toBe('multiply');
  expect(r.now()).toEqual(before);
  return [...cores, ...r.fills.map((fill) => fill.alpha)];
};

for (const [name, draw] of [
  [
    'motes',
    (ctx: CanvasRenderingContext2D) =>
      motes(ctx, 2, {
        seed: 123,
        count: 24,
        box: [0, 0, 100, 100],
        size: [1, 3],
        drift: [8, 20],
        sway: 5,
        color: '#aabbcc',
        alpha: 0.6,
      }),
  ],
  [
    'rays',
    (ctx: CanvasRenderingContext2D) =>
      rays(ctx, 2, {
        seed: 123,
        count: 24,
        from: [10, 20],
        angle: 0.7,
        spread: 0.3,
        length: 100,
        width: 20,
        color: '#aabbcc',
        alpha: 0.6,
      }),
  ],
  [
    'stars',
    (ctx: CanvasRenderingContext2D) =>
      stars(ctx, 2, {
        seed: 123,
        count: 24,
        box: [0, 0, 100, 100],
        size: [1, 3],
        color: '#aabbcc',
        alpha: 0.6,
      }),
  ],
  [
    'rain',
    (ctx: CanvasRenderingContext2D) =>
      rain(ctx, 2, {
        seed: 123,
        count: 24,
        box: [0, 0, 100, 100],
        length: 20,
        width: 2,
        speed: 80,
        slant: 0.2,
        color: '#aabbcc',
        alpha: 0.6,
      }),
  ],
] as const) {
  test(`${name} respects a faded plane for cores and halos and restores caller state`, () => {
    const full = alphas(draw, 1);
    const faded = alphas(draw, 0.37);
    expect(full.length).toBeGreaterThanOrEqual(24);
    expect(faded.length).toBe(full.length);
    faded.forEach((alpha, i) => expect(alpha).toBeCloseTo((full[i] ?? 0) * 0.37, 8));
    expect(alphas(draw, 0).every((alpha) => alpha === 0)).toBe(true);
  });
}
