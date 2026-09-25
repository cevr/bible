import { at, drawFigure, type Pt, line, quad, stroke, write } from '@bible/film/canvas';
import { hash2, clamp, ease, envelope, lerp, progress } from '@bible/film/core';
import { C, cite, hand, quote, star } from '../kit.ts';
import type { Drawing } from './index.ts';
import { LEAF, WILT, leaf, note, patch } from './props-1.ts';

// Where things stick on the robe, in figure-local units (feet at origin).
const LEAVES: ReadonlyArray<[number, number, number]> = [
  [-40, -250, -0.6],
  [42, -200, 0.5],
  [-30, -130, 0.2],
  [50, -90, -0.4],
  [-60, -60, 0.9],
];
const PATCHES: ReadonlyArray<[number, number, number]> = [
  [10, -270, 0.2],
  [-58, -190, -0.15],
  [30, -150, 0.3],
];
const NOTES: ReadonlyArray<[number, number, number]> = [
  [-10, -210, -0.18],
  [40, -120, 0.14],
  [-50, -100, -0.08],
];

/** We come short; we sew fig leaves; our righteousness is rags; evil multiplied is still evil. */
export const rags: Drawing = {
  enter: { kind: 'pan', dur: 0.9 },
  draw: (f) => {
    const { ctx, t } = f;
    const short = f.mark('short');
    const sew = f.mark('sew');
    const tryM = f.mark('try');
    const promise = f.mark('promise');
    const isaiah = f.mark('isaiah');
    const ragsM = f.mark('rags');
    const why = f.mark('why');
    const math = f.mark('math');

    // ── "come short of the glory of God": a gold measuring pole.
    const poleIn = progress(t, 0.4, 1.4, ease.inOutCubic);
    const poleOut = progress(t, sew - 1.6, 0.7);
    if (poleIn > 0 && poleOut < 1) {
      ctx.save();
      ctx.globalAlpha *= 1 - poleOut;
      stroke(
        ctx,
        line([1000, 945], [1000, 250], 0.01, 3),
        { color: C.gold, width: 16, progress: poleIn, taper: 0.05 },
        f.hand('pole'),
      );
      for (let i = 0; i < 12; i++) {
        const y = 900 - i * 56;
        stroke(
          ctx,
          line([1000, y], [1034, y], 0.02, i),
          { color: C.gold, width: 6, progress: clamp(poleIn * 13 - i) },
          f.hand(`tick${i}`),
        );
      }
      const top = progress(t, 1.6, 0.8, ease.outBack);
      if (top > 0) star(ctx, 1000, 222, 46 * top, C.gold);
      write(ctx, 'the glory of God', 1060, 236, hand(56, C.orange), f.hand('glory'), {
        progress: progress(t, 1.9, 1.1, ease.linear),
        reveal: 'write',
      });
      // The gap between our best reach and the mark.
      const gap = progress(t, short + 0.2, 0.9, ease.outCubic);
      if (gap > 0) {
        stroke(
          ctx,
          line([900, 520], [900, 520 - 250 * gap], 0.01, 9),
          { color: C.teal, width: 6 },
          f.hand('gap'),
        );
        stroke(
          ctx,
          line([880, 520], [920, 520], 0.02, 10),
          { color: C.teal, width: 6 },
          f.hand('gapA'),
        );
        if (gap > 0.95)
          stroke(
            ctx,
            line([880, 270], [920, 270], 0.02, 11),
            { color: C.teal, width: 6 },
            f.hand('gapB'),
          );
        write(ctx, 'short', 1070, 420, hand(84, C.teal), f.hand('short'), {
          progress: progress(t, short + 0.5, 0.8, ease.linear),
          reveal: 'write',
        });
        stroke(
          ctx,
          quad([1060, 400], [990, 390], [920, 400]),
          { color: C.teal, width: 5, progress: progress(t, short + 1.1, 0.5) },
          f.hand('shortArrow'),
        );
      }
      ctx.restore();
    }
    cite(f, 'Romans 3:23', short - 0.2, sew - 1);

    // ── The person, who will slide aside for the sum.
    const aside = progress(t, why - 0.3, 1.1, ease.inOutCubic);
    const px = lerp(560, 330, aside);
    const ps = lerp(0.95, 0.78, aside);
    const py = lerp(950, 930, aside);
    const reach = envelope(t, short - 0.3, sew - 1.8, 0.7, 0.6);
    const busy = progress(t, sew - 0.2, 0.4) * (1 - progress(t, ragsM, 0.6));
    const sewing = Math.sin(t * 9) * busy;
    const wilt = progress(t, ragsM + 0.2, 1.6, ease.inOutCubic);
    const pop = progress(t, 0.1, 0.7, ease.outBack);
    at(ctx, { x: px, y: py, scale: ps * pop }, () => {
      drawFigure(
        ctx,
        {
          armR: 0.15 + 2.6 * reach + 0.35 * busy + 0.15 * sewing,
          elbowR: 0.1 + 0.2 * reach - 1.5 * busy,
          armL: 0.15 + 0.3 * busy - 0.12 * sewing,
          elbowL: 0.1 - 1.4 * busy,
          headTilt: -0.08 * reach + 0.1 * wilt,
          lean: -0.02 * reach,
        },
        {
          robe: C.teal,
          skin: C.skin,
          ink: C.ink,
          hair: C.ink,
          rags: true,
          face: wilt > 0.4 ? 'sad' : t > short && t < sew ? 'sad' : 'calm',
        },
        f.hand('person'),
      );
      // Fig leaves fly in and stick; later they wilt and some fall.
      LEAVES.forEach(([lx, ly, rot], i) => {
        const land = progress(t, sew - 0.3 + i * 0.28, 0.7, ease.outCubic);
        if (land <= 0) return;
        const fall = i % 2 === 0 ? progress(t, ragsM + 0.6 + i * 0.2, 1.4, ease.inCubic) : 0;
        const fx = lerp(900, lx, land);
        const fy = lerp(-420 - i * 40, ly, land) + fall * (0 - ly + 10);
        const col = wilt > 0.5 ? WILT : LEAF;
        leaf(ctx, fx, fy, 70, rot + (1 - land) * 3 + fall * 1.2, col, f.hand(`leaf${i}`));
      });
      PATCHES.forEach(([x, y, rot], i) => {
        const slap = progress(t, tryM + i * 0.35, 0.45, ease.outBack);
        if (slap <= 0) return;
        at(ctx, { x, y, scale: lerp(1.6, 1, slap), rot: rot * (1 - slap) }, () =>
          patch(
            ctx,
            0,
            0,
            58,
            rot,
            i === 1 ? C.tealDeep : C.tealPale,
            f.hand(`patch${i}`),
            clamp(slap * 2 - 1),
          ),
        );
      });
      NOTES.forEach(([x, y, rot], i) => {
        const stick = progress(t, promise + i * 0.3, 0.5, ease.outBack);
        if (stick <= 0) return;
        const droop = wilt * (0.35 + i * 0.1);
        at(ctx, { x, y, scale: stick }, () =>
          note(ctx, 0, 0, 132, rot + droop, '#f3e4a8', f.hand(`note${i}`), () =>
            write(
              ctx,
              'I promise!',
              0,
              9,
              { ...hand(28, C.ink), align: 'center' },
              f.hand(`noteT${i}`),
              { boil: 0.2 },
            ),
          ),
        );
      });
      // Grime settles over the whole garment as the verdict lands.
      if (wilt > 0) {
        ctx.save();
        ctx.globalAlpha *= 0.35 * wilt;
        for (let k = 0; k < 7; k++) {
          const x = -80 + hash2(k, 4) * 160;
          const y = -300 + hash2(k, 5) * 270;
          stroke(
            ctx,
            quad([x - 30, y], [x, y + 12], [x + 34, y - 6]),
            // It soils the promises pinned there too: they are the filthy rags.
            { color: C.ink, width: 10, marks: 'I promise!' },
            f.hand(`grime${k}`),
          );
        }
        ctx.restore();
      }
      // A bead of sweat while trying.
      const sweat = envelope(t, tryM, isaiah, 0.3, 0.4);
      if (sweat > 0) {
        const sy = -400 + ((t * 60) % 40);
        ctx.save();
        ctx.globalAlpha *= sweat;
        ctx.fillStyle = '#9cc9e0';
        ctx.beginPath();
        ctx.ellipse(70, sy, 9, 13, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    });

    // ── Labels for the effort: a to-do list that goes nowhere.
    const listOut = progress(t, isaiah - 0.3, 0.6);
    if (listOut < 1) {
      ctx.save();
      ctx.globalAlpha *= 1 - listOut;
      const items: Array<[number, string]> = [
        [sew, 'sew fig leaves'],
        [tryM, 'try harder'],
        [promise, 'make promises'],
      ];
      items.forEach(([at0, label], i) => {
        const y = 440 + i * 110;
        const p = progress(t, at0 - 0.1, 0.9, ease.linear);
        if (p <= 0) return;
        stroke(
          ctx,
          line([1000, y - 18], [1040, y - 18], 0.02, i),
          { color: C.inkSoft, width: 4, progress: p },
          f.hand(`box${i}`),
        );
        write(ctx, label, 1070, y, hand(68, C.ink), f.hand(`item${i}`), {
          progress: p,
          reveal: 'write',
        });
        const tick = progress(t, at0 + 0.7, 0.35);
        if (tick > 0) {
          const pts: Pt[] = [
            [1002, y - 30],
            [1016, y - 10],
            [1046, y - 60],
          ];
          stroke(ctx, pts, { color: C.orange, width: 7, progress: tick }, f.hand(`tick${i}`));
        }
      });
      ctx.restore();
    }

    // ── Isaiah's verdict.
    quote(f, '“all our righteousnesses are as filthy rags.”', 1180, 250, 1150, {
      from: 'rags',
      to: 'why',
      until: why + 0.2,
      size: 72,
      align: 'center',
    });
    cite(f, 'Isaiah 64:6', isaiah, why + 0.2);

    // ── The sum: evil × evil × evil is still evil — never a good deed.
    const cells = [0, 1, 2];
    const sumY = 640;
    cells.forEach((i) => {
      const p = progress(t, why + 0.4 + i * 0.45, 0.5, ease.outBack);
      if (p <= 0) return;
      at(ctx, { x: 820 + i * 230, y: sumY, scale: p }, () =>
        patch(
          ctx,
          0,
          0,
          120,
          (hash2(i, 7) - 0.5) * 0.3,
          i === 1 ? C.tealDeep : C.teal,
          f.hand(`sum${i}`),
        ),
      );
      if (i < 2)
        write(
          ctx,
          '×',
          935 + i * 230,
          sumY + 30,
          { ...hand(96, C.ink), align: 'center' },
          f.hand(`times${i}`),
          { progress: p, reveal: 'pop' },
        );
    });
    const eq = progress(t, why + 1.9, 0.5, ease.outBack);
    if (eq > 0) {
      write(ctx, '=', 1500, sumY + 30, { ...hand(110, C.ink), align: 'center' }, f.hand('eq'), {
        progress: eq,
        reveal: 'pop',
      });
      // The hoped-for answer: one good deed (gold) — struck out.
      const hope = progress(t, math + 0.5, 0.6, ease.outBack);
      const strike = progress(t, math + 1.1, 0.4);
      const settle = progress(t, math + 1.6, 0.5, ease.outBack);
      if (hope > 0 && settle < 1) {
        ctx.save();
        ctx.globalAlpha *= 1 - settle;
        star(ctx, 1660, sumY, 80 * hope, C.gold);
        if (strike > 0) {
          stroke(
            ctx,
            line([1590, sumY - 70], [1730, sumY + 70], 0.02, 1),
            { color: C.red, width: 12, progress: strike },
            f.hand('x1'),
          );
          stroke(
            ctx,
            line([1730, sumY - 70], [1590, sumY + 70], 0.02, 2),
            { color: C.red, width: 12, progress: clamp(strike * 2 - 1) },
            f.hand('x2'),
          );
        }
        ctx.restore();
      }
      if (settle > 0)
        at(ctx, { x: 1660, y: sumY, scale: settle }, () =>
          patch(ctx, 0, 0, 130, 0.12, C.tealDeep, f.hand('result')),
        );
      const tag = progress(t, math + 1.9, 0.8, ease.linear);
      if (tag > 0)
        write(
          ctx,
          'still evil',
          1660,
          sumY + 150,
          { ...hand(58, C.teal), align: 'center' },
          f.hand('still'),
          { progress: tag, reveal: 'write' },
        );
    }
    quote(f, '“multiplied evil cannot make one good deed.”', 1180, 250, 1400, {
      from: 'math',
      size: 68,
      align: 'center',
    });
    cite(f, 'E. J. Waggoner, Christ and His Righteousness', math - 0.2, f.dur);
  },
};
