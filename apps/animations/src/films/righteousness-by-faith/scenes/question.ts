import {
  camera,
  at,
  drawFigure,
  type Pt,
  quad,
  stroke,
  type TextStyle,
  write,
} from '@bible/film/canvas';
import { clamp, ease, progress } from '@bible/film/core';
import { C, book, cite, hand, sun } from '../kit.ts';
import type { Drawing } from './index.ts';

/** Cold open: the oldest question, huge, over one small person. */
export const question: Drawing = {
  draw: (f) => {
    const { ctx, t } = f;
    const q = f.mark('q');
    const right = f.mark('right');
    camera(ctx, { x: 960, y: 560, zoom: 1 + t * 0.008 }, f.w, f.h, () => {
      // The book the question comes out of.
      const bookIn = progress(t, 0.5, 0.9, ease.outBack);
      const bookOut = progress(t, q - 0.4, 0.9);
      if (bookIn > 0 && bookOut < 1) {
        ctx.save();
        ctx.globalAlpha *= 1 - bookOut;
        book(ctx, 960, 420 - bookOut * 60, 1.05 * bookIn, f.hand('book'));
        write(
          ctx,
          'JOB 9:2',
          960,
          620,
          {
            family: 'Fraunces',
            size: 44,
            weight: 700,
            color: C.red,
            align: 'center',
            tracking: 0.2,
          },
          f.hand('ref'),
          { progress: progress(t, 1.2, 0.8, ease.linear), reveal: 'pop' },
        );
        ctx.restore();
      }

      // The question, written out as it is read.
      const qp = f.spoken('q', 'after');
      const big: TextStyle = { ...hand(150), align: 'center' };
      write(ctx, 'How should man be', 960, 330, big, f.hand('q1'), {
        progress: clamp(qp * 1.9),
        reveal: 'write',
      });
      const l2 = clamp(qp * 1.9 - 0.9);
      if (l2 > 0) {
        stroke(
          ctx,
          quad([700, 492], [960, 508], [1225, 486]),
          {
            color: C.gold,
            width: 16,
            progress: progress(t, f.mark('after') - 0.4, 0.8),
            alpha: 0.9,
          },
          f.hand('swash'),
        );
        write(ctx, 'just with God?', 960, 470, big, f.hand('q2'), {
          progress: l2,
          reveal: 'write',
        });
      }

      // The far warm light, and a gold thread that cannot reach it.
      const glow = progress(t, right - 0.4, 1.4, ease.outCubic);
      sun(ctx, 1700, 170, 56, glow, f.hand('sun'), t * 0.04);
      const reach = progress(t, right + 0.2, 2, ease.outCubic) * 0.6;
      const sag = progress(t, right + 2.3, 1.4, ease.inOutCubic);
      if (reach > 0) {
        const full = quad([610, 770], [1080, 360], [1650, 205], 60);
        const n = Math.max(2, Math.round(full.length * reach));
        const thread: Pt[] = full.slice(0, n).map(([x, y], i) => {
          const u = clamp((i / full.length - 0.25) / 0.35);
          return [x, y + u * u * 300 * sag];
        });
        stroke(ctx, thread, { color: C.gold, width: 7, jitter: 1.4, taper: 0.3 }, f.hand('thread'));
      }

      // The person: small, patched, alone.
      const pop = progress(t, 0.15, 0.8, ease.outBack);
      const droop = progress(t, f.mark('wrong'), 0.8);
      const lift = progress(t, right, 0.9);
      at(ctx, { x: 560, y: 940, scale: 0.44 * pop }, () =>
        drawFigure(
          ctx,
          {
            headTilt: -0.12 * droop + 0.1 * lift,
            armR: 0.15 + 2.2 * lift * (1 - sag * 0.8),
            elbowR: 0.1 + 0.3 * lift,
            lean: -0.03 * droop,
          },
          {
            robe: C.teal,
            skin: C.skin,
            ink: C.ink,
            hair: C.ink,
            rags: true,
            face: droop > 0.5 && lift < 0.5 ? 'sad' : 'calm',
          },
          f.hand('person'),
        ),
      );
    });
    cite(f, 'Job 9:2', q - 0.2, f.dur);
  },
};
