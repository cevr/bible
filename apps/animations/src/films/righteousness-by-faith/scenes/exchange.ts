// The exchange: a sunset path at the foot of a cardboard hill. The grey figure
// from the cold open, the same stains on their garment, asks how God can be
// fair; Jesus walks up to them, and the camera closes on both faces. On "took"
// the scarlet lifts off the figure as a cloth and settles on his shoulders,
// and he carries it up the hill. On "cross" the film's one black moment: the
// hill, the cross and the figure in silhouette against the last red of the
// sky. On "rose" dawn: the empty tomb, the stone rolled back, the grave
// cloths folded. On "up" the camera rises with him into a teal sky, to the
// gold sanctuary in heaven with its two rooms, where he stands as high priest;
// on "plead" the veil draws up and he pleads before the ark. Last, the pull
// back to the three icons, the robe's lit.

import {
  type Camera,
  type Pt,
  at,
  camera,
  drawing,
  ellipseShape,
  rectShape,
  sub,
} from '@bible/film/canvas';
import { clamp, lerp } from '@bible/film/core';
import {
  C,
  blob,
  christ,
  gait,
  glow,
  icons,
  person,
  piece,
  rounded,
  sky,
  between,
} from '../kit.ts';
import { FIGURE_STAINS } from '../court.ts';
import { HOLY_PLACE, IN_SANCTUARY, MOST_HOLY, highPriest, sanctuary } from '../heaven.ts';

/** The whole hill; close on both faces; up in heaven at the sanctuary. */
const WIDE: Camera = { x: 960, y: 540, zoom: 1 };
const CLOSE: Camera = { x: 700, y: 650, zoom: 2.1 };
const HEAVEN: Camera = { x: 960, y: -560, zoom: 1 };

const SCALE = 1.9;
/** Where Jesus stops beside the figure, and the hilltop where the cross stands. */
const BESIDE = 830;
const TOP = 1450;

/** The hill's ridge: its height at x. */
const ridge = (x: number) => 960 - 500 * Math.exp(-(((x - TOP) / 330) ** 2));
const HILL: Pt[] = [
  ...Array.from({ length: 36 }, (_, i): Pt => {
    const x = 780 + i * 40;
    return [x, ridge(x)];
  }),
  [2200, 1120],
  [780, 1120],
];

/** Where the sanctuary's floor stands in heaven, and its scale. */
const SANCTUARY: Pt = [960, -280];
const SS = 0.8;
const inHeaven = ([x, y]: Pt): Pt => [SANCTUARY[0] + x * SS, SANCTUARY[1] + y * SS];

