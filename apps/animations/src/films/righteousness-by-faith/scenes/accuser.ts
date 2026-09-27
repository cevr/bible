// The accuser: Zechariah's vision in the heavenly court (Zech 3:1–2). The
// camera comes down from the high window to Joshua, head bowed in filthy
// clothes, with those who stand before him on either side; the Angel, Christ
// in white and gold, stands at the bench. On "Satan" a tall shadow-grey figure
// steps up at Joshua's right hand and points, and each stain flares. On "day"
// the camera looks up at the window, where the sun sinks low: the great day
// closing. On "angel" Christ raises a hand; on "silence" the pointing arm
// drops and the accuser shrinks back. It ends on the frame `robe` opens on.

import { type Camera, type Pt, at, camera, drawing } from '@bible/film/canvas';
import { clamp, lerp } from '@bible/film/core';
import { C, blob, christ, glow, person, piece, sub, between } from '../kit.ts';
import {
  accuser as accuserFigure,
  AS,
  CHEEK,
  HELPERS,
  JOSHUA,
  JS,
  SPECKS,
  court,
  courtWall,
  tunic,
} from '../court.ts';

/** The frame `robe` opens on: the whole court. */
const REST: Camera = { x: 960, y: 540, zoom: 1 };
/** Up at the high window, above everyone's heads. */
const HIGH: Camera = { x: 1045, y: 280, zoom: 2.3 };
/** Close on Joshua. */
const JOSH: Camera = { x: 760, y: 660, zoom: 1.9 };
/** Joshua and the accuser at his right hand. */
const PAIR: Camera = { x: 560, y: 640, zoom: 1.4 };

/** Where the accuser stands once he has stepped up: where `robe` has him. */
const ACCUSER: Pt = [300, 950];

/** Christ's near hand, at rest (as `robe` opens) and raised. */
const HAND_REST: Pt = [-30, -58];
const HAND_UP: Pt = [-78, -205];

