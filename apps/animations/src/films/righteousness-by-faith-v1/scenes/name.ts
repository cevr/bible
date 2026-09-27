import {
  camera,
  at,
  drawing,
  cutout,
  robeShape,
  type Pt,
  ellipseShape,
  line,
  quad,
  stroke,
  write,
  type TextStyle,
} from '@bible/film/canvas';
import { clamp, ease, lerp, progress } from '@bible/film/core';
import { C, F, cite, hand, sun } from '../kit.ts';
import { changing, glow } from './props-3.ts';

/**
 * The opening page again — same person, same question, same far light — now
 * answered: the robe received, the thread reaching all the way.
 */
export const name = drawing({
  enter: { kind: 'fade', dur: 1 },
  tail: 2.8,
  timeline: {
    /** The crown of the coming King rises in its glow. */
    crown: { mark: 'jer', offset: 0.4, dur: 0.8, ease: 'outBack' },
  },
  draw: (f) => {
    const { ctx, t } = f;
    const not = f.mark('not');
    const receive = f.mark('receive');
    const taking = f.mark('taking');
    const jer = f.mark('jer');
    const nameAt = f.mark('name');
    camera(ctx, { x: 960, y: 560, zoom: 1 + t * 0.005 }, f.w, f.h, () => {
      // The question, as it was — rewritten as it is asked again, set upper left
      // so the thread can climb past it to the light without crossing the words.
      const qp = f.spoken('so', 'not');
      const big: TextStyle = { ...hand(116), align: 'center' };
      write(ctx, 'How should man be', 700, 260, big, f.hand('q1'), {
        progress: clamp(qp * 1.9),
        reveal: 'write',
      });
      const l2 = clamp(qp * 1.9 - 0.9);
      if (l2 > 0) {
        stroke(
          ctx,
          quad([499, 397], [700, 409], [905, 392]),
          {
            color: C.gold,
            width: 16,
            progress: progress(t, not - 0.6, 0.8),
            alpha: 0.9,
            marks: [f.hand('q2')],
          },
          f.hand('swash'),
        );
        write(ctx, 'just with God?', 700, 380, big, f.hand('q2'), {
          progress: l2,
          reveal: 'write',
        });
      }

      // The far light — already there, and brighter once the thread arrives.
      const reach = progress(t, taking, 2.4, ease.inOutCubic);
      const arrive = progress(t, taking + 2.2, 0.8, ease.outBack);
      sun(ctx, 1700, 170, lerp(56, 74, arrive), 1, f.hand('sun'), t * 0.04);
      if (reach > 0) {
        const full = quad([610, 740], [1150, 480], [1650, 205], 60);
        const n = Math.max(2, Math.round(full.length * reach));
        stroke(
          ctx,
          full.slice(0, n),
          { color: C.gold, width: lerp(7, 11, arrive), jitter: 1.2, taper: 0.2 },
          f.hand('thread'),
        );
        if (arrive > 0) glow(ctx, 1650, 205, 260, arrive * 0.8, '230, 179, 71');
      }

      // "Not by weaving a better garment": the patched garment, struck out.
      const sewIn = progress(t, not - 0.1, 0.6, ease.outBack);
      const drop = progress(t, receive - 0.3, 1.3, ease.inCubic);
      if (sewIn > 0 && drop < 1) {
        ctx.save();
        ctx.globalAlpha *= 1 - drop;
        at(ctx, { x: 820, y: 860 + drop * 260, scale: 0.42 * sewIn, rot: 0.1 + drop * 0.9 }, () => {
          cutout(
            ctx,
            robeShape(true, 7),
            { color: C.teal, torn: 3, rim: 3, shadow: 0.5 },
            f.hand('garment'),
          );
          cutout(
            ctx,
            [
              [-50, -220],
              [10, -226],
              [14, -170],
              [-46, -166],
            ] satisfies Pt[],
            { color: C.tealDeep, torn: 2, rim: 2, shadow: 0.2 },
            f.hand('patch1'),
          );
          cutout(
            ctx,
            [
              [20, -120],
              [74, -126],
              [70, -72],
              [24, -70],
            ] satisfies Pt[],
            { color: C.tealPale, torn: 2, rim: 2, shadow: 0.2 },
            f.hand('patch2'),
          );
        });
        const strike = progress(t, not + 0.9, 0.5);
        stroke(
          ctx,
          line([730, 620], [915, 880], 0.02, 1),
          { color: C.red, width: 14, progress: strike },
          f.hand('x1'),
        );
        stroke(
          ctx,
          line([915, 630], [735, 875], 0.02, 2),
          { color: C.red, width: 14, progress: progress(t, not + 1.2, 0.5) },
          f.hand('x2'),
        );
        ctx.restore();
      }

      // The person, the same as at the start — receiving the robe.
      const robe = progress(t, receive, 1.6, ease.inOutCubic);
      glow(ctx, 560, 830, 260, robe * 0.7, '251, 239, 200');
      const lift = progress(t, taking - 0.2, 1);
      at(ctx, { x: 560, y: 940, scale: 0.44 }, () =>
        changing(
          ctx,
          {
            headTilt: 0.12 * lift,
            armR: 0.15 + 2.2 * lift,
            elbowR: 0.1 + 0.3 * lift,
            armL: 0.15 + 0.5 * robe,
          },
          { robe: C.teal, skin: C.skin, ink: C.ink, hair: C.ink, rags: true, face: 'calm' },
          { robe: C.robe, skin: C.skin, ink: C.ink, hair: C.ink, face: 'joy' },
          robe,
          f.hand('person'),
        ),
      );

      // The coming King, and His name.
      const crown = f.at('crown');
      if (crown > 0) {
        at(ctx, { x: 1230, y: lerp(580, 620, crown), scale: crown }, () => {
          glow(ctx, 0, 0, 160, 0.6, '230, 179, 71');
          const c: Pt[] = [
            [-80, 40],
            [-90, -40],
            [-45, 0],
            [0, -60],
            [45, 0],
            [90, -40],
            [80, 40],
          ];
          cutout(ctx, c, { color: C.gold, torn: 1.5, rim: 3, shadow: 0.5 }, f.hand('crown'));
          for (const [x, y, col] of [
            [-45, 20, C.red],
            [0, 18, C.teal],
            [45, 20, C.red],
          ] satisfies ReadonlyArray<readonly [number, number, string]>)
            cutout(
              ctx,
              ellipseShape(x, y, 10, 10, 14),
              { color: col, torn: 0.5, rim: 1.5, shadow: 0.2 },
              f.hand(`gem${x}`),
            );
        });
      }
      const answer: TextStyle = {
        family: F.display,
        size: 84,
        weight: 800,
        color: C.ink,
        align: 'center',
        tracking: 0.06,
      };
      write(ctx, 'THE LORD', 1230, 800, answer, f.hand('a1'), {
        progress: progress(t, nameAt - 0.3, 0.8, ease.linear),
        reveal: 'pop',
      });
      write(ctx, 'OUR RIGHTEOUSNESS', 1230, 905, { ...answer, color: C.orange }, f.hand('a2'), {
        progress: progress(t, nameAt + 0.4, 1.2, ease.linear),
        reveal: 'pop',
      });
    });
    cite(f, 'Jeremiah 23:6', jer - 0.1, f.dur);
  },
});
