import {
  camera,
  at,
  drawing,
  cutout,
  ellipseShape,
  line,
  quad,
  rectShape,
  spline,
  stroke,
  write,
} from '@bible/film/canvas';
import { hash2, clamp, ease, envelope, keys, lerp, progress } from '@bible/film/core';
import { C, cite, hand, quote, star, sun, wordCard } from '../kit.ts';
import { person } from './props-2.ts';

/**
 * Justified = declared righteous — and God's declaring is creating. A stamp
 * that isn't paperwork; a word that carries its thing; a void that fills.
 */
export const justified = drawing({
  enter: { kind: 'pan', dur: 0.9 },
  timeline: {
    /** RIGHTEOUS slams onto the decree. */
    slam: { mark: 'fiction', offset: 0.9, dur: 0.35 },
  },
  draw: (f) => {
    const { ctx, t } = f;
    const j = f.mark('justified');
    const fiction = f.mark('fiction');
    const as = f.mark('as');
    const subst = f.mark('subst');
    const voice = f.mark('voice');
    const light = f.mark('light');
    const speaks = f.mark('speaks');
    const spoken = f.mark('spoken');
    const voidAt = f.mark('void');
    const right = f.mark('right');

    // ── The heart of it: a gold heart that becomes the word. ────────────────
    const heart = envelope(t, 0.4, j + 0.5, 0.6, 0.5, ease.outBack);
    if (heart > 0) {
      at(ctx, { x: 960, y: 520, scale: heart * (1 + 0.04 * Math.sin(t * 6)) }, () => {
        const shape = spline(
          [
            [0, 120],
            [-150, -10],
            [-120, -120],
            [-40, -130],
            [0, -70],
            [40, -130],
            [120, -120],
            [150, -10],
          ],
          10,
          true,
        );
        cutout(ctx, shape, { color: C.gold, torn: 4, rim: 4, shadow: 0.7 }, f.hand('heart'));
      });
    }

    // ── Word study. ──────────────────────────────────────────────────────────
    wordCard(f, 960, 400, 'JUSTIFIED', {
      start: j - 0.3,
      original: 'δικαιόω',
      lang: 'Greek',
      gloss: 'declared righteous',
      glossAt: f.mark('declared'),
      until: fiction - 0.4,
    });

    // ── A decree, stamped — and not a legal fiction. ────────────────────────
    const doc = envelope(t, fiction + 0.2, as + 0.3, 0.6, 0.5, ease.outBack);
    if (doc > 0) {
      ctx.save();
      ctx.globalAlpha *= clamp(doc * 2);
      at(ctx, { x: 820, y: 560, scale: 0.6 + 0.4 * doc, rot: -0.03 }, () => {
        cutout(
          ctx,
          rectShape(-330, -230, 660, 460),
          { color: C.robe, torn: 3, rim: 0, shadow: 0.8, grain: 0.4 },
          f.hand('doc'),
        );
        write(
          ctx,
          'DECREE',
          0,
          -150,
          {
            family: 'Fraunces',
            size: 46,
            weight: 700,
            color: C.ink,
            align: 'center',
            tracking: 0.3,
          },
          f.hand('doc-h'),
          { boil: 0.3 },
        );
        for (let i = 0; i < 5; i++) {
          stroke(
            ctx,
            line([-250, -80 + i * 42], [250 - hash2(i, 4) * 120, -80 + i * 42], 0.02, i),
            { color: C.inkSoft, width: 4, alpha: 0.5 },
            f.hand(`doc-l${i}`),
          );
        }
        write(ctx, 'you', -210, 160, hand(52, C.ink), f.hand('doc-you'), { boil: 0.4 });
        stroke(
          ctx,
          line([-220, 172], [-40, 170], 0.01, 9),
          { color: C.ink, width: 3, alpha: 0.6 },
          f.hand('doc-sig'),
        );
        // The stamp slams down on "declares".
        const slam = f.at('slam', ease.inQuad);
        if (slam > 0) {
          const s = lerp(1.8, 1, slam);
          at(ctx, { x: 120, y: 90, rot: -0.2, scale: s }, () => {
            ctx.globalAlpha *= clamp(slam * 1.5);
            stroke(
              ctx,
              rectShape(-190, -56, 380, 112).concat([[-190, -56]]),
              { color: C.red, width: 8, jitter: 1.6 },
              f.hand('stamp-box'),
            );
            write(
              ctx,
              'RIGHTEOUS',
              0,
              20,
              {
                family: 'Fraunces',
                size: 62,
                weight: 700,
                color: C.red,
                align: 'center',
                tracking: 0.12,
              },
              f.hand('stamp'),
              { boil: 0.5 },
            );
          });
        }
      });
      // "a legal fiction?" — then struck out.
      const q = progress(t, fiction + 2.1, 1, ease.linear);
      write(
        ctx,
        'a legal fiction?',
        1470,
        400,
        { ...hand(64, C.teal), align: 'center' },
        f.hand('fiction'),
        { progress: q, reveal: 'write' },
      );
      const strike = progress(t, fiction + 2.9, 0.5, ease.outCubic);
      if (strike > 0)
        stroke(
          ctx,
          quad([1250, 390], [1470, 372], [1690, 384]),
          { color: C.gold, width: 14, progress: strike },
          f.hand('strike'),
        );
      const no = progress(t, fiction + 3.2, 0.6, ease.outBack);
      if (no > 0)
        write(ctx, 'no.', 1470, 500, { ...hand(90, C.orange), align: 'center' }, f.hand('no'), {
          progress: no,
          reveal: 'pop',
        });
      ctx.restore();
    }

    // ── The word carries the thing it names. ────────────────────────────────
    const carry = envelope(t, as + 0.2, spoken + 0.1, 0.4, 0.6, ease.linear);
    if (carry > 0) {
      ctx.save();
      ctx.globalAlpha *= carry;
      // The word flies in on a paper strip; the sun rides behind it on a thread.
      const fly = progress(t, as + 0.2, 2.6, ease.outCubic);
      const wx = lerp(-300, 760, fly) + Math.sin(t * 1.3) * 12;
      const wy = 600 + Math.sin(t * 2.1) * 14;
      const lag = progress(t, as + 0.6, 2.8, ease.outCubic);
      const sx = lerp(-700, 1260, lag) + Math.sin(t * 1.1 + 1) * 10;
      const sy = 580 + Math.sin(t * 1.7 + 1) * 18;
      const named = progress(t, f.mark('subst') + 3, 1.2, ease.outBack);
      // Toward "Let there be light" the pair rises to make room.
      const rise = progress(t, voice - 0.2, 1.6, ease.inOutCubic);
      const dy = -rise * 330;
      const dx = rise * 250;
      stroke(
        ctx,
        quad(
          [wx + dx + 170, wy + dy],
          [(wx + sx) / 2 + dx, wy + 90 + dy],
          [sx + dx * 0.6, sy + dy],
        ),
        { color: C.gold, width: 5, jitter: 1.4 },
        f.hand('string'),
      );
      sun(
        ctx,
        sx + dx * 0.6,
        sy + dy,
        60 + named * 50 - rise * 20,
        clamp(lag * 1.3),
        f.hand('sun'),
        t * 0.1,
      );
      at(ctx, { x: wx + dx, y: wy + dy, rot: -0.04 + Math.sin(t * 2) * 0.02 }, () => {
        cutout(
          ctx,
          rectShape(-40, -70, 250, 100),
          { color: C.robe, torn: 3, rim: 0, shadow: 0.7, grain: 0.3 },
          f.hand('strip'),
        );
        write(ctx, 'light', 85, 2, { ...hand(78, C.ink), align: 'center' }, f.hand('word'), {
          boil: 0.5,
        });
      });
      ctx.restore();
    }
    quote(
      f,
      '“His word is substantial; it carries with it the thing which it names.”',
      960,
      200,
      1500,
      { from: 'subst', to: 'voice', until: voice + 0.4, size: 60, align: 'center' },
    );
    cite(f, 'E. J. Waggoner, The Glad Tidings', subst - 0.2, voice + 0.4, 0);

    // ── "Let there be light" — the same voice, over a human life. ──────────
    const lt = progress(t, light, 1.1, ease.linear);
    const ltOut = progress(t, spoken - 0.2, 0.6);
    if (lt > 0 && ltOut < 1) {
      ctx.save();
      ctx.globalAlpha *= 1 - ltOut;
      write(ctx, '“Let there be light”', 200, 230, hand(96, C.orange), f.hand('let'), {
        progress: lt,
        reveal: 'write',
      });
      ctx.restore();
    }

    // ── The person; then close on the void in them, and the light arriving. ─
    const pIn = progress(t, speaks - 0.4, 0.8, ease.outBack);
    if (pIn > 0) {
      const zoom = keys(t, [
        [spoken - 0.2, 1],
        [voidAt - 0.3, 2.1, ease.inOutCubic],
      ]);
      const chestY = 1000 - 0.8 * 220;
      const camY = lerp(540, chestY - (770 - 540) / 2.1, clamp((zoom - 1) / 1.1));
      camera(ctx, { x: 960, y: camY, zoom }, f.w, f.h, () => {
        // Ribbon of speech from above.
        const ribbon = envelope(t, speaks - 0.1, spoken + 0.6, 0.9, 0.5, ease.outCubic);
        if (ribbon > 0) {
          const path = spline(
            [
              [1480, 330],
              [1380, 520],
              [1120, 560],
              [990, 720],
            ],
            12,
          );
          stroke(
            ctx,
            path,
            { color: C.gold, width: 10, progress: ribbon, jitter: 1.2 },
            f.hand('ribbon'),
          );
        }
        const bloom = progress(t, right - 0.1, 1.6, ease.outCubic);
        at(ctx, { x: 960, y: 1000, scale: 0.8 * pIn }, () => {
          person(
            ctx,
            { armL: 0.2 + bloom * 0.7, armR: 0.2 + bloom * 0.7, headTilt: -0.1 + bloom * 0.1 },
            { face: bloom > 0.4 ? 'joy' : 'calm' },
            f.hand('person'),
          );
          // The void in the chest: night, a few dead stars.
          const v = progress(t, voidAt - 1.2, 1.2, ease.outCubic);
          if (v > 0) {
            const r = 78 * v;
            ctx.save();
            ctx.beginPath();
            ctx.ellipse(0, -205, r, r * 1.05, 0, 0, Math.PI * 2);
            ctx.clip();
            cutout(
              ctx,
              ellipseShape(0, -205, r + 6, r * 1.05 + 6),
              { color: C.night, torn: 3, rim: 0, shadow: 0, grain: 0.9 },
              f.hand('void'),
            );
            for (let i = 0; i < 9; i++)
              star(
                ctx,
                -60 + hash2(i, 1) * 120,
                -260 + hash2(i, 2) * 110,
                3 + hash2(i, 3) * 4,
                C.robe,
                0.35,
              );
            // Light arrives inside.
            if (bloom > 0) sun(ctx, 0, -205, 34, bloom, f.hand('inner-sun'), t * 0.2);
            ctx.restore();
            stroke(
              ctx,
              ellipseShape(0, -205, r + 2, r * 1.05 + 2, 40).concat([[r + 2, -205]]),
              { color: bloom > 0.3 ? C.gold : C.tealDeep, width: 5, jitter: 1 },
              f.hand('void-rim'),
            );
          }
          // Warmth spilling out.
          if (bloom > 0.3) {
            for (let i = 0; i < 12; i++) {
              const a = (i / 12) * Math.PI * 2 + t * 0.1;
              const r0 = 95;
              const r1 = 95 + 60 * ease.outBack(clamp((bloom - 0.3) / 0.7));
              stroke(
                ctx,
                line(
                  [Math.cos(a) * r0, -205 + Math.sin(a) * r0],
                  [Math.cos(a) * r1, -205 + Math.sin(a) * r1],
                  0,
                  i,
                ),
                { color: i % 2 ? C.gold : C.orange, width: 9, alpha: 0.9 },
                f.hand(`spill${i}`),
              );
            }
          }
        });
      });
    }
    quote(
      f,
      '“Christ has spoken the word only, and in the darkened void of man’s life there is righteousness to everyone who will receive it.”',
      960,
      185,
      1560,
      { from: 'spoken', size: 52, align: 'center' },
    );
    cite(f, 'Romans 3:24', j - 0.2, fiction + 0.2, 0);
    cite(f, 'A. T. Jones, Lessons on Faith', spoken - 0.1, f.dur, 0);
  },
});
