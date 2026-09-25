import { camera } from '../../../engine/camera.ts';
import { cutout } from '../../../engine/cutout.ts';
import { ellipse, ellipseShape, quad, stroke } from '../../../engine/ink.ts';
import { hash2 } from '../../../engine/random.ts';
import { clamp, ease, keys, lerp, progress } from '../../../engine/time.ts';
import { write } from '../../../engine/type.ts';
import { C, cite, hand, planet, quote, star, tablets, wordCard } from '../kit.ts';
import type { Drawing } from './index.ts';

/** Righteousness = right-doing; the law is God's character; a circle as wide as the universe. */
export const measure: Drawing = {
  enter: { kind: 'fade', dur: 0.6 },
  draw: (f) => {
    const { ctx, t } = f;
    const word = f.mark('word');
    const whose = f.mark('whose');
    const psalm = f.mark('psalm');
    const char = f.mark('char');
    const circle = f.mark('circle');

    // Act 1 — the word.
    wordCard(f, 960, 420, 'RIGHTEOUSNESS', {
      start: 0.3,
      gloss: '= right-doing',
      glossAt: word + 0.9,
      until: psalm - 0.6,
    });
    const whoseP = progress(t, whose, 1.1, ease.linear);
    const whoseOut = progress(t, psalm - 0.6, 0.5);
    if (whoseP > 0 && whoseOut < 1) {
      ctx.save();
      ctx.globalAlpha *= 1 - whoseOut;
      write(
        ctx,
        '...by whose measure?',
        960,
        700,
        { ...hand(64, C.teal), align: 'center' },
        f.hand('whose'),
        { progress: whoseP, reveal: 'write' },
      );
      ctx.restore();
    }

    // Act 2 — the tablets, then the circle that swallows the universe.
    const zoom = keys(t, [
      [circle + 1.2, 1],
      [circle + 6.4, 0.3, ease.inOutCubic],
    ]);
    const cx = 960;
    const cy = 640;
    const R = keys(t, [
      [circle, 330],
      [circle + 1.2, 330],
      [circle + 6.4, 4200, ease.inOutCubic],
    ]);
    // The quote sits ~300px above the circle's centre on screen: light text once night covers it.
    const night = R * zoom > 420 && t > circle + 1.4;
    camera(ctx, { x: cx, y: lerp(cy, cy - 10, 1 - zoom), zoom }, f.w, f.h, () => {
      // Universe inside the circle.
      const ring = progress(t, circle - 0.2, 1.4, ease.inOutCubic);
      const space = progress(t, circle + 1, 1.8);
      if (space > 0) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy - 150, R, 0, Math.PI * 2);
        ctx.clip();
        ctx.globalAlpha *= space;
        cutout(
          ctx,
          ellipseShape(cx, cy - 150, R + 20, R + 20, 96),
          { color: C.night, torn: 0, rim: 0, shadow: 0, grain: 0.9 },
          f.hand('space'),
        );
        for (let i = 0; i < 420; i++) {
          const a = hash2(i, 1) * Math.PI * 2;
          const d = Math.sqrt(hash2(i, 2)) * 4200;
          const tw = 0.5 + 0.5 * Math.sin(t * 2 + i);
          star(
            ctx,
            cx + Math.cos(a) * d,
            cy - 150 + Math.sin(a) * d,
            4 + hash2(i, 3) * 9,
            i % 5 === 0 ? C.gold : C.robe,
            0.5 + 0.5 * tw,
          );
        }
        const planets: Array<[number, number, number, string, boolean]> = [
          [-560, -300, 46, C.orange, true],
          [640, -120, 30, C.rose, false],
          [-780, 360, 64, C.leaf, false],
          [880, 520, 90, C.gold, true],
          [-120, -760, 38, C.tealPale, false],
          [300, 900, 54, C.red, false],
          [-1150, -500, 110, C.orange, false],
          [1250, -700, 70, C.tealPale, true],
        ];
        planets.forEach(([dx, dy, r, color, ringed], i) => {
          const d = progress(t, circle + 1.2 + i * 0.35, 0.9, ease.outBack);
          if (d > 0)
            planet(
              ctx,
              cx + dx * 2.2,
              cy - 150 + dy * 2.2,
              r * d * 1.8,
              color,
              f.hand(`planet${i}`),
              ringed,
            );
        });
        ctx.restore();
      }
      if (ring > 0)
        stroke(
          ctx,
          ellipse(cx, cy - 150, R, R, 3, 0.25),
          { color: C.gold, width: 14 / Math.max(0.4, zoom), progress: ring, jitter: 1.4 },
          f.hand('ring'),
        );

      // The tablets.
      const tIn = progress(t, psalm - 0.3, 0.9, ease.outBack);
      if (tIn > 0) {
        ctx.save();
        ctx.translate(cx, cy + 150);
        ctx.scale(tIn, tIn);
        tablets(ctx, 0, 0, 1, f.hand('tablets'), {
          glow: progress(t, char, 1.4),
          write: progress(t, psalm, 3.5, ease.linear),
        });
        ctx.restore();
      }
      // "God's character" — a handwritten label with an arrow.
      const lab = progress(t, char + 0.5, 1.2, ease.linear);
      const labOut = progress(t, circle + 0.6, 0.5);
      if (lab > 0 && labOut < 1) {
        ctx.save();
        ctx.globalAlpha *= 1 - labOut;
        write(ctx, "God's character,", 1430, 520, hand(56, C.orange), f.hand('lab1'), {
          progress: clamp(lab * 1.6),
          reveal: 'write',
        });
        write(ctx, 'written out', 1450, 580, hand(56, C.orange), f.hand('lab2'), {
          progress: clamp(lab * 1.6 - 0.6),
          reveal: 'write',
        });
        stroke(
          ctx,
          quad([1420, 560], [1320, 620], [1250, 700]),
          { color: C.orange, width: 6, progress: clamp(lab * 2 - 1) },
          f.hand('arrow'),
        );
        ctx.restore();
      }
    });

    // Words on the page, above the camera.
    quote(f, '“All thy commandments are righteousness.”', 960, 230, 1500, {
      from: 'psalm',
      to: 'char',
      until: circle - 0.3,
      size: 72,
      align: 'center',
    });
    cite(f, 'Psalm 119:172', psalm - 0.2, circle - 0.3);
    quote(
      f,
      '“the decalogue is a circle having a circumference as great as the universe.”',
      960,
      210,
      1300,
      {
        from: 'circle',
        size: 62,
        align: 'center',
        color: night ? C.robe : C.ink,
      },
    );
    cite(f, 'E. J. Waggoner, Christ and His Righteousness', circle - 0.1, f.dur);
  },
};