export const exchange = drawing({
  timeline: {
    puzzle: { mark: 'fair', dur: 0.4 },
    walkIn: { mark: 'notes', offset: -1, dur: 4.4, ease: 'inOutSine' },
    close: { mark: 'treated', offset: -0.4, dur: 1, ease: 'inOutCubic' },
    lift: { mark: 'took', dur: 1.2, ease: 'inOutSine' },
    back: { mark: 'took', offset: 1.1, dur: 1.3, ease: 'inOutCubic' },
    walkUp: { mark: 'took', offset: 1.3, dur: 1.9, ease: 'inOutSine' },
    dark: { mark: 'cross', offset: -0.4, dur: 0.9, ease: 'inOutSine' },
    dawn: { mark: 'rose', offset: -0.3, dur: 1, ease: 'inOutSine' },
    ascend: { mark: 'up', dur: 1.9, ease: 'inOutCubic' },
    robed: { after: 'ascend', dur: 0.5 },
    veil: { mark: 'plead', offset: -0.4, dur: 1, ease: 'inOutSine' },
    within: { mark: 'plead', offset: 0.1, dur: 0.9, ease: 'inOutSine' },
    hands: { mark: 'plead', offset: 0.8, dur: 0.6, ease: 'outBack' },
    toIcons: { mark: 'plead', offset: 2.6, dur: 0.3 },
    pullBack: { with: 'toIcons', dur: 0.7, ease: 'outCubic' },
    iconGlow: { after: 'pullBack', dur: 0.5 },
  },
  knobs: { figure: [560, 960] },
  draw: (f) => {
    const { ctx, w, h, t } = f;
    const hand = (k: string) => f.hand(k);
    const [fx, fy] = f.knob('figure');

    const lift = f.at('lift');
    const walkUp = f.at('walkUp');
    const dark = f.at('dark');
    const dawn = f.at('dawn');
    const toIcons = f.at('toIcons');

    // Jesus: walking in, then up the hill with the cloth.
    const walkIn = f.at('walkIn');
    const cx = walkUp > 0 ? lerp(BESIDE, TOP - 50, walkUp) : lerp(2120, BESIDE, walkIn);
    const cy = walkUp > 0 ? ridge(cx) : fy;
    const cs = lerp(SCALE, 1.15, walkUp);
    // His steps keep the scene clock (phase 0) across both walks.
    const walking = gait(t, f.cue('walkIn'), 0) + gait(t, f.cue('walkUp'), 0);
    const shoulders: Pt = [cx, cy - walking - 118 * cs];

    // ── A–B: the hill at sunset, until dawn has fully come ──────────────────
    if (dawn < 1 && toIcons < 1) {
      const cam = between(between(WIDE, CLOSE, f.at('close')), WIDE, f.at('back'));
      sky(ctx, w, h, [
        [0, C.sunsetTop],
        [0.55, C.peachTop],
        [1, C.peachLow],
      ]);
      camera(ctx, cam, w, h, () => {
        glow(ctx, 1450, 700, 520, C.glow, 0.6);
        piece(ctx, HILL, C.board, hand('hill'), { line: 4, torn: 2 });
        piece(ctx, rectShape(-200, 950, 2400, 300), C.boardShade, hand('ground'), {
          line: 0,
          torn: 4,
        });

        // The figure: puzzled on "fair", then watching him go.
        const puzzle = f.at('puzzle') * (1 - f.at('close'));
        const after = clamp(walkUp * 2);
        at(ctx, { x: fx, y: fy, scale: SCALE }, () =>
          person(
            ctx,
            {
              tilt: -0.12 * puzzle + 0.1 * walkIn * (1 - after) - 0.14 * after,
              look: [lerp(3 * walkIn, 3, after), lerp(-2 * puzzle, -4, after)],
              browTilt: 0.35 * puzzle + 0.3 * after,
              browL: 3 * puzzle,
              mouth: puzzle * 0.6,
              stains: lift < 0.05 ? FIGURE_STAINS : [],
            },
            hand('figure'),
          ),
        );

        // Jesus, facing the figure, the cloth on his shoulders once it lands.
        at(ctx, { x: cx, y: cy - walking, scale: cs }, () =>
          christ(
            ctx,
            {
              tilt: 0.08 * walkUp,
              nod: 4 * walkUp,
              look: [lerp(-3, 2, walkUp), lerp(0, -1, walkUp)],
              browTilt: 0.3,
            },
            hand,
          ),
        );

        // The scarlet cloth: lifted off the figure, onto his shoulders.
        if (lift > 0) {
          const from: Pt = [fx + 10, fy - 76 * SCALE];
          const p: Pt = [
            lerp(from[0], shoulders[0], lift),
            lerp(from[1], shoulders[1], lift) - 120 * Math.sin(Math.PI * lift),
          ];
          const s = lerp(SCALE, cs, lift);
          at(ctx, { x: p[0], y: p[1], scale: s, rot: 0.3 * Math.sin(Math.PI * lift) }, () =>
            piece(
              ctx,
              blob(0, 0, lerp(70, 120, lift), lerp(70, 34, lift), 31),
              C.scarlet,
              hand('cloth'),
              { line: 2.5, torn: 2.5 },
            ),
          );
        }
      });

      // ── C: the one black moment ────────────────────────────────────────────
      if (dark > 0) {
        ctx.save();
        ctx.globalAlpha *= dark;
        sky(ctx, w, h, [
          [0, C.night],
          [0.3, C.sunsetLow],
          [0.7, C.scarletShade],
          [1, C.sunsetLow],
        ]);
        // The last of the light, low behind the hill.
        glow(ctx, TOP, 420, 520, C.sunsetTop, 0.7);
        const black = { body: C.night, shade: C.night, skin: C.night };
        camera(ctx, WIDE, w, h, () => {
          piece(ctx, HILL, C.night, hand('hillDark'), { line: 0, torn: 2, shadow: 0 });
          piece(ctx, rectShape(-200, 950, 2400, 300), C.night, hand('groundDark'), {
            line: 0,
            shadow: 0,
          });
          const foot = ridge(TOP);
          piece(ctx, rectShape(TOP - 13, foot - 300, 26, 310), C.night, hand('upright'), {
            line: 0,
            shadow: 0,
          });
          const nailed = foot - 50;
          const beam = nailed - 118 * 1.2 - 12;
          piece(ctx, rectShape(TOP - 150, beam - 12, 300, 24), C.night, hand('beam'), {
            line: 0,
            shadow: 0,
          });
          at(ctx, { x: TOP, y: nailed, scale: 1.2 }, () =>
            person(
              ctx,
              { ...black, nod: 8, tilt: 0.3, handL: [-95, -120], handR: [95, -120] },
              hand('crossed'),
            ),
          );
          at(ctx, { x: fx, y: fy, scale: SCALE }, () =>
            person(ctx, { ...black, tilt: -0.14, look: [3, -4] }, hand('figureDark')),
          );
        });
        ctx.restore();
      }
    }

    // ── D–E: dawn at the tomb, then up into heaven ───────────────────────────
    if (dawn > 0 && toIcons < 1) {
      const ascend = f.at('ascend');
      const veil = f.at('veil');
      const within = f.at('within');
      const hands = f.at('hands');
      ctx.save();
      ctx.globalAlpha *= dawn;
      sky(ctx, w, h, [
        [0, C.dawnTop],
        [0.6, C.dawnLow],
        [1, C.peachLow],
      ]);
      if (ascend > 0) {
        ctx.save();
        ctx.globalAlpha *= ascend;
        sky(ctx, w, h, [
          [0, C.tealTop],
          [0.55, C.tealMid],
          [1, C.tealLow],
        ]);
        ctx.restore();
      }
      const zoomIn = 0.25 * veil;
      const cam = between(WIDE, HEAVEN, ascend);
      const focus: Pt = inHeaven([lerp(0, MOST_HOLY[0] * 0.6, veil), -300]);
      camera(
        ctx,
        {
          x: lerp(cam.x, focus[0], veil),
          y: lerp(cam.y, focus[1], veil),
          zoom: 1 + zoomIn,
        },
        w,
        h,
        () => {
          // The garden tomb, open, the stone rolled back.
          glow(ctx, 380, 900, 600, C.glow, 0.9);
          piece(ctx, blob(1220, 900, 1250, 980, 7), C.boardLight, hand('rock'), { line: 4 });
          piece(ctx, rectShape(-200, 950, 2400, 300), C.board, hand('garden'), {
            line: 0,
            torn: 4,
          });
          piece(ctx, rounded(1090, 810, 250, 300, 110), C.boardDeep, hand('door'), { line: 4 });
          glow(ctx, 1090, 860, 220, C.glow, 0.55);
          for (const [x, y, wd, k] of [
            [1050, 905, 110, 1],
            [1130, 915, 70, 2],
          ] as const)
            piece(ctx, rounded(x, y, wd, 26, 10), C.robe, sub(hand('cloths'), k), { line: 2.5 });
          at(ctx, { x: 1440, y: 830, rot: 0.4 }, () => {
            piece(ctx, ellipseShape(0, 0, 130, 130), C.board, hand('stone'), { line: 4 });
            piece(ctx, ellipseShape(0, 0, 60, 60), C.boardShade, hand('stoneCore'), {
              line: 2,
              shadow: 0,
            });
          });
          for (const [x, k] of [
            [180, 1],
            [470, 2],
            [760, 3],
            [1690, 4],
          ] as const)
            piece(ctx, blob(x, 950, 70, 40, 90 + k), C.tealMid, sub(hand('tuft'), k), {
              line: 2.5,
            });

          // Clouds between earth and heaven.
          for (const [x, y, k] of [
            [300, -160, 1],
            [900, -120, 2],
            [1550, -180, 3],
          ] as const)
            piece(ctx, blob(x, y, 260, 70, 120 + k), C.robe, sub(hand('cloud'), k), {
              line: 3,
              alpha: 0.95,
            });

          // The sanctuary in heaven: he stands in the holy place, then within the veil.
          const priest = (spot: Pt, alpha: number, raised: number) => {
            if (alpha <= 0) return;
            ctx.save();
            ctx.globalAlpha *= alpha;
            at(ctx, { x: spot[0], y: spot[1], scale: IN_SANCTUARY }, () =>
              highPriest(
                ctx,
                {
                  look: [3, -1 - 2 * raised],
                  browTilt: 0.3 + 0.2 * raised,
                  handL: [lerp(-30, -72, raised), lerp(-58, -196, raised)],
                  handR: [lerp(30, 72, raised), lerp(-58, -196, raised)],
                },
                hand,
                f.at('robed'),
              ),
            );
            ctx.restore();
          };
          const arrived = ascend >= 1;
          at(ctx, { x: SANCTUARY[0], y: SANCTUARY[1], scale: SS }, () =>
            sanctuary(ctx, hand, veil, veil, () => {
              if (!arrived) return;
              priest(HOLY_PLACE, 1 - within, 0);
              priest(MOST_HOLY, within, hands);
            }),
          );

          // Rising with the camera from the garden to the holy place.
          if (ascend > 0 && !arrived) {
            const [hx, hy] = inHeaven(HOLY_PLACE);
            glow(ctx, lerp(1000, hx, ascend), lerp(930, hy, ascend) - 250, 300, C.glow, 0.8);
            at(
              ctx,
              {
                x: lerp(1000, hx, ascend),
                y: lerp(930, hy, ascend),
                scale: lerp(1.5, IN_SANCTUARY * SS, ascend),
              },
              () => christ(ctx, { look: [0, -3], browTilt: 0.2 }, hand),
            );
          }
        },
      );
      ctx.restore();
    }

    // ── F: pull back to the three icons, the robe's lit ─────────────────────
    if (toIcons > 0) {
      const pull = f.at('pullBack');
      ctx.save();
      ctx.globalAlpha *= toIcons;
      sky(ctx, w, h, [
        [0, C.glow],
        [1, C.peachLow],
      ]);
      at(ctx, { x: 960, y: lerp(-160, 540, pull), scale: lerp(2.3, 1, pull) }, () =>
        icons(ctx, hand, [0, f.at('iconGlow'), 0]),
      );
      ctx.restore();
    }
  },
});
