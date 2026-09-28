// Look: what faith does. First the parchment: the grey figure holds up a
// stack of coins, medals and good deeds as if they could pay, and it slides
// off; then a plain open hand, palm up, and a gold light laid in it: faith is
// the hand that takes hold of Christ. Then a warm desert camp under a peach
// sky, scarlet paper snakes in the sand, a bitten figure. The bronze serpent
// rises on its pole; the figure tries to climb it, straining, slipping; then
// stops, slides down, steps back and simply looks up, and the camera closes
// on their face as the bites fade and the light reaches them.

import {
  type Camera,
  type Pt,
  at,
  drawing,
  ellipseShape,
  multiplane,
  rectShape,
  shotPath,
  spline,
  stroke,
  sub,
} from '@bible/film/canvas';
import { clamp, lerp } from '@bible/film/core';
import { C, blob, glow, knobCamera, openHand, person, piece, rounded, sky } from '../kit.ts';

/** The desert wide: the unmoved frame (the canvas itself, so not a knob). */
const WIDE: Camera = { x: 960, y: 540, zoom: 1 };

/** What the figure holds up to pay with, bottom to top: a kind and its offset. */
const STACK = [
  ['card', -4],
  ['coin', 6],
  ['medal', -8],
  ['coin', 4],
  ['card', 8],
  ['coin', -2],
] as const;

/** Bites on the figure in the camp, in their units. */
const BITES = [blob(-18, -40, 12, 10, 41), blob(16, -86, 10, 9, 42), blob(-8, -110, 9, 8, 43)];

/** The snakes in the sand: where each lies, its length and its seed. */
const SNAKES = [
  [340, 985, 150, 1],
  [620, 1030, 120, 2],
  [1470, 1010, 160, 3],
  [1720, 965, 110, 4],
] as const;

const TENTS = [
  [220, 1],
  [470, 2],
  [1540, 3],
  [1790, 4],
] as const;

/** The pole stands this tall above the ground. */
const POLE_H = 620;

