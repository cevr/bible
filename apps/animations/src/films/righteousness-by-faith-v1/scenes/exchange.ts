import {
  at,
  cutout,
  type Frame,
  type Pt,
  line,
  rectShape,
  stroke,
  write,
} from '@bible/film/canvas';
import { hash2, clamp, ease, envelope, lerp, progress } from '@bible/film/core';
import { C, cite, hand, quote } from '../kit.ts';
import type { Drawing } from './index.ts';
import { balance, christ, person } from './props-2.ts';

const GROUND = 950;
const S = 0.8;

/** Draw `under`, then `over` only above the line `y` (figure-local). */
const wipe = (ctx: CanvasRenderingContext2D, y: number, under: () => void, over: () => void) => {
  under();
  ctx.save();
  ctx.beginPath();
  ctx.rect(-500, -700, 1000, y + 700);
  ctx.clip();
  over();
  ctx.restore();
};

/** Scraps of cloth trading places mid-air as the garments swap. */
const scraps = (f: Frame, p: number, from: number, to: number) => {
  if (p <= 0 || p >= 1) return;
  for (let i = 0; i < 16; i++) {
    const toChrist = i % 2 === 0;
    const q = clamp((p - (i / 16) * 0.4) / 0.6);
    if (q <= 0 || q >= 1) continue;
    const a = toChrist ? to : from;
    const b = toChrist ? from : to;
    const x = lerp(a, b, ease.inOutCubic(q));
    const y = GROUND - 220 - Math.sin(q * Math.PI) * (120 + hash2(i, 2) * 140);
    at(f.ctx, { x, y, rot: q * (hash2(i, 3) - 0.5) * 8 }, () => {
      const r = 14 + hash2(i, 4) * 14;
      cutout(
        f.ctx,
        [
          [-r, -r * 0.7],
          [r, -r * 0.8],
          [r * 0.8, r * 0.7],
          [-r * 0.9, r],
        ],
        { color: toChrist ? C.teal : C.robe, torn: 2, rim: 2, shadow: 0.5 },
        f.hand(`scrap${i}`),
      );
    });
  }
};

