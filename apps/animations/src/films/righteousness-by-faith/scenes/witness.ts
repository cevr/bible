import {
  at,
  cutout,
  drawFigure,
  type Pt,
  line,
  rectShape,
  stroke,
  write,
} from '@bible/film/canvas';
import { clamp, ease, envelope, lerp, progress } from '@bible/film/core';
import { C, cite, hand, quote, tablets } from '../kit.ts';
import type { Drawing } from './index.ts';
import { circleMark, note } from './props-1.ts';

const MX = 1260;
const MY = 930;
const MW = 440;
const MH = 560;

/** A rounded-top arch, like one great tablet: centred on x, bottom at y. */
const arch = (x: number, y: number, w: number, h: number): Pt[] => {
  const r = w / 2;
  const pts: Pt[] = [[x - r, y]];
  for (let i = 0; i <= 24; i++) {
    const a = Math.PI + (Math.PI * i) / 24;
    pts.push([x + Math.cos(a) * r, y - h + r + Math.sin(a) * r]);
  }
  pts.push([x + r, y]);
  return pts;
};

/** The law as a mirror: it shows every stain, and cannot wash one. */
export const witness: Drawing = {
  enter: { kind: 'cut' },
  draw: (f) => {
    const { ctx, t } = f;
    const standard = f.mark('standard');
    const call = f.mark('call');
    const must = f.mark('must');
    const none = f.mark('none');

    // The tablets stand first, then become a mirror.
    const toMirror = progress(t, standard - 0.2, 1, ease.inOutCubic);
    if (toMirror < 1) {
      ctx.save();
      ctx.globalAlpha *= 1 - toMirror;
      const s = lerp(1.25, 1.6, toMirror) * progress(t, 0, 0.6, ease.outBack);
      tablets(ctx, MX, MY, s, f.hand('tablets'), { glow: 0.3 });
      ctx.restore();
    }
    if (toMirror > 0) {
      ctx.save();
      ctx.globalAlpha *= toMirror;
      const grow = lerp(0.8, 1, ease.outBack(toMirror));
      at(ctx, { x: MX, y: MY, scale: grow }, () => {
        cutout(
          ctx,
          arch(0, 0, MW + 44, MH + 30),
          { color: '#b9b09c', torn: 3, rim: 3, shadow: 0.8, grain: 0.9 },
          f.hand('frame'),
        );
        cutout(
          ctx,
          arch(0, -18, MW, MH - 10),
          { color: '#cfdcdc', torn: 1.5, rim: 0, shadow: 0, grain: 0.3 },
          f.hand('glass'),
        );
        // The reflection: the same person, every stain sharp and true.
        ctx.save();
        const glass = arch(0, -18, MW, MH - 10);
        ctx.beginPath();
        glass.forEach((p, i) => (i === 0 ? ctx.moveTo(p[0], p[1]) : ctx.lineTo(p[0], p[1])));
        ctx.closePath();
        ctx.clip();
        ctx.globalAlpha *= 0.8;
        at(ctx, { x: 0, y: 30, scale: 0.95, sx: -1 }, () =>
          drawFigure(
            ctx,
            { armL: 0.15, armR: 0.15 },
            {
              robe: C.tealDeep,
              skin: C.skin,
              ink: C.ink,
              hair: C.ink,
              rags: true,
              face: t > call ? 'sad' : 'calm',
            },
            f.hand('reflection'),
          ),
        );
        ctx.globalAlpha /= 0.8;
        // Red rings around the stains, drawn one by one.
        const rings: Array<[number, number, number]> = [
          [-40, -170, 46],
          [36, -80, 40],
          [30, -220, 34],
        ];
        rings.forEach(([x, y, r], i) =>
          circleMark(ctx, x, y, r, progress(t, call - 0.4 + i * 0.35, 0.6), f.hand(`ring${i}`)),
        );
        // Sheen.
        stroke(
          ctx,
          line([-160, -420], [-60, -520], 0.02, 1),
          { color: '#ffffff', width: 18, alpha: 0.5 },
          f.hand('sheen1'),
        );
        stroke(
          ctx,
          line([-170, -330], [-40, -470], 0.02, 2),
          { color: '#ffffff', width: 8, alpha: 0.4 },
          f.hand('sheen2'),
        );
        ctx.restore();
        // GUILTY, stamped across the glass.
        const stamp = progress(t, call + 0.9, 0.35, ease.outCubic);
        const stampOut = progress(t, must + 0.4, 0.5);
        if (stamp > 0 && stampOut < 1) {
          ctx.save();
          ctx.globalAlpha *= (1 - stampOut) * clamp(stamp * 2);
          at(ctx, { x: 0, y: -300, rot: -0.14, scale: lerp(1.6, 1, stamp) }, () => {
            const w = 300;
            for (const k of [0, 1]) {
              const inset = k * 12;
              const r = rectShape(-w / 2 + inset, -54 + inset, w - inset * 2, 108 - inset * 2);
              stroke(
                ctx,
                [...r, r[0] ?? [0, 0]],
                { color: C.red, width: 7 - k * 3, taper: 0.02, jitter: 1 },
                f.hand(`stamp${k}`),
              );
            }
            write(
              ctx,
              'GUILTY',
              0,
              24,
              {
                family: 'Fraunces',
                size: 68,
                weight: 800,
                color: C.red,
                align: 'center',
                tracking: 0.1,
              },
              f.hand('guilty'),
              { boil: 0.4 },
            );
          });
          ctx.restore();
        }
      });
      ctx.restore();
    }
    const label = envelope(t, standard + 0.3, must - 0.3, 0.5, 0.5);
    if (label > 0) {
      ctx.save();
      ctx.globalAlpha *= label;
      write(
        ctx,
        'a perfect standard',
        MX,
        290,
        { ...hand(64, C.orange), align: 'center' },
        f.hand('perfect'),
        {
          progress: progress(t, standard + 0.3, 1, ease.linear),
          reveal: 'write',
        },
      );
      ctx.restore();
    }

    // The person: holds up a hopeful card, then tries to scrub, then gives up.
    const card = envelope(t, call - 0.2, must + 0.4, 0.45, 0.5);
    const scrub = envelope(t, must + 0.8, none - 0.1, 0.4, 0.5);
    const empty = progress(t, none, 0.8);
    const pop = progress(t, 0.1, 0.6, ease.outBack);
    at(ctx, { x: 640, y: 940, scale: 0.95 * pop }, () => {
      drawFigure(
        ctx,
        {
          armR: 0.15 + 1.9 * card + (1.7 + 0.25 * Math.sin(t * 12)) * scrub + 0.9 * empty,
          elbowR: 0.1 + 0.5 * card - 0.2 * scrub,
          armL: 0.15 + 0.9 * empty,
          elbowL: 0.1,
          headTilt: 0.1 * card - 0.14 * empty,
          lean: 0.05 * scrub,
        },
        {
          robe: C.teal,
          skin: C.skin,
          ink: C.ink,
          hair: C.ink,
          rags: true,
          face: t > call + 1 ? 'sad' : 'calm',
        },
        f.hand('person'),
      );
    });
    if (card > 0) {
      ctx.save();
      ctx.globalAlpha *= card;
      note(ctx, 880, 470 - card * 30, 190, 0.08, C.robe, f.hand('card'), () =>
        write(ctx, 'innocent?', 0, 12, { ...hand(40, C.ink), align: 'center' }, f.hand('cardT'), {
          boil: 0.3,
        }),
      );
      ctx.restore();
    }

    quote(
      f,
      '“We must have the righteousness of the law or we cannot enter heaven, and yet the law has no righteousness for one of us.”',
      960,
      170,
      1560,
      {
        from: 'must',
        size: 54,
        align: 'center',
      },
    );
    cite(f, 'E. J. Waggoner, Christ and His Righteousness', must - 0.2, f.dur);
  },
};
