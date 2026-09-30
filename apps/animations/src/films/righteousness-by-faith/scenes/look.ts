// Look: what faith does. First the parchment: the grey figure holds up a
// stack of coins, medals and good deeds as if they could pay, and it slides
// off; then a plain open hand, palm up, and a gold light laid in it: faith is
// the hand that takes hold of Christ. Then a warm desert camp under a peach
// sky, scarlet paper snakes in the sand, a bitten figure. The bronze serpent
// rises on its pole; the figure tries to climb it, straining, slipping; then
// stops, slides down, steps back and simply looks up, and the camera closes
// on their face as the bites fade and the light reaches them. After the last
// word, faith's icon pulls back to the section head's row, glowing, and for a
// breath the four faces at the hole in `roof` show under it, lit gold.

import {
  type Camera,
  type Frame,
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
import { AT_THE_HOLE, RECALL_RISE, house, recall } from '../gospel.ts';
import {
  type GestureAt,
  C,
  ICON_ROW,
  ICON_SKY,
  ICON_X,
  type IconCount,
  type Posed,
  blob,
  glow,
  icons,
  knobCamera,
  type HandPush,
  person,
  pushZoom,
  pushedHand,
  piece,
  rounded,
  sky,
} from '../kit.ts';

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

/** The figure on the parchment: where they stand and their scale. */
const FIGURE_A: Pt = [820, 960];
const FIGURE_A_S = 2.1;
/** The stack's bottom card, held up clear over the head (its top is at -203). */
const STACK_Y = -226;
/** Where each hand holds the bottom card: its ends, outside the head. */
const HOLD_AT: Pt = [44, STACK_Y + 4];
const HOLD_FAR: GestureAt = { to: [-HOLD_AT[0], HOLD_AT[1]], reach: 0, grip: 'hold' };
/** The near hand: on the stack, then down to `OFFER_AT`, turning palm up (`palmUp`). */
const OFFER_AT: Pt = [50, -130];
const OPEN: GestureAt = { to: [HOLD_AT[0], HOLD_AT[1]], reach: 0, grip: 'hold', turn: 0 };
/** The close-up: where its palm's middle sits, and its scale. */
const CLOSE_AT: Pt = [960, 720];
const CLOSE_S = 1.6;
/** The push from the figure's palm-up hand into the close-up, and how far it magnifies the figure. */
const PUSH: HandPush = {
  from: [FIGURE_A[0] + OFFER_AT[0] * FIGURE_A_S, FIGURE_A[1] + OFFER_AT[1] * FIGURE_A_S],
  figureScale: FIGURE_A_S,
  to: CLOSE_AT,
  scale: CLOSE_S,
};
const INTO_HAND = pushZoom(FIGURE_A_S, CLOSE_S);
/** Where the light laid in the close-up starts, above the frame, in the hand's units. */
const LIGHT_FROM = -680;
/** The climber's hands on the pole, one high and one low (their x follows the pole each frame). */
const ON_POLE_HIGH: GestureAt = { to: [0, -150], reach: 0, grip: 'hold' };
const ON_POLE_LOW: GestureAt = { to: [0, -95], reach: 0, grip: 'hold' };
/** Their hands as they look up, together at the chest (reach written each frame). */
const AT_CHEST_NEAR: GestureAt = { to: [16, -104], reach: 0, grip: 'open' };
const AT_CHEST_FAR: GestureAt = { to: [-12, -100], reach: 0, grip: 'open' };

/** The pole stands this tall above the ground. */
const POLE_H = 620;

const timeline = {
  wonder: { mark: 'faith', dur: 0.5 },
  holdUp: { mark: 'saviour', dur: 0.6, ends: true, ease: 'outBack' },
  // Their hands go up to where the stack comes down into them, and down once it has slid off.
  handsUp: { mark: 'saviour', offset: -0.9, dur: 0.8, ease: 'inOutSine' },
  slide: { mark: 'saviour', word: 'said', offset: -0.2, dur: 1.3, ease: 'linear' },
  armsDown: { after: 'slide', dur: 0.5 },
  handsDown: { after: 'slide', dur: 0.8, ease: 'inOutSine' },
  // As the stack goes, their near hand comes down open, and the camera
  // pushes into it: the close-up. Once the light is laid in it, back out
  // to them holding it.
  offer: { with: 'handIn', dur: 0.5, ends: true },
  // Coming down, the hand that held the stack turns palm up: the close-up's shape.
  palmUp: { mark: 'hand', offset: -0.85, dur: 0.25, ease: 'inOutSine' },
  handIn: { mark: 'hand', dur: 0.6, ends: true, ease: 'inOutCubic' },
  light: { mark: 'hand', offset: 0.3, dur: 1, ease: 'outCubic' },
  handOut: { after: 'light', dur: 0.6, ease: 'inOutCubic' },
  toDesert: { mark: 'desert', offset: -0.4, dur: 0.6 },
  rise: { mark: 'pole', offset: -0.2, dur: 1.2, ease: 'outBack' },
  approach: { mark: 'harder', offset: -0.6, dur: 0.7, ease: 'inOutSine' },
  climb: { mark: 'harder', offset: 0.2, dur: 2.2 },
  // Their hands take the pole as they start to climb, and let go as they slide down.
  grasp: { with: 'climb', dur: 0.6, ease: 'inOutSine' },
  slideDown: { mark: 'climb', dur: 0.5, ease: 'inCubic' },
  letGo: { with: 'slideDown', dur: 0.5 },
  stepBack: { mark: 'climb', offset: 0.6, dur: 0.7, ease: 'inOutSine' },
  // Stepped back, he looks up and the camera pushes in.
  lookUp: { after: 'stepBack', offset: 0.1, dur: 0.6 },
  push: { with: 'lookUp', dur: 1.6, ease: 'inOutCubic' },
  // Healed on "I present Christ".
  heal: { mark: 'climb', word: 'christ', offset: 0.12, dur: 1.5 },
  // After the last word: the face gives way to faith's icon close, pulled back
  // to the row, faith glowing; for a breath, under it, the four faces at the
  // hole in the roof, lit gold (the callback to `roof`).
  toIcons: { at: 'speechEnd', offset: 0.1, dur: 0.4 },
  pullBack: { at: 'speechEnd', offset: 0.1, dur: 0.9, ease: 'inOutSine' },
  // Faith pops forward in gold as the row settles, the other two faded back.
  iconGlow: { at: 'speechEnd', offset: 0.3, dur: 0.6, ease: 'outBack' },
  hole: { at: 'speechEnd', offset: 1, dur: 0.6, ease: 'inOutSine' },
  holeOut: { at: 'end', offset: -0.6, dur: 0.5, ease: 'inOutSine' },
} as const;
const knobs = {
  pole: [1180, 930],
  figure: [760, 930],
  // Close on the face looking up at the serpent.
  face: [1060, 600],
  faceZoom: 2,
} as const;

type LookFrame = Frame<keyof typeof timeline & string, typeof knobs>;

export const look = drawing({
  timeline,
  knobs,
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
      // The push into the offered hand and back out: 0 on the figure, 1 on the close-up.
      const into = f.at('handIn') * (1 - f.at('handOut'));
      const light = f.at('light');
      const [hx, hy] = OFFER_AT;
      const zoom = INTO_HAND ** into;
      const handX = lerp(FIGURE_A[0] + hx * FIGURE_A_S, CLOSE_AT[0], into);
      const handY = lerp(FIGURE_A[1] + hy * FIGURE_A_S, CLOSE_AT[1], into);
      if (into < 1) {
        ctx.save();
        ctx.globalAlpha *= 1 - clamp(1.6 * into);
        const wonder = f.at('wonder');
        const up = f.at('holdUp') * (1 - f.at('armsDown'));
        const slide = f.at('slide');
        const sheepish = f.at('armsDown');
        const offer = f.at('offer');
        // The stack's bottom card, where both hands hold it up (over the head, never on it).
        const bottom = STACK_Y - 190 * (1 - f.at('holdUp'));
        // The hands wait where the stack's bottom card comes to rest.
        const holding = f.at('handsUp') * (1 - f.at('handsDown'));
        // The far hand keeps its end up as the last of the stack slides off.
        HOLD_FAR.reach = holding;
        OPEN.to[0] = lerp(HOLD_AT[0], OFFER_AT[0], offer);
        OPEN.to[1] = lerp(HOLD_AT[1], OFFER_AT[1], offer);
        OPEN.reach = clamp(holding + offer);
        OPEN.turn = f.at('palmUp');
        const s = FIGURE_A_S * zoom;
        at(ctx, { x: handX - hx * s, y: handY - hy * s, scale: s }, () => {
          person(
            ctx,
            {
              tilt: 0.12 * wonder * (1 - up) - 0.1 * up + 0.08 * sheepish,
              look: [lerp(2 * wonder, 0, up) + 3 * sheepish, -4 * up + 2 * sheepish],
              browTilt: 0.35 * wonder + 0.3 * sheepish,
              browL: 3 * wonder,
              far: HOLD_FAR,
              near: OPEN,
            },
            hand('figureA'),
          );
          // Back out: the light they were given, held in their open hand.
          if (light > 0) {
            glow(ctx, OFFER_AT[0], OFFER_AT[1], 40, C.glow, light);
            piece(ctx, ellipseShape(OFFER_AT[0], OFFER_AT[1], 9, 9), C.gold, hand('lightHeld'), {
              role: 'scenery',
              line: 0,
              shadow: 0.2,
            });
          }
          // The stack: held up, then sliding off one piece at a time.
          if (up > 0 || slide > 0)
            STACK.forEach(([kind, dx], i) => {
              const fall = clamp(slide * 1.7 - i * 0.13);
              const x0 = dx;
              const y0 = bottom - i * 22;
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

      // Their own palm-up hand close up, and the gold light laid in it: the
      // light comes down to rest on the palm's middle, clear of the lines.
      pushedHand(ctx, f.hand, PUSH, into, 1, 'near', {
        over: () => {
          if (light <= 0) return;
          const y = lerp(LIGHT_FROM, 0, light);
          glow(ctx, 0, y, 260, C.glow, 0.5 + 0.5 * light);
          glow(ctx, 0, y, 110, C.gold, 0.6);
          piece(ctx, ellipseShape(0, y, 34, 34), C.gold, hand('light'), {
            role: 'scenery',
            line: 0,
            shadow: 0.2,
          });
        },
      });
    }

    // ── B: the camp in the desert, the serpent on the pole ───────────────────
    // Once the row covers it, the camp is no longer drawn.
    if (toDesert > 0 && f.at('toIcons') < 1) {
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
      const strain = onPole * f.at('grasp') * (1 - f.at('letGo'));
      ON_POLE_HIGH.to[0] = (px - 8 - x) / 1.8;
      ON_POLE_LOW.to[0] = (px - 14 - x) / 1.8;
      ON_POLE_HIGH.reach = strain;
      ON_POLE_LOW.reach = strain;
      const jiggle = strain * Math.sin(t * 18) * 3;
      // Looking up, their hands come together at the chest: in the close-up, never cut by its frame.
      AT_CHEST_NEAR.reach = lookUp;
      AT_CHEST_FAR.reach = lookUp;

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
                  { color: C.outline, width: 15, taper: 0.7, jitter: 0.3, boil: 'crawl' },
                  sub(hand('snakeLine'), k),
                );
                stroke(
                  ctx,
                  path,
                  { color: C.scarlet, width: 10, taper: 0.7, jitter: 0.3, boil: 'crawl' },
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
                  { color: C.outline, width: 20, taper: 0.5, jitter: 0.3, boil: 'crawl' },
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
                  { color: C.gold, width: 14, taper: 0.5, jitter: 0.3, boil: 'crawl' },
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
                    near: lookUp > 0 ? AT_CHEST_NEAR : ON_POLE_HIGH,
                    far: lookUp > 0 ? AT_CHEST_FAR : ON_POLE_LOW,
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

    // ── C: back to the row, and the four faces at the hole ─────────────────
    const toIcons = f.at('toIcons');
    if (toIcons > 0) row(f, toIcons);
  },
});

/** The row's glow: faith lit, the other two not yet; faith leads and they fade (rewritten every frame). */
const LIT: [number, number, number] = [1, 0, 0];
const LEAD: [number, number, number] = [0, 0, 0];
const COUNT: Posed<IconCount> = { lead: LEAD, dim: 0 };

/**
 * After the last word: faith's icon, close, pulls back to the section head's
 * row, its gold glowing; for a breath the four faces at the hole in the roof
 * show under it, lit gold from below (`roof`'s callback), and go as the row
 * settles for `declared` to open on.
 */
const row = (f: LookFrame, shown: number) => {
  const { ctx, w, h } = f;
  const pull = f.at('pullBack');
  const hole = f.at('hole') * (1 - f.at('holeOut'));
  LEAD[0] = f.at('iconGlow');
  COUNT.dim = Math.min(1, LEAD[0]);
  ctx.save();
  ctx.globalAlpha *= shown;
  sky(ctx, w, h, ICON_SKY);
  const scale = lerp(ICON_ROW.close, ICON_ROW.scale, pull);
  at(
    ctx,
    {
      x: lerp(ICON_ROW.x - ICON_X[0] * ICON_ROW.close, ICON_ROW.x, pull),
      y: ICON_ROW.y - RECALL_RISE * hole * scale,
      scale,
    },
    () => {
      icons(ctx, f.hand, LIT, undefined, COUNT);
      at(ctx, { x: ICON_X[0], y: 0 }, () =>
        recall(ctx, f.hand, hole, () => house(ctx, w, h, f.handsOf('roof'), AT_THE_HOLE), LEAD[0]),
      );
    },
  );
  ctx.restore();
};