/** Christ comes down to us, takes our place and gives us His. */
export const exchange: Drawing = {
  enter: { kind: 'fade', dur: 0.7 },
  draw: (f) => {
    const { ctx, t } = f;
    const came = f.mark('came');
    const took = f.mark('took');
    const treated = f.mark('treated');

    // ── How can the guilty be declared righteous — and God still be just? ──
    const scale = envelope(t, 0.2, came + 0.4, 0.7, 0.6, ease.outBack);
    if (scale > 0) {
      ctx.save();
      ctx.globalAlpha *= clamp(scale * 1.5);
      const tilt = 0.28 * Math.sin(clamp(t / 1.6) * Math.PI * 0.5) + Math.sin(t * 2.2) * 0.03;
      at(ctx, { x: 960, y: GROUND, scale: 0.9 * scale }, () =>
        balance(
          ctx,
          tilt,
          f.hand('balance'),
          () =>
            at(ctx, { x: 0, y: 0, scale: 0.26 }, () =>
              person(ctx, { headTilt: -0.1 }, { face: 'sad' }, f.hand('tiny')),
            ),
          () => {
            cutout(
              ctx,
              rectShape(-80, -60, 160, 56),
              { color: C.robe, torn: 2, rim: 0, shadow: 0.5 },
              f.hand('tag'),
            );
            write(
              ctx,
              'righteous',
              0,
              -20,
              { ...hand(40, C.orange), align: 'center' },
              f.hand('tag-t'),
              { boil: 0.4 },
            );
          },
        ),
      );
      write(ctx, 'guilty', 560, 800, { ...hand(56, C.teal), align: 'right' }, f.hand('guilty'), {
        progress: progress(t, 1.5, 0.8, ease.linear),
        reveal: 'write',
      });
      write(ctx, 'and still be just?', 960, 250, { ...hand(96), align: 'center' }, f.hand('just'), {
        progress: progress(t, 2.2, 1.0, ease.linear),
        reveal: 'write',
      });
      ctx.restore();
    }

    // ── A ladder of paper strips, and Christ coming all the way down. ──────
    const ladder = envelope(t, came - 0.4, took + 0.8, 0.8, 0.8, ease.outCubic);
    const lx = 1260;
    if (ladder > 0) {
      ctx.save();
      ctx.globalAlpha *= ladder;
      const drop = (1 - ladder) * -200;
      for (const side of [-1, 1]) {
        cutout(
          ctx,
          rectShape(lx + side * 70 - 11, -80 + drop, 22, GROUND + 60),
          { color: C.gold, torn: 2, rim: 2, shadow: 0.5 },
          f.hand(`rail${side}`),
        );
      }
      for (let i = 0; i < 15; i++) {
        const y = GROUND - 30 - i * 68 + drop;
        cutout(
          ctx,
          rectShape(lx - 82, y - 9, 164, 18),
          { color: C.robe, torn: 2, rim: 0, shadow: 0.4 },
          f.hand(`rung${i}`),
        );
      }
      ctx.restore();
    }

    const down = progress(t, came + 0.2, f.mark('flesh') + 1 - came, ease.inOutQuad);
    const swap = progress(t, took + 0.1, 2.4, ease.inOutCubic);
    const us0 = 690;
    // Positions: they trade places.
    const cx = lerp(lx, us0 + 20, swap);
    const cy = lerp(-60, GROUND, down) + Math.sin(swap * Math.PI) * 20;
    const px = lerp(us0, lx - 60, swap);
    const py = GROUND - Math.sin(swap * Math.PI) * 60;
    const pScale = 1 - 0.18 * Math.sin(swap * Math.PI);
    const garments = progress(t, took + 0.5, 1.6, ease.inOutCubic);
    const underCross = progress(t, treated, 1.4, ease.outCubic);
    const blessed = progress(t, treated + 2.4, 1.4, ease.outCubic);

    // The cross's shadow, falling over Him.
    if (underCross > 0) {
      const y0 = lerp(-900, 0, underCross);
      ctx.save();
      ctx.globalAlpha *= 0.32;
      const x = cx;
      cutout(
        ctx,
        rectShape(x - 55, 330 + y0, 110, GROUND - 330),
        { color: C.tealDeep, torn: 3, rim: 0, shadow: 0, grain: 0.5 },
        f.hand('cross-v'),
      );
      cutout(
        ctx,
        rectShape(x - 250, 430 + y0, 500, 100),
        { color: C.tealDeep, torn: 3, rim: 0, shadow: 0, grain: 0.5 },
        f.hand('cross-h'),
      );
      ctx.restore();
    }
    // Warmth behind us.
    if (blessed > 0) {
      const g = ctx.createRadialGradient(px, GROUND - 200, 20, px, GROUND - 200, 420);
      g.addColorStop(0, `rgba(251, 239, 200, ${0.95 * blessed})`);
      g.addColorStop(0.5, `rgba(230, 179, 71, ${0.3 * blessed})`);
      g.addColorStop(1, 'rgba(230, 179, 71, 0)');
      ctx.fillStyle = g;
      ctx.fillRect(px - 450, GROUND - 650, 900, 900);
    }

    // Us.
    const usIn = progress(t, came - 0.3, 0.7, ease.outBack);
    if (usIn > 0) {
      const lookUp = progress(t, came + 0.6, 1);
      at(ctx, { x: px, y: py, scale: S * usIn * pScale }, () =>
        wipe(
          ctx,
          -470 + garments * 480,
          () =>
            person(
              ctx,
              { headTilt: 0.18 * lookUp * (1 - swap) },
              { face: garments > 0.6 ? 'joy' : 'calm' },
              f.hand('us'),
            ),
          () =>
            person(
              ctx,
              {
                headTilt: 0.18 * lookUp * (1 - swap),
                armL: 0.15 + blessed * 0.9,
                armR: 0.15 + blessed * 0.9,
              },
              { robe: C.robe, rags: false, face: garments > 0.6 ? 'joy' : 'calm' },
              f.hand('us'),
            ),
        ),
      );
    }

    // Him.
    if (down > 0) {
      const climbing = down < 1 ? Math.sin(t * 9) : 0;
      at(ctx, { x: cx, y: cy, scale: S }, () =>
        wipe(
          ctx,
          -470 + garments * 480,
          () =>
            christ(
              ctx,
              { armL: 0.6 + climbing * 0.5 * (1 - down), armR: 0.6 - climbing * 0.5 * (1 - down) },
              f.hand('christ'),
              { glow: 1 - garments * 0.8 },
            ),
          () =>
            christ(
              ctx,
              {
                headTilt: -0.12 * underCross,
                armL: 0.15 + underCross * 1.3,
                armR: 0.15 + underCross * 1.3,
                elbowL: 0,
                elbowR: 0,
              },
              f.hand('christ'),
              {
                glow: 0,
                robe: C.teal,
                rags: true,
                sash: 0,
                face: underCross > 0.5 ? 'shut' : 'calm',
              },
            ),
        ),
      );
    }
    scraps(f, garments, cx, px);

    // Words.
    quote(f, '“in the likeness of sinful flesh.”', 700, 230, 1100, {
      from: 'flesh',
      to: 'took',
      until: took - 0.2,
      size: 64,
      align: 'center',
    });
    const trade = envelope(t, took + 0.3, treated - 0.3, 0.4, 0.5, ease.outCubic);
    if (trade > 0) {
      ctx.save();
      ctx.globalAlpha *= trade;
      write(ctx, 'our place', 960, 250, { ...hand(84, C.teal), align: 'center' }, f.hand('ours'), {
        progress: progress(t, took + 0.3, 0.8, ease.linear),
        reveal: 'write',
      });
      const arrows: Pt[][] = [
        line([760, 300], [1160, 300], 0.08, 1),
        line([1160, 330], [760, 330], 0.08, 2),
      ];
      arrows.forEach((a, i) =>
        stroke(
          ctx,
          a,
          {
            color: i === 0 ? C.teal : C.gold,
            width: 6,
            progress: progress(t, took + 0.4 + i * 0.3, 1.2),
          },
          f.hand(`arrow${i}`),
        ),
      );
      write(ctx, 'His', 960, 400, { ...hand(84, C.orange), align: 'center' }, f.hand('his'), {
        progress: progress(t, f.mark('gave'), 0.8, ease.linear),
        reveal: 'write',
      });
      ctx.restore();
    }
    quote(
      f,
      '“Christ was treated as we deserve, that we might be treated as He deserves.”',
      960,
      190,
      1500,
      { from: 'treated', size: 60, align: 'center' },
    );
    cite(f, 'Romans 8:3', f.mark('flesh') - 0.2, took + 0.4, 0);
    cite(f, 'Ellen G. White, The Desire of Ages', f.mark('line') - 0.1, f.dur, 0);
  },
};
