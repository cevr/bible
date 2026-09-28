// The landing: the cold open's courtroom again (same bench, same places,
// same framing), now standing in the cardboard world under the landing sky.
// The figure stands where they stood as the accused, in the white robe, and
// Christ stands beside them as Advocate. Job's question writes itself above
// the bench again; on "receive" the figure touches the robe's sleeve, and on
// "heart" a light rises in their chest, through the robe. On "every" a sun
// passes over the court: every day. The gavel falls softly on "verdict"; on
// "not a cover-up" the Advocate opens his hand to the light in the figure's
// chest, the evidence, and the figure looks down at it. On "real" the cold
// open's hollow verdict hangs above the bench; on "true" it drops, fills solid
// gold and stamps across the bench as in the cold open, and the light answers
// from inside the figure. On "jer" the bench itself goes gold, and the word
// gives way to the name in `thesis`.

import { type Camera, drawing } from '@bible/film/canvas';
import { lerp } from '@bible/film/core';
import { landingSky } from '../city.ts';
import {
  ADVOCATE_HAND,
  ADVOCATE_POSE,
  FIGURE_LANDED,
  GAVEL_DOWN,
  GAVEL_REST,
  REST,
  STAMP_POP,
  WIDE,
  landingCourt,
  question,
} from '../court.ts';
import { between } from '../kit.ts';

/** Close on the two of them as the figure touches the robe. */
const CLOSE: Camera = { x: 720, y: 700, zoom: 2.6, rot: 0.03 };
/** On the two of them as the Advocate shows the light in the figure: the evidence. */
const PAIR: Camera = { x: 760, y: 690, zoom: 2 };

export const name = drawing({
  timeline: {
    wide: { mark: 'how', offset: -0.9, dur: 1.2 },
    close: { mark: 'receive', offset: -0.4, dur: 0.9 },
    back: { mark: 'verdict', offset: -0.9, dur: 0.9 },
    lookUp: { mark: 'how', dur: 0.5 },
    questionOut: { mark: 'receive', offset: -0.6, dur: 0.4 },
    touch: { mark: 'receive', offset: -0.1, dur: 0.6 },
    release: { mark: 'taking', offset: 0.6, dur: 0.6 },
    heart: { mark: 'heart', dur: 0.8 },
    sun: { mark: 'every', offset: -0.3, until: 'verdict', ease: 'inOutSine' },
    turn: { mark: 'verdict', offset: -0.2, dur: 0.4 },
    gavel: { mark: 'verdict', offset: 0.2, dur: 0.59 },
    present: { mark: 'verdict', offset: 1.5, dur: 0.6 },
    toPair: { mark: 'verdict', offset: 1.3, dur: 0.9 },
    toBench: { mark: 'real', offset: -0.3, dur: 0.8 },
    hollow: { mark: 'real', dur: 0.5 },
    land: { mark: 'true', offset: -0.5, dur: 0.5, ease: 'inCubic' },
    lower: { mark: 'true', offset: 0.3, dur: 0.6 },
    stamp: { mark: 'true', offset: -0.03, dur: 0.2, ease: 'outBack' },
    shine: { mark: 'true', dur: 0.6 },
    gold: { mark: 'jer', dur: 1.2 },
    stampOut: { mark: 'jer', offset: 1.4, dur: 0.5 },
    smile: { mark: 'jer', offset: 0.4, dur: 0.6 },
  },
  // Where the Advocate's open hand presents the light in the figure's chest, in his units.
  knobs: { present: [-104, -80] },
  draw: (f) => {
    const { ctx, w, h } = f;
    landingSky(ctx, w, h);

    const up = f.at('lookUp') * (1 - f.at('turn'));
    const touch = f.at('touch') * (1 - f.at('release'));
    const turn = f.at('turn');
    // A soft fall: the same arc as the cold open, landing without the bounce.
    const swing = f.keys('gavel', [
      [0, GAVEL_REST],
      [0.373, -0.2],
      [0.763, 1.5, 'inOutCubic'],
      [1, GAVEL_DOWN],
    ]);
    const pop = f.keys('stamp', STAMP_POP);
    const smile = f.at('smile');
    // The Advocate's hand open to the figure's chest, from "not a cover-up" until the verdict lands.
    const present = f.at('present') * (1 - f.at('lower'));
    // The figure looks down at the light in them, then up at the hollow verdict until it drops.
    const down = f.at('present') * (1 - f.at('hollow'));
    const hung = f.at('hollow') * (1 - f.at('land'));
    const [px, py] = f.knob('present');

    landingCourt(ctx, w, h, (k) => f.hand(k), {
      cam: between(
        between(
          between(
            between(between(REST, WIDE, f.at('wide')), CLOSE, f.at('close')),
            WIDE,
            f.at('back'),
          ),
          PAIR,
          f.at('toPair'),
        ),
        WIDE,
        f.at('toBench'),
      ),
      swing,
      stamp: Math.max(f.at('hollow'), f.at('stamp')) * (1 - f.at('stampOut')),
      pop,
      fill: f.at('land'),
      hung: 1 - f.at('land'),
      gold: f.at('gold'),
      shine: 0.9 * f.at('shine'),
      heart: 0.55 * f.at('heart') + 0.35 * present,
      sun: f.at('sun'),
      figure: {
        // Ends on FIGURE_LANDED, where `thesis` picks the figure up.
        tilt: -0.12 * up + 0.08 * touch + FIGURE_LANDED.tilt * turn + 0.06 * down,
        nod: 5 * touch + 4 * down,
        look: [
          lerp(lerp(0, 3, up), -2, touch) + FIGURE_LANDED.look[0] * turn,
          lerp(-5 * up, 3, touch) + 4 * down - 5 * hung,
        ],
        browL: 3 * up + FIGURE_LANDED.browL * smile + 3 * hung,
        browR: 4 * up + FIGURE_LANDED.browR * smile + 3 * hung,
        browTilt: 0.35 * up + 0.25 * hung,
        smile: FIGURE_LANDED.smile * smile,
        handR: touch > 0.01 ? [lerp(40, -24, touch), lerp(-60, -76, touch)] : undefined,
      },
      advocate: {
        ...ADVOCATE_POSE,
        handL: [lerp(ADVOCATE_HAND[0], px, present), lerp(ADVOCATE_HAND[1], py, present)],
        tilt: -0.06 + 0.1 * (1 - turn) * f.at('touch') + 0.06 * present,
        look: [lerp(lerp(-3, 3, turn), -3, present), 1 + 2 * present],
        smile: 0.6 * smile,
      },
    });

    // Job's question, where the cold open wrote it, the only words on screen.
    const out = f.at('questionOut');
    if (out < 1)
      question(ctx, f.hand('question'), {
        progress: f.spoken('how', 'not'),
        reveal: 'write',
        alpha: 1 - out,
      });
  },
});
