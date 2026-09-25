import {
  at,
  drawing,
  cutout,
  type Frame,
  robeShape,
  ellipse,
  ellipseShape,
  line,
  type Pt,
  quad,
  rectShape,
  spline,
  stroke,
  write,
} from '@bible/film/canvas';
import { hash2, clamp, ease, envelope, lerp, progress } from '@bible/film/core';
import { C, cite, hand, quote, star, sun } from '../kit.ts';
import { LINEN, blowRags, loom, mix, person, stains } from './props-2.ts';

const CX = 960;
const FEET = 900;
const S = 1;
const CHEST: [number, number] = [CX, FEET - 205 * S];

const turban = (f: Frame) =>
  cutout(
    f.ctx,
    spline(
      [
        [-62, -392],
        [-50, -432],
        [0, -446],
        [50, -432],
        [62, -392],
        [0, -384],
      ],
      8,
      true,
    ),
    { color: LINEN, torn: 2, rim: 2, shadow: 0.4 },
    f.hand('turban'),
  );

/** Zechariah's vision: filthy garments taken, a robe from heaven's loom, sin taken away. */
export const robe = drawing({
  enter: { kind: 'ink', dur: 0.9, color: C.tealDeep },
  // Let the stain's dissolve and the sunrise breathe after the last word.
  tail: 3.2,
  timeline: {
    /** The filthy garments tear away on the wind. */
    tear: { mark: 'take', offset: 0.1, dur: 2.6, ease: 'linear' },
    /** The robe from heaven descends onto him. */
    robeFalls: { mark: 'clothe', dur: 2, ease: 'inOutCubic' },
  },
  draw: (f) => {
    const { ctx, t } = f;
    const priest = f.mark('priest');
    const filthy = f.mark('filthy');
    const take = f.mark('take');
    const clothe = f.mark('clothe');
    const loomAt = f.mark('loom');
    const cloak = f.mark('cloak');
    const does = f.mark('does');
    const away = f.mark('away');

    const vision = Math.min(1 - progress(t, loomAt - 0.2, 0.7), 1) + progress(t, cloak - 0.3, 0.8);
    const weave = envelope(t, loomAt - 0.2, cloak + 0.3, 0.8, 0.7, ease.inOutCubic);
    const gone = progress(t, away, 1.8, ease.outCubic);

    // ── The vision window. ──────────────────────────────────────────────────
    if (vision > 0) {
      ctx.save();
      ctx.globalAlpha *= clamp(vision);
      const open = progress(t, 0.2, 1.2, ease.outCubic);
      const R = 330 * ease.outBack(open);
      if (gone > 0) sun(ctx, CX, 640, 150, gone, f.hand('halo'), t * 0.06);
      if (R > 1) {
        cutout(
          ctx,
          ellipseShape(CX, 620, R, R, 80),
          {
            color: mix(C.glow, '#fff6dc', gone),
            torn: 3,
            rim: 0,
            shadow: 0.2,
            grain: 0.4,
            alpha: 0.9,
          },
          f.hand('window'),
        );
        stroke(
          ctx,
          ellipse(CX, 620, R, R, 4, 0.2),
          { color: C.gold, width: 12, progress: open, jitter: 1.4 },
          f.hand('ring'),
        );
      }
      write(ctx, 'Zechariah 3', 1330, 330, hand(58, C.orange), f.hand('zech'), {
        progress: progress(t, 0.9, 1, ease.linear),
        reveal: 'write',
      });
      // Before the priest appears: the vision opening, stars drifting in it.
      const seen = f.words.find((w) => w.text.startsWith('vision'))?.start ?? 2;
      const dream = envelope(t, 0.6, priest - 0.1, 0.8, 0.5);
      if (dream > 0)
        for (let i = 0; i < 18; i++) {
          const a = hash2(i, 1) * Math.PI * 2;
          const d = 60 + hash2(i, 2) * 230 + Math.sin(t * 0.8 + i) * 10;
          star(
            ctx,
            CX + Math.cos(a + t * 0.05) * d,
            620 + Math.sin(a + t * 0.05) * d,
            6 + hash2(i, 3) * 8,
            i % 3 ? C.gold : C.orange,
            dream * (0.5 + 0.5 * Math.sin(t * 3 + i) ** 2),
          );
        }
      const v = envelope(t, seen - 0.3, priest - 0.1, 0.3, 0.4);
      if (v > 0) {
        ctx.save();
        ctx.globalAlpha *= v;
        write(
          ctx,
          'a vision',
          CX,
          650,
          { ...hand(110, C.orange), align: 'center' },
          f.hand('vision'),
          { progress: progress(t, seen - 0.3, 0.8, ease.linear), reveal: 'write' },
        );
        ctx.restore();
      }

      const pop = progress(t, priest - 0.3, 0.8, ease.outBack);
      if (pop > 0) {
        const soiled = progress(t, filthy, 1);
        const bare = progress(t, take + 0.2, 0.5);
        const land = f.at('robeFalls');
        const landed = f.cue('robeFalls').end;
        const clothed = land >= 1;
        const joy = clothed || gone > 0;
        at(ctx, { x: CX, y: FEET, scale: S * pop }, () => {
          // Stink lines while the garments are filthy.
          const stink = envelope(t, filthy + 0.3, take + 0.3, 0.6, 0.4);
          if (stink > 0)
            for (let i = 0; i < 3; i++) {
              const x = -90 + i * 90;
              const pts = Array.from({ length: 14 }, (_, k): Pt => [
                x + Math.sin(k * 0.9 + t * 4 + i) * 12,
                -330 - k * 10,
              ]);
              stroke(
                ctx,
                pts,
                { color: C.teal, width: 5, alpha: stink * 0.8 },
                f.hand(`stink${i}`),
              );
            }
          const robeColor = clothed ? C.robe : bare > 0 ? mix(C.teal, LINEN, bare) : C.teal;
          person(
            ctx,
            {
              armL: 0.15 + (joy ? 0.9 : 0) * progress(t, landed, 1),
              armR: 0.15 + (joy ? 0.9 : 0) * progress(t, landed, 1),
              headTilt: soiled > 0 && !joy ? -0.14 : 0,
            },
            {
              robe: robeColor,
              rags: !clothed && bare === 0,
              face: joy ? 'joy' : soiled > 0.5 ? 'sad' : 'calm',
            },
            f.hand('priest'),
          );
          if (bare === 0) stains(ctx, f.hand('stains'), soiled);
          // The filthy garments tear away on the wind.
          if (t > take) blowRags(ctx, f.at('tear'), f.hand('rags'), C.teal, 1);
          turban(f);
        });
        // The descending robe is drawn in world space above the figure.
        if (land > 0 && land < 1) {
          at(ctx, { x: CX, y: lerp(FEET - 620, FEET, land), scale: S }, () =>
            cutout(
              ctx,
              robeShape(false, 7),
              { color: C.robe, torn: 2.5, rim: 3, shadow: 0.9, grain: 0.5 },
              f.hand('robe-fall'),
            ),
          );
        }
        // Sparkle as it settles.
        const settle = envelope(t, clothe + 1.8, clothe + 3.4, 0.2, 0.8);
        if (settle > 0)
          for (let i = 0; i < 14; i++) {
            const a = (i / 14) * Math.PI * 2;
            const d = 160 + progress(t, clothe + 1.8, 1.6, ease.outCubic) * 140;
            star(
              ctx,
              CX + Math.cos(a) * d,
              FEET - 190 + Math.sin(a) * d * 1.2,
              10 + hash2(i, 1) * 10,
              i % 2 ? C.gold : C.robe,
              settle,
            );
          }
      }

      // ── It is no cover-up: a lens shows what lies beneath. ────────────────
      const lens = envelope(t, cloak + 0.6, away + 1.4, 0.8, 0.6, ease.outBack);
      if (lens > 0) {
        const [lx, ly] = CHEST;
        const r = 110 * lens;
        const sin = 1 - progress(t, away, 1.2, ease.inCubic);
        ctx.save();
        ctx.beginPath();
        ctx.arc(lx, ly, r, 0, Math.PI * 2);
        ctx.clip();
        ctx.fillStyle = LINEN;
        ctx.fillRect(lx - r, ly - r, r * 2, r * 2);
        if (sin > 0) {
          at(ctx, { x: lx, y: ly, scale: 0.4 + 0.6 * sin }, () =>
            cutout(
              ctx,
              spline(
                [
                  [-50, -20],
                  [-20, -48],
                  [30, -40],
                  [52, 4],
                  [20, 44],
                  [-36, 36],
                ],
                8,
                true,
              ),
              { color: C.tealDeep, torn: 5, rim: 0, shadow: 0, grain: 0.9, alpha: sin },
              f.hand('sin'),
            ),
          );
        }
        // A cloak thrown over the sin — "does not furnish a cloak" — and pulled off again.
        const cover =
          progress(t, does + 0.6, 0.6, ease.outCubic) - progress(t, does + 2.2, 0.7, ease.inCubic);
        if (cover > 0) {
          at(
            ctx,
            {
              x: lx + (1 - cover) * -r * 2,
              y: ly - (does + 2.2 < t ? (1 - cover) * r * 2 : 0),
              rot: -0.2 * (1 - cover),
            },
            () =>
              cutout(
                ctx,
                rectShape(-70, -60, 140, 120),
                { color: C.tealPale, torn: 4, rim: 3, shadow: 0.6, grain: 0.6 },
                f.hand('false-cloak'),
              ),
          );
        }
        ctx.restore();
        stroke(
          ctx,
          ellipse(lx, ly, r + 4, r + 4, 3, 0.05),
          { color: C.ink, width: 11 },
          f.hand('lens'),
        );
        stroke(
          ctx,
          line([lx + r * 0.72, ly + r * 0.72], [lx + r * 1.5, ly + r * 1.5], 0.01, 2),
          { color: C.clay, width: 26, taper: 0.05 },
          f.hand('handle'),
        );
        // The sin breaks into gold and rises away.
        const lift = progress(t, away - 0.1, 1.8, ease.outCubic);
        if (lift > 0 && lift < 1)
          for (let i = 0; i < 18; i++) {
            const x = lx + (hash2(i, 1) - 0.5) * 80 + Math.sin(lift * 4 + i) * 30;
            const y = ly - lift * (260 + hash2(i, 2) * 260);
            at(ctx, { x, y, rot: lift * 4 * (hash2(i, 3) - 0.5), scale: 1 - lift * 0.5 }, () =>
              cutout(
                ctx,
                [
                  [-18, -10],
                  [16, -14],
                  [14, 12],
                  [-15, 14],
                ],
                {
                  color: i % 2 ? C.gold : C.orange,
                  torn: 1.5,
                  rim: 1.5,
                  shadow: 0.3,
                  alpha: 1 - lift,
                },
                f.hand(`petal${i}`),
              ),
            );
          }
      }
      ctx.restore();
    }

    // ── The loom of heaven. ─────────────────────────────────────────────────
    if (weave > 0) {
      ctx.save();
      ctx.globalAlpha *= weave;
      at(ctx, { x: CX, y: 610, scale: 0.94 + 0.06 * weave }, () => {
        cutout(
          ctx,
          rectShape(-700, -330, 1400, 660),
          { color: C.night, torn: 5, rim: 4, shadow: 0.8, grain: 0.8 },
          f.hand('heaven'),
        );
        for (let i = 0; i < 40; i++)
          star(
            ctx,
            -660 + hash2(i, 1) * 1320,
            -300 + hash2(i, 2) * 600,
            3 + hash2(i, 3) * 6,
            C.robe,
            0.3 + 0.4 * Math.sin(t * 2 + i) ** 2,
          );
        const woven = progress(t, loomAt + 0.4, cloak - loomAt - 0.8, ease.linear);
        loom(ctx, woven, t, f.hand('loom'), 820, 440);
        // A thread of human devising tries to get in — and falls away.
        const human = f.words.find((w) => w.text.startsWith('human'))?.start ?? loomAt + 6;
        const tryIn = progress(t, human - 1.6, 1.4, ease.outCubic);
        const fall = progress(t, human + 0.4, 1.4, ease.inCubic);
        if (tryIn > 0 && fall < 1) {
          const tip = lerp(-640, -470, tryIn);
          const pts = Array.from({ length: 20 }, (_, k): Pt => {
            const u = k / 19;
            return [lerp(-690, tip, u), 40 + Math.sin(u * 9 + t * 3) * 10 + fall * fall * 500 * u];
          });
          stroke(ctx, pts, { color: C.teal, width: 9, alpha: 1 - fall }, f.hand('human'));
          write(
            ctx,
            'human effort',
            -575,
            -10 + fall * 200,
            { ...hand(40, C.robe), align: 'center' },
            f.hand('human-t'),
            { alpha: 1 - fall },
          );
        }
      });
      ctx.restore();
    }

    // ── Words. ──────────────────────────────────────────────────────────────
    quote(
      f,
      '“Take away the filthy garments from him,” … “I will clothe thee with change of raiment.”',
      960,
      170,
      1600,
      { from: 'take', to: 'loom', until: loomAt - 0.2, size: 52, align: 'center' },
    );
    cite(f, 'Zechariah 3:4', take - 0.3, loomAt - 0.2, 0);
    quote(
      f,
      '“woven in the loom of heaven, has in it not one thread of human devising.”',
      960,
      170,
      1500,
      { from: 'loom', to: 'cloak', until: cloak - 0.1, size: 58, align: 'center' },
    );
    cite(f, 'Ellen G. White, Christ’s Object Lessons', loomAt, cloak, 0);
    const cover = envelope(t, cloak + 0.2, does - 0.1, 0.4, 0.4);
    if (cover > 0) {
      ctx.save();
      ctx.globalAlpha *= cover;
      write(
        ctx,
        'no cover-up',
        1470,
        520,
        { ...hand(72, C.orange), align: 'center' },
        f.hand('cover'),
        { progress: progress(t, cloak + 0.2, 0.9, ease.linear), reveal: 'write' },
      );
      stroke(
        ctx,
        quad([1330, 560], [1260, 620], [1150, 670]),
        { color: C.orange, width: 6, progress: progress(t, cloak + 1, 0.6) },
        f.hand('cover-arrow'),
      );
      ctx.restore();
    }
    quote(f, '“does not furnish a cloak for sin but takes the sin away.”', 960, 170, 1500, {
      from: 'does',
      size: 60,
      align: 'center',
    });
    cite(f, 'E. J. Waggoner, Christ and His Righteousness', does - 0.2, f.dur, 0);
  },
});