export const accuser = drawing({
  timeline: {
    down: { scene: 'start', dur: 3.1, ease: 'inOutSine' },
    bow: { mark: 'joshua', dur: 0.6 },
    push: { mark: 'filthy', offset: -0.2, dur: 0.9, ease: 'inOutCubic' },
    enter: { mark: 'satan', offset: -0.2, dur: 1.2, ease: 'outCubic' },
    toPair: { mark: 'satan', offset: -0.3, dur: 1.1, ease: 'inOutCubic' },
    point: { after: 'enter', dur: 0.5, ease: 'outBack' },
    wide: { mark: 'room', dur: 1, ease: 'inOutCubic' },
    flare: { mark: 'points', dur: 1.6, ease: 'linear' },
    up: { mark: 'ew', offset: 0.4, dur: 1.4, ease: 'inOutCubic' },
    sink: { mark: 'day', offset: -0.2, dur: 2.2, ease: 'inOutSine' },
    back: { mark: 'angel', offset: -1, dur: 1, ease: 'inOutCubic' },
    raise: { mark: 'angel', offset: 0.2, dur: 0.6, ease: 'outBack' },
    drop: { mark: 'silence', dur: 0.6, ease: 'inCubic' },
    shrink: { mark: 'silence', offset: 0.1, dur: 0.8 },
    lower: { mark: 'silence', offset: 0.4, dur: 0.7 },
    lift: { mark: 'silence', offset: 0.1, dur: 0.6 },
    grip: { mark: 'silence', offset: 0.5, dur: 0.8 },
  },
  draw: (f) => {
    const { ctx, w, h } = f;
    const hand = (k: string) => f.hand(k);

    let cam = between(HIGH, REST, f.at('down'));
    cam = between(cam, JOSH, f.at('push'));
    cam = between(cam, PAIR, f.at('toPair'));
    cam = between(cam, REST, f.at('wide'));
    cam = between(cam, HIGH, f.at('up'));
    cam = between(cam, REST, f.at('back'));

    const [ax, ay] = ACCUSER;
    const enter = f.at('enter');
    const shrink = f.at('shrink');
    // Aimed a little down, at the stains on his clothes.
    const point = 0.7 * f.at('point') * (1 - f.at('drop'));
    const raise = f.at('raise') * (1 - f.at('lower'));
    // Joshua bows on his name and lifts his head as the accuser is silenced.
    const bow = f.at('bow') * (1 - f.at('lift'));
    const flare = f.cue('flare');
    const stainLit = (i: number) => {
      const t0 = flare.start + i * (flare.dur / 4);
      const s = clamp((f.t - t0) / 0.3);
      const fade = 1 - clamp((f.t - t0 - 0.9) / 1.2);
      return s * fade;
    };

    courtWall(ctx, w, h);
    camera(ctx, cam, w, h, () => {
      // The sun stands higher in the window and sinks to where `robe` finds it.
      court(ctx, hand, lerp(-0.6, 0, f.at('sink')));

      if (enter > 0)
        at(ctx, { x: lerp(-260, ax, enter), y: ay, scale: lerp(1.05, 0.9, shrink) }, () => {
          accuserFigure(ctx, hand, point);
          // Shrinking back into shadow.
          glow(ctx, 0, -250, 330, C.boardDeep, 0.35 * shrink * (1 - shrink) * 4);
        });

      // Christ at the bench, raising a hand on "angel".
      glow(ctx, 1330, 950 - 250, 310, C.glow, 0.8 + 0.2 * raise);
      at(ctx, { x: 1330, y: 950, scale: 2.1 }, () =>
        christ(
          ctx,
          {
            tilt: -0.05 * raise,
            look: [-3, 1],
            browTilt: 0.15,
            handL: [lerp(HAND_REST[0], HAND_UP[0], raise), lerp(HAND_REST[1], HAND_UP[1], raise)],
            handR: [30, -58],
          },
          hand,
        ),
      );

      // Joshua, head bowed, the specks on his skin.
      at(ctx, { x: JOSHUA[0], y: JOSHUA[1], scale: JS }, () => {
        person(
          ctx,
          {
            turban: true,
            tilt: 0.1,
            nod: 7 * bow,
            look: [0, 3 * bow],
            browTilt: 0.2 + 0.2 * bow,
          },
          hand('joshua'),
        );
        SPECKS.forEach((speck, i) =>
          piece(ctx, speck, C.scarlet, sub(hand('speck'), i), { line: 0, shadow: 0.1 }),
        );
        const [cx, cy] = CHEEK;
        piece(ctx, blob(cx, cy + 7 * bow, 6, 5, 11), C.scarlet, hand('cheek'), {
          line: 0,
          shadow: 0.1,
        });
      });

      // Those who stand before him; on "silence" they take hold of his clothes.
      const grip = f.at('grip');
      const tunicX = JOSHUA[0];
      const tunicY = JOSHUA[1];
      for (const [x, side, k] of HELPERS) {
        const y = JOSHUA[1] - (k === 1 ? 0 : 5);
        const target: Pt = [(tunicX - side * 44 * JS - x) / AS, (tunicY - 90 * JS - y) / AS];
        const rest: Pt = [side * 30, -58];
        const reachTo: Pt = [lerp(rest[0], target[0], grip), lerp(rest[1], target[1], grip)];
        at(ctx, { x, y, scale: AS }, () =>
          person(
            ctx,
            {
              body: C.figureShade,
              skin: C.figureShade,
              look: [side * 2 * grip - side * 1.5 * (1 - grip), 0],
              ...(side === 1 ? { handR: reachTo } : { handL: reachTo }),
            },
            sub(hand('helper'), k),
          ),
        );
      }
      at(ctx, { x: tunicX, y: tunicY, scale: JS }, () => tunic(ctx, hand, stainLit));
    });
  },
});
