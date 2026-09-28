import { drawFigure, type Look } from '../figure.ts';
import { at, cutout, type Frame, ellipse, ellipseShape, stroke } from '@bible/film/canvas';
import { hash2, clamp, ease, envelope, lerp, progress } from '@bible/film/core';
import { C, cite, quote, star, tablets } from '../kit.ts';
import type { Drawing } from './index.ts';
import { card, flower, glow, heartShape, plant, ticket } from './props-3.ts';

const robed: Look = { robe: C.robe, skin: C.skin, ink: C.ink, hair: C.ink, face: 'joy' };

/** A small glowing heart on the chest, in the figure's local frame. */
const chestHeart = (f: Frame, grow: number) => {
  if (grow <= 0) return;
  const { ctx } = f;
  const pulse = 1 + 0.06 * Math.sin(f.t * 4);
  glow(ctx, 0, -210, 150 * grow, 0.8 * grow, '230, 179, 71');
  cutout(
    ctx,
    heartShape(0, -210, 44 * grow * pulse),
    { color: C.gold, torn: 1.5, rim: 3, shadow: 0.4 },
    f.hand('chest'),
  );
};

/** The law moves in: the circle settles in the heart, is written there, and the life follows. */
export const within: Drawing = {
  enter: { kind: 'fade', dur: 0.8 },
  draw: (f) => {
    const { ctx, t } = f;
    const heart = f.mark('heart');
    const write_ = f.mark('write');
    const title = f.mark('title');
    const adopt = f.mark('adopt');

    // ── A: the circle of the law settles into the heart ─────────────────────
    const aOut = progress(t, write_ - 0.6, 0.6);
    if (aOut < 1) {
      ctx.save();
      ctx.globalAlpha *= 1 - aOut;
      const FX = 600;
      const FY = 940;
      const S = 0.62;
      at(ctx, { x: FX, y: FY, scale: S }, () =>
        drawFigure(ctx, { armL: 0.3, armR: 0.3, headTilt: -0.08 }, robed, f.hand('person')),
      );
      const fly = progress(t, heart, 1.8, ease.inOutCubic);
      const chest: [number, number] = [FX, FY - 210 * S];
      const cx = lerp(1180, chest[0], fly);
      const cy = lerp(430, chest[1], fly);
      const r = lerp(330, 26, fly);
      if (fly < 1) {
        const inked = progress(t, 0.2, 1.4, ease.inOutCubic);
        ctx.save();
        ctx.globalAlpha *= inked * (1 - fly * fly);
        cutout(
          ctx,
          ellipseShape(cx, cy, r, r, 72),
          { color: C.night, torn: 0, rim: 0, shadow: 0.3, grain: 0.9 },
          f.hand('space'),
        );
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.clip();
        for (let i = 0; i < 40; i++) {
          const a = hash2(i, 1) * Math.PI * 2;
          const d = Math.sqrt(hash2(i, 2)) * r;
          star(
            ctx,
            cx + Math.cos(a) * d,
            cy + Math.sin(a) * d,
            (3 + hash2(i, 3) * 7) * (r / 330 + 0.3),
            i % 4 === 0 ? C.gold : C.robe,
            0.8,
          );
        }
        ctx.restore();
        stroke(
          ctx,
          ellipse(cx, cy, r, r, 3, 0.25),
          { color: C.gold, width: 14 * (0.5 + r / 660), progress: inked },
          f.hand('ring'),
        );
      }
      at(ctx, { x: FX, y: FY, scale: S }, () =>
        chestHeart(f, progress(t, heart + 1.5, 0.8, ease.outBack)),
      );
      quote(f, '“Christ changes the heart. He abides in your heart by faith.”', 980, 330, 820, {
        from: 'changes',
        to: 'write',
        size: 64,
      });
      ctx.restore();
    }
    cite(f, 'Ellen G. White, Steps to Christ', f.mark('changes') - 0.2, write_ - 0.6);

    // ── B: the law written in the heart ─────────────────────────────────────
    const b = envelope(t, write_ - 0.4, title + 0.4, 0.7, 0.5);
    if (b > 0) {
      ctx.save();
      ctx.globalAlpha *= b;
      const s = lerp(0.7, 1, ease.outCubic(clamp(b)));
      at(ctx, { x: 960, y: 520, scale: s }, () => {
        glow(ctx, 0, 0, 520, 0.6, '230, 179, 71');
        cutout(
          ctx,
          heartShape(0, 0, 330),
          { color: C.rose, torn: 4, rim: 4, shadow: 0.7, grain: 0.8 },
          f.hand('bigheart'),
        );
        // The same two tables of stone from the opening, now inside the heart.
        tablets(ctx, 0, 110, 0.9, f.hand('tablets'), {
          write: progress(t, write_ + 0.2, 2.6, ease.linear),
        });
      });
      ctx.restore();
    }
    cite(f, 'Hebrews 8:10', write_ - 0.2, title - 0.2);

    // ── C: imputed and imparted ─────────────────────────────────────────────
    const c = envelope(t, title - 0.1, adopt - 0.2, 0.4, 0.6);
    if (c > 0) {
      ctx.save();
      ctx.globalAlpha *= c;
      const left = progress(t, title - 0.1, 0.6, ease.outBack);
      const right = progress(t, title + 1, 0.7, ease.outBack);
      if (left > 0)
        at(ctx, { x: 640, y: 450, scale: left, rot: -0.03 }, () =>
          card(ctx, 0, 0, 'IMPUTED', 'our title', f.hand('card1'), () =>
            at(ctx, { x: 0, y: 0, rot: -0.12 }, () => ticket(ctx, f.hand('ticket'))),
          ),
        );
      if (right > 0)
        at(ctx, { x: 1280, y: 450, scale: right, rot: 0.03 }, () =>
          card(ctx, 0, 0, 'IMPARTED', 'our fitness', f.hand('card2'), () =>
            at(ctx, { x: 0, y: -10, scale: 1 }, () =>
              plant(ctx, progress(t, title + 1.4, 4), f.hand('plant')),
            ),
          ),
        );
      quote(
        f,
        '“The first is our title to heaven, the second is our fitness for heaven.”',
        960,
        830,
        1500,
        { from: 'first', to: 'adopt', size: 54, align: 'center' },
      );
      ctx.restore();
    }
    cite(f, 'Ellen G. White, Messages to Young People', f.mark('first') - 0.2, adopt - 0.3);

    // ── D: the life that follows — flowers in the footprints ────────────────
    const d = progress(t, adopt - 0.4, 0.7);
    if (d > 0) {
      ctx.save();
      ctx.globalAlpha *= d;
      const walk = progress(t, adopt, f.dur - adopt, ease.linear);
      const x = lerp(260, 1500, walk);
      const GROUND = 920;
      for (let fx = 300; fx < x - 40; fx += 95) {
        const passed = adopt + ((fx - 260) / 1240) * (f.dur - adopt);
        const i = Math.round(fx / 95);
        flower(
          ctx,
          fx + hash2(i, 2) * 20,
          GROUND + 10 + hash2(i, 5) * 20,
          progress(t, passed + 0.2, 1.1, ease.outBack),
          [C.rose, C.gold, C.robe, C.orange][i % 4] ?? C.rose,
          f.hand(`flower${i}`),
        );
      }
      const step = Math.sin(t * 6);
      at(ctx, { x, y: GROUND - Math.abs(step) * 8, scale: 0.5 }, () => {
        drawFigure(
          ctx,
          { armL: 0.2 + 0.25 * step, armR: 0.2 - 0.25 * step, lean: 0.05 },
          robed,
          f.hand('walker'),
        );
        chestHeart(f, 1);
      });
      ctx.restore();
    }
    quote(
      f,
      '“God does not adopt us as His children because we are good, but in order that He may make us good.”',
      960,
      250,
      1450,
      { from: 'god', size: 60, align: 'center' },
    );
    cite(f, 'E. J. Waggoner, Christ and His Righteousness', f.mark('god') - 0.2, f.dur);
  },
};
