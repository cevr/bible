// The name. The landing courtroom holds in its gold light; where Job's
// question stood above the bench in `name`, the answer writes itself, the
// only words on screen: THE LORD OUR RIGHTEOUSNESS. Then, while the music rises alone,
// the camera eases back out of the court to the title's cardboard city, where
// the figure in the robe and Christ sit together on the same rooftop the
// title's figure stood on, under the landing sky.

import {
  type Camera,
  at,
  drawing,
  multiplane,
  probePlate,
  rectShape,
  write,
} from '@bible/film/canvas';
import { clamp, lerp } from '@bible/film/core';
import { C, F, christ, glow, person, piece, between } from '../kit.ts';
import { ROOF, cityBack, cityFront, landingSky } from '../city.ts';
import {
  ADVOCATE_POSE,
  FIGURE_LANDED,
  GAVEL_DOWN,
  GAVEL_REST,
  WIDE,
  QUESTION_AT,
  landingCourt,
} from '../court.ts';

/** Where the camera ends: the title's city, near enough to see the two of them. */
const CITY: Camera = { x: 1200, y: 640, zoom: 1.3 };
/** Where it enters the city: close on the rooftop. */
const ROOFTOP: Camera = { x: ROOF.x - 20, y: ROOF.top - 70, zoom: 3.4 };
/** The court's last framing, pulled back. */
const COURT_BACK: Camera = { x: 930, y: 400, zoom: 0.92 };

const ANSWER = 'THE LORD OUR RIGHTEOUSNESS';
/** The answer's plate, over the place the question stood. */
const PLATE = rectShape(210, QUESTION_AT[1] - 88, 1500, 116);
const answerStyle = {
  family: F.display,
  size: 84,
  weight: 700,
  color: C.ink,
  align: 'center',
  tracking: 0.04,
} as const;

export const thesis = drawing({
  timeline: {
    lookUp: { scene: 'speech', dur: 0.5 },
    answer: { scene: 'speech', dur: 1.6, ease: 'linear' },
    textOut: { scene: 'start', offset: 10, dur: 1.2 },
    away: { scene: 'start', offset: 10.6, dur: 4.5, ease: 'inOutSine' },
    city: { scene: 'start', offset: 13.2, dur: 11, ease: 'inOutSine' },
    turn: { scene: 'start', offset: 25.5, dur: 1.2 },
  },
  draw: (f) => {
    const { ctx, w, h } = f;
    landingSky(ctx, w, h);
    glow(ctx, 960, 380, 750, C.glow, 0.55);

    const away = f.at('away');
    const city = f.at('city');
    const turn = f.at('turn');
    // The court lets go to the sky, then the city comes in: no double image.
    const courtOut = clamp((away - 0.3) / 0.3);
    const cityIn = clamp((away - 0.55) / 0.45);

    // The rooftop and the two of them, sitting on its edge.
    if (cityIn > 0) {
      ctx.save();
      ctx.globalAlpha *= cityIn;
      const cam = between(ROOFTOP, CITY, city);
      multiplane(ctx, cam, w, h, [
        { z: 1.6, draw: () => cityBack(ctx, (k) => f.hand(k)) },
        {
          z: 1,
          lift: 1.4,
          draw: () => {
            cityFront(ctx, (k) => f.hand(k));
            // Sitting on the roof's edge, their legs over it.
            at(ctx, { x: ROOF.x + 34, y: ROOF.top, scale: 0.68 }, () =>
              christ(
                ctx,
                {
                  sit: 1,
                  tilt: lerp(-0.08, -0.16, turn),
                  look: [lerp(1, -3, turn), -3],
                  browTilt: 0.2,
                  smile: 0.6,
                },
                (k) => f.hand(k),
              ),
            );
            at(ctx, { x: ROOF.x - 44, y: ROOF.top, scale: 0.62 }, () =>
              person(
                ctx,
                {
                  sit: 1,
                  body: C.robe,
                  shade: C.robe,
                  garment: 'robe',
                  tilt: lerp(-0.08, 0.12, turn),
                  look: [lerp(1.5, 3, turn), lerp(-3.5, -1, turn)],
                  browL: 2,
                  browR: 3,
                  browTilt: 0.3,
                  smile: 0.8,
                },
                f.hand('figure'),
              ),
            );
          },
        },
      ]);
      ctx.restore();
    }

    // The court in its gold light, pulled back and let go.
    if (courtOut < 1) {
      const lookUp = f.at('lookUp');
      ctx.save();
      ctx.globalAlpha *= 1 - courtOut;
      landingCourt(ctx, w, h, (k) => f.hand(k), {
        cam: between(WIDE, COURT_BACK, away),
        // The gavel lifts back from where `name` laid it down.
        swing: GAVEL_DOWN - (GAVEL_DOWN - GAVEL_REST) * clamp(f.t / 2),
        stamp: 0,
        pop: 1,
        gold: 1,
        shine: 0.9,
        // From where `name` left the figure, up to the answer as it writes.
        figure: {
          look: [lerp(FIGURE_LANDED.look[0], 2, lookUp), lerp(FIGURE_LANDED.look[1], -4, lookUp)],
          browL: lerp(FIGURE_LANDED.browL, 3, lookUp),
          browR: lerp(FIGURE_LANDED.browR, 4, lookUp),
          browTilt: 0.35 * lookUp,
          tilt: lerp(FIGURE_LANDED.tilt, -0.1, lookUp),
          smile: FIGURE_LANDED.smile,
        },
        advocate: { ...ADVOCATE_POSE, tilt: -0.06, look: [3, 1], smile: 0.6 },
      });
      ctx.restore();
    }

    // The answer where the question stood: the film's last words.
    const out = f.at('textOut');
    const answer = f.at('answer');
    if (out < 1 && answer > 0) {
      ctx.save();
      ctx.globalAlpha *= clamp(answer * 4) * (1 - out);
      piece(ctx, PLATE, C.cream, f.hand('plate'), {
        line: 5,
        outline: C.gold,
        torn: 2,
        shadow: 0.4,
      });
      probePlate(ctx, PLATE, () =>
        write(ctx, ANSWER, QUESTION_AT[0], QUESTION_AT[1], answerStyle, f.hand('answer'), {
          progress: answer,
          reveal: 'write',
          boil: 0.4,
        }),
      );
      ctx.restore();
    }
  },
});