export const look = drawing({
  timeline: {
    wonder: { mark: 'faith', dur: 0.5 },
    holdUp: { mark: 'saviour', offset: -0.6, dur: 0.6, ease: 'outBack' },
    slide: { mark: 'saviour', word: 'said', offset: -0.2, dur: 1.3, ease: 'linear' },
    armsDown: { after: 'slide', dur: 0.5 },
    handIn: { mark: 'hand', offset: -0.6, dur: 0.6, ease: 'outCubic' },
    light: { mark: 'hand', offset: 0.3, dur: 1, ease: 'outCubic' },
    toDesert: { mark: 'desert', offset: -0.4, dur: 0.6 },
    rise: { mark: 'pole', offset: -0.2, dur: 1.2, ease: 'outBack' },
    approach: { mark: 'harder', offset: -0.6, dur: 0.7, ease: 'inOutSine' },
    climb: { mark: 'harder', offset: 0.2, dur: 2.2 },
    slideDown: { mark: 'climb', dur: 0.5, ease: 'inCubic' },
    stepBack: { mark: 'climb', offset: 0.6, dur: 0.7, ease: 'inOutSine' },
    // Stepped back, he looks up and the camera pushes in.
    lookUp: { after: 'stepBack', offset: 0.1, dur: 0.6 },
    push: { with: 'lookUp', dur: 1.6, ease: 'inOutCubic' },
    // Healed on "I present Christ".
    heal: { mark: 'climb', word: 'christ', offset: 0.12, dur: 1.5 },
  },
  knobs: {
    pole: [1180, 930],
    figure: [760, 930],
    // Close on the face looking up at the serpent.
    face: [1060, 600],
    faceZoom: 2,
  },
  draw: (f) => {
    const { ctx, w, h, t } = f;
    const hand = (k: string) => f.hand(k);
    const toDesert = f.at('toDesert');

    // ── A: the parchment, the stack that cannot pay, then the open hand ─────
    if (toDesert < 1) {
      sky(ctx, w, h, [
        [0, C.paper],
        [1, C.paper],
      ]);
      const handIn = f.at('handIn');
      if (handIn < 1) {
        ctx.save();
        ctx.globalAlpha *= 1 - handIn;
        const wonder = f.at('wonder');
        const up = f.at('holdUp') * (1 - f.at('armsDown'));
        const slide = f.at('slide');
        const sheepish = f.at('armsDown');
        at(ctx, { x: 820, y: 960, scale: 2.1 }, () => {
          person(
            ctx,
            {
              tilt: 0.12 * wonder * (1 - up) - 0.1 * up + 0.08 * sheepish,
              look: [lerp(2 * wonder, 0, up) + 3 * sheepish, -4 * up + 2 * sheepish],
              browTilt: 0.35 * wonder + 0.3 * sheepish,
              browL: 3 * wonder,
              handL: [lerp(-34, -30, up), lerp(-60, -178, up)],
              handR: [lerp(34, 30, up), lerp(-60, -178, up)],
            },
            hand('figureA'),
          );
          // The stack: held up, then sliding off one piece at a time.
          if (up > 0 || slide > 0)
            STACK.forEach(([kind, dx], i) => {
              const fall = clamp(slide * 1.7 - i * 0.13);
              const x0 = dx;
              const y0 = -190 - i * 22 - 190 * (1 - f.at('holdUp'));
              const x = lerp(x0, 70 + i * 26, fall);
              const y = lerp(y0, -8, fall * fall);
              at(ctx, { x, y, rot: 1.2 * fall * (i % 2 === 0 ? 1 : -1) }, () => {
                const k = sub(hand('item'), i);
                if (kind === 'coin') {
                  piece(ctx, ellipseShape(0, 0, 26, 9), C.gold, k, { role: 'figure', line: 2 });
                } else if (kind === 'medal') {
                  piece(ctx, rounded(0, -18, 16, 22, 3), C.scarlet, sub(k, 1), {
                    role: 'figure',
                    line: 2,
                  });
                  piece(ctx, ellipseShape(0, 2, 16, 16), C.gold, k, { role: 'figure', line: 2 });
                } else {
                  piece(ctx, rounded(0, 0, 70, 20, 3), C.cream, k, { role: 'figure', line: 2 });
                  stroke(
                    ctx,
                    [
                      [-8, 0],
                      [-2, 5],
                      [10, -6],
                    ],
                    { color: C.ink, width: 2.5, jitter: 0.3 },
                    sub(k, 2),
                  );
                }
              });
            });
        });
        ctx.restore();
      }

      // The open hand, palm up, and the gold light laid in it.
      if (handIn > 0) {
        const light = f.at('light');
        ctx.save();
        ctx.globalAlpha *= handIn;
        at(ctx, { x: 960, y: lerp(1000, 760, handIn), scale: 1.25 }, () => {
          openHand(ctx, hand);
          if (light > 0) {
            const y = lerp(-620, 0, light);
            glow(ctx, 0, y, 260, C.glow, 0.5 + 0.5 * light);
            glow(ctx, 0, y, 110, C.gold, 0.6);
            piece(ctx, ellipseShape(0, y, 34, 34), C.gold, hand('light'), {
              role: 'scenery',
              line: 0,
              shadow: 0.2,
            });
          }
        });
        ctx.restore();
      }
    }

    // ── B: the camp in the desert, the serpent on the pole ───────────────────
    if (toDesert > 0) {
      const [px, py] = f.knob('pole');
      const [fx, fy] = f.knob('figure');
      const rise = f.at('rise');
      const approach = f.at('approach');
      const slideDown = f.at('slideDown');
      const stepBack = f.at('stepBack');
      const lookUp = f.at('lookUp');
      const heal = f.at('heal');
      const climbing = f.cue('climb');
      const tries = f.keys('climb', [
        [0, 0],
        [0.227, 110],
        [0.364, 55],
        [0.591, 160],
        [0.727, 95],
        [1, 190],
      ]);
      const height = t > climbing.start ? tries * (1 - slideDown) : 0;
      const onPole = approach * (1 - stepBack);
      const x = lerp(lerp(fx, px - 88, approach), px - 250, stepBack);
      const strain = onPole * (t > climbing.start ? 1 : 0) * (1 - slideDown);
      const jiggle = strain * Math.sin(t * 18) * 3;

      ctx.save();
      ctx.globalAlpha *= toDesert;
      sky(ctx, w, h, [
        [0, C.peachTop],
        [0.7, C.peachLow],
        [1, C.glow],
      ]);
      multiplane(
        ctx,
        shotPath(WIDE, [[f.at('push'), knobCamera(f.knob('face'), f.knob('faceZoom'))]]),
        w,
        h,
        [
          {
            // The dunes and the camp's tents.
            z: 1.5,
            draw: () => {
              piece(ctx, blob(500, 900, 1500, 260, 51), C.boardLight, hand('dune1'), {
                role: 'scenery',
                line: 3,
              });
              piece(ctx, blob(1500, 910, 1400, 240, 52), C.boardLight, hand('dune2'), {
                role: 'scenery',
                line: 3,
              });
              for (const [tx, k] of TENTS) {
                piece(
                  ctx,
                  [
                    [tx - 120, 860],
                    [tx, 680],
                    [tx + 120, 860],
                  ],
                  k % 2 === 0 ? C.board : C.boardShade,
                  sub(hand('tent'), k),
                  { role: 'scenery', kind: 'cut', line: 3.5 },
                );
                piece(
                  ctx,
                  [
                    [tx - 22, 860],
                    [tx, 790],
                    [tx + 22, 860],
                  ],
                  C.boardDeep,
                  sub(hand('flap'), k),
                  { role: 'scenery', kind: 'cut', line: 2 },
                );
              }
            },
          },
          {
            // The sand, the snakes, the pole and the figure.
            z: 1,
            lift: 1.2,
            draw: () => {
              piece(ctx, rectShape(-300, py - 20, 2500, 500), C.peachLow, hand('sand'), {
                role: 'scenery',
                line: 3,
                torn: 3,
              });
              for (const [sx, sy, len, k] of SNAKES) {
                const phase = t * 2 + k;
                const path = Array.from({ length: 14 }, (_, i): Pt => [
                  sx - len / 2 + (i * len) / 13,
                  sy + Math.sin(phase + i * 0.9) * 10,
                ]);
                stroke(
                  ctx,
                  path,
                  { color: C.outline, width: 15, taper: 0.7, jitter: 0.3 },
                  sub(hand('snakeLine'), k),
                );
                stroke(
                  ctx,
                  path,
                  { color: C.scarlet, width: 10, taper: 0.7, jitter: 0.3 },
                  sub(hand('snake'), k),
                );
                const [hx, hy] = path.at(-1) ?? [sx, sy];
                piece(ctx, ellipseShape(hx + 6, hy, 12, 8), C.scarlet, sub(hand('snakeHead'), k), {
                  role: 'figure',
                  line: 2,
                });
              }

              // The pole, and the serpent on it.
              if (rise > 0) {
                const top = py - POLE_H * rise;
                glow(ctx, px, top + 40, 320, C.glow, 0.5 * rise + 0.5 * heal);
                piece(ctx, rectShape(px - 11, top, 22, py - top + 10), C.board, hand('pole'), {
                  role: 'scenery',
                  kind: 'cut',
                  line: 3,
                });
                piece(ctx, rectShape(px - 70, top + 16, 140, 18), C.board, hand('bar'), {
                  role: 'scenery',
                  kind: 'cut',
                  line: 3,
                });
                stroke(
                  ctx,
                  spline([
                    [px - 60, top + 30],
                    [px + 40, top + 60],
                    [px - 40, top + 110],
                    [px + 34, top + 160],
                    [px - 10, top + 200],
                  ]),
                  { color: C.outline, width: 20, taper: 0.5, jitter: 0.3 },
                  hand('serpentLine'),
                );
                stroke(
                  ctx,
                  spline([
                    [px - 60, top + 30],
                    [px + 40, top + 60],
                    [px - 40, top + 110],
                    [px + 34, top + 160],
                    [px - 10, top + 200],
                  ]),
                  { color: C.gold, width: 14, taper: 0.5, jitter: 0.3 },
                  hand('serpent'),
                );
                piece(ctx, ellipseShape(px - 70, top + 26, 16, 12), C.gold, hand('serpentHead'), {
                  role: 'figure',
                  line: 2.5,
                });
              }

              // The bitten one: slumped, then climbing, then looking up.
              at(ctx, { x: x + jiggle, y: fy - height, scale: 1.8, rot: 0.12 * strain }, () => {
                // The light reaches them from behind as the bites fade.
                glow(ctx, 0, -150, 190, C.glow, 0.8 * heal);
                person(
                  ctx,
                  {
                    // Off the sand once they climb.
                    ground: Math.max(0, 1 - height / 40),
                    tilt: 0.15 * (1 - onPole) * (1 - lookUp) - 0.22 * lookUp,
                    nod: 5 * (1 - rise) * (1 - lookUp),
                    look: [
                      lerp(2, 3, lookUp) * (1 - strain) + 3 * strain,
                      lerp(2 - 5 * rise, -5, lookUp),
                    ],
                    browTilt: 0.35 + 0.1 * lookUp - 0.4 * heal,
                    browL: 2 * strain,
                    mouth: 0.5 * strain,
                    stains: heal < 0.5 ? BITES : [],
                    handR: strain > 0 ? [(px - 8 - x) / 1.8, -150] : undefined,
                    handL: strain > 0 ? [(px - 14 - x) / 1.8, -95] : undefined,
                  },
                  hand('bitten'),
                );
              });
            },
          },
        ],
        { rest: [px, 540], haze: C.peachLow, thickness: 0.4 },
      );
      ctx.restore();
    }
  },
});
