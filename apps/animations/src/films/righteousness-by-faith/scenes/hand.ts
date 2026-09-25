import { at, cutout, ellipseShape, line, quad, rectShape, stroke, write } from '@bible/film/canvas';
import { hash2, clamp, ease, envelope, lerp, progress } from '@bible/film/core';
import { C, cite, hand, quote, star } from '../kit.ts';
import type { Drawing } from './index.ts';
import { coin, gift, openHand } from './props-2.ts';

const HX = 960;
const HY = 800;
const COINS = 10;

/** Faith is the hand, not the price: a tower of merit slides off; a gift is laid in. */
export const hand_: Drawing = {
  enter: { kind: 'pan', dur: 0.8, dir: -1 },
  draw: (f) => {
    const { ctx, t } = f;
    const saviour = f.mark('saviour');
    const earns = f.mark('earns');
    const handAt = f.mark('hand');
    const open = f.mark('open');
    const gifted = f.mark('gift');

    // ── "So what is faith?" ─────────────────────────────────────────────────
    const q = envelope(t, 0.3, saviour - 0.3, 0.3, 0.5);
    if (q > 0) {
      ctx.save();
      ctx.globalAlpha *= q;
      write(ctx, 'faith?', 960, 300, { ...hand(150, C.ink), align: 'center' }, f.hand('faith'), {
        progress: progress(t, 0.4, 1, ease.linear),
        reveal: 'write',
      });
      // Not the saviour: a gold circle drawn round it, then crossed.
      const ring = progress(t, 2.2, 0.8);
      if (ring > 0) {
        stroke(
          ctx,
          ellipseShape(960, 262, 250, 110, 50).concat([[1210, 262]]),
          { color: C.gold, width: 8, progress: ring, jitter: 1.4 },
          f.hand('ring'),
        );
        write(
          ctx,
          'the Saviour?',
          960,
          460,
          { ...hand(64, C.orange), align: 'center' },
          f.hand('sav'),
          { progress: progress(t, 2.6, 0.9, ease.linear), reveal: 'write' },
        );
      }
      const x = progress(t, 3.6, 0.4, ease.outCubic);
      if (x > 0)
        stroke(
          ctx,
          line([760, 470], [1160, 410], 0.05, 3),
          { color: C.teal, width: 12, progress: x },
          f.hand('no-sav'),
        );
      ctx.restore();
    }

    // ── The hand, holding up a tower of merit. ──────────────────────────────
    const rise = progress(t, saviour - 0.6, 1.1, ease.outBack);
    if (rise > 0) {
      // "lay hold upon Christ": a gold cord let down from above, gripped, then let go.
      // It starts just under the quote, tapering in, so it never crosses the words.
      const hold = f.words.find((w) => w.text.startsWith('hold'))?.start ?? handAt + 2;
      const grasp =
        progress(t, hold - 0.9, 0.9, ease.outCubic) - progress(t, open - 0.3, 0.7, ease.inOutCubic);
      const curl =
        0.55 * Math.max(0, grasp) +
        lerp(0.35, 0, progress(t, open - 0.2, 1, ease.inOutCubic)) +
        0.2 * progress(t, gifted + 0.7, 0.5, ease.outCubic);
      const y = lerp(1300, HY, rise);
      // The tower tips and slides off the palm.
      const topple = progress(t, earns + 0.1, 1.8, ease.inCubic);
      at(ctx, { x: HX, y, scale: 1.35 }, () => {
        // Glow once the hand is empty.
        const glow = progress(t, handAt, 1.2) * (1 - 0.3 * progress(t, gifted, 1));
        if (glow > 0) {
          const g = ctx.createRadialGradient(0, -40, 10, 0, -40, 360);
          g.addColorStop(0, `rgba(251, 239, 200, ${0.9 * glow})`);
          g.addColorStop(1, 'rgba(251, 239, 200, 0)');
          ctx.fillStyle = g;
          ctx.fillRect(-380, -400, 760, 760);
        }
        if (grasp > 0) {
          const down = progress(t, hold - 1.8, 1.1, ease.outCubic);
          const pts = Array.from({ length: 24 }, (_, k) => {
            const u = k / 23;
            return [
              60 + Math.sin(u * 7 + t * 2) * 10 * (1 - u),
              lerp(-370, lerp(-370, -10, down), u),
            ] as [number, number];
          });
          stroke(
            ctx,
            pts,
            { color: C.gold, width: 14, alpha: clamp(grasp * 2), jitter: 1.2, taper: 0.35 },
            f.hand('cord'),
          );
          // Where the cord comes from: a small gold light.
          star(
            ctx,
            pts[0]?.[0] ?? 60,
            -370,
            12,
            C.gold,
            clamp(grasp * 2) * (0.85 + 0.15 * Math.sin(t * 3)),
          );
        }
        openHand(ctx, f.hand('hand'), '#c9b99a', curl);
        const built = progress(t, saviour - 0.1, 2.6, ease.linear);
        if (topple < 1) {
          at(ctx, { x: topple * 520, y: topple * topple * 700, rot: topple * 1.3 }, () => {
            for (let i = 0; i < COINS; i++) {
              const show = clamp(built * COINS - i);
              if (show <= 0) break;
              const wob = Math.sin(t * 3 + i * 0.7) * i * 0.6;
              const sep = topple * i * 6;
              at(
                ctx,
                {
                  x: wob + sep * (hash2(i, 1) - 0.3),
                  y: -40 - i * 26 - (1 - ease.outBack(show)) * 40,
                },
                () => coin(ctx, 0, 0, f.hand(`coin${i}`), i % 3 === 0 ? C.gold : '#a88a5c'),
              );
            }
            // A medal and a tag on top.
            if (built > 0.85) {
              const top = -40 - COINS * 26;
              stroke(
                ctx,
                line([-20, top - 10], [0, top - 60], 0.02, 1),
                { color: C.red, width: 14 },
                f.hand('medal-ribbon'),
              );
              stroke(
                ctx,
                line([20, top - 10], [0, top - 60], 0.02, 2),
                { color: C.red, width: 14 },
                f.hand('medal-ribbon2'),
              );
              cutout(
                ctx,
                ellipseShape(0, top - 90, 40, 40),
                { color: C.gold, torn: 1.5, rim: 3, shadow: 0.6 },
                f.hand('medal'),
              );
              at(ctx, { x: 150, y: -200, rot: 0.12 }, () => {
                cutout(
                  ctx,
                  rectShape(-100, -34, 200, 60),
                  { color: C.robe, torn: 2, rim: 0, shadow: 0.5 },
                  f.hand('tag'),
                );
                write(
                  ctx,
                  'good deeds',
                  0,
                  8,
                  { ...hand(38, C.teal), align: 'center' },
                  f.hand('tag-t'),
                  { boil: 0.4 },
                );
              });
              at(ctx, { x: -160, y: -330, rot: -0.1 }, () => {
                cutout(
                  ctx,
                  rectShape(-80, -34, 160, 60),
                  { color: C.robe, torn: 2, rim: 0, shadow: 0.5 },
                  f.hand('tag2'),
                );
                write(
                  ctx,
                  'merit',
                  0,
                  8,
                  { ...hand(38, C.teal), align: 'center' },
                  f.hand('tag2-t'),
                  { boil: 0.4 },
                );
              });
            }
          });
        }
        // The gift, laid in the open palm.
        const fall = progress(t, f.mark('receive') - 0.2, 1.4, ease.outCubic);
        if (fall > 0) {
          const gy = lerp(-900, -60, fall);
          at(ctx, { x: 0, y: gy, rot: (1 - fall) * 0.2, scale: 0.9 }, () =>
            gift(ctx, f.hand('gift')),
          );
          const shine = envelope(t, gifted + 0.5, f.dur, 0.3, 0.2);
          if (shine > 0)
            for (let i = 0; i < 10; i++) {
              const a = (i / 10) * Math.PI * 2 + t * 0.2;
              const d = 190 + Math.sin(t * 3 + i) * 12;
              star(
                ctx,
                Math.cos(a) * d,
                -80 + Math.sin(a) * d * 0.7,
                8 + hash2(i, 5) * 8,
                i % 2 ? C.gold : C.robe,
                shine,
              );
            }
        }
      });
      // "nothing" — the price falls away.
      const nothing = envelope(t, earns + 0.4, handAt + 0.8, 0.5, 0.5);
      if (nothing > 0) {
        ctx.save();
        ctx.globalAlpha *= nothing;
        write(
          ctx,
          'earns nothing',
          1500,
          560,
          { ...hand(64, C.teal), align: 'center' },
          f.hand('nothing'),
          { progress: progress(t, earns + 0.4, 0.9, ease.linear), reveal: 'write' },
        );
        ctx.restore();
      }
      // "empty" — then "gift".
      const empty = envelope(t, open, gifted + 0.2, 0.4, 0.4);
      if (empty > 0) {
        ctx.save();
        ctx.globalAlpha *= empty;
        write(
          ctx,
          'empty',
          1440,
          620,
          { ...hand(76, C.inkSoft), align: 'center' },
          f.hand('empty'),
          { progress: progress(t, open, 0.7, ease.linear), reveal: 'write' },
        );
        stroke(
          ctx,
          quad([1360, 650], [1280, 700], [1170, 720]),
          { color: C.inkSoft, width: 5, progress: progress(t, open + 0.5, 0.5) },
          f.hand('empty-arrow'),
        );
        ctx.restore();
      }
      const giftWord = progress(t, gifted + 0.3, 0.7, ease.outBack);
      if (giftWord > 0)
        write(
          ctx,
          'a gift',
          1440,
          620,
          { ...hand(88, C.orange), align: 'center' },
          f.hand('gift-w'),
          { progress: giftWord, reveal: 'pop' },
        );
    }

    // ── Words. ──────────────────────────────────────────────────────────────
    // One quote, built line by line: the second sentence lands under the first.
    quote(f, '“Faith is not our Saviour. It earns nothing.', 960, 170, 1500, {
      from: 'saviour',
      to: 'hand',
      until: open + 1.2,
      size: 60,
      align: 'center',
    });
    quote(f, 'It is the hand by which we lay hold upon Christ.”', 960, 250, 1500, {
      from: 'hand',
      to: 'open',
      until: open + 1.2,
      size: 60,
      align: 'center',
    });
    cite(f, 'Ellen G. White, The Desire of Ages', saviour - 0.2, open + 1.2, 0);
  },
};

export { hand_ as hand };
