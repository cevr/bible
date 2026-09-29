// The landing: the cold open's courtroom again (same bench, same places,
// same framing), now standing in the cardboard world under the landing sky.
// The figure stands where they stood as the accused, in the white robe, and
// Christ stands beside them as Advocate. Job's question writes itself above
// the bench again. On "taking" the figure's open hand turns palm up and a
// gold word of light comes down into it (faith); on "receive" that hand goes
// to the robe's sleeve. On "heart" they let it go and the Advocate reaches
// out: a light in his open hand passes into their chest and glows there,
// through the robe, and he draws his hand back. On "every" a sun
// passes over the court: every day. The gavel falls softly on "verdict"; on
// "not a cover-up" the Advocate opens his hand to the light in the figure's
// chest, the evidence, and the figure looks down at it. On "real" the cold
// open's hollow verdict hangs at the bench's top, under the judge's face, at
// the cold open's size; on "true" it drops straight down, fills solid gold and
// lands across the bench as in the cold open, and the light answers
// from inside the figure. On "jer" the bench itself goes gold, and the word
// gives way to the name in `thesis`.

import { type Pt, drawing, shotPath } from '@bible/film/canvas';
import { type Key, lerp } from '@bible/film/core';
import { landingSky } from '../city.ts';
import { type GestureAt, type Posed, knobCamera } from '../kit.ts';
import {
  ADVOCATE_POSE,
  FIGURE_LANDED,
  GAVEL_DOWN,
  GAVEL_REST,
  REST,
  STAMP_LANDS,
  STAMP_WIDE,
  WIDE,
  landingCourt,
  question,
} from '../court.ts';

/** Where the figure's near hand touches the robe on "receive": its own chest, on its own side. */
const TOUCH: Pt = [8, -80];
/** Where it holds the word, out palm up in front of them, in their units. */
const HELD_OUT: Pt = [44, -112];
/** The near hand: palm up for the word, morphing to open on the sleeve (written each frame). */
const NEAR: Posed<GestureAt> = {
  to: [HELD_OUT[0], HELD_OUT[1]],
  reach: 0,
  grip: 'open',
  was: 'palm',
  change: 0,
  turn: 0,
};

/** The gavel's soft fall across its cue: the cold open's arc, landing without the bounce. */
const SWING: ReadonlyArray<Key> = [
  [0, GAVEL_REST],
  [0.373, -0.2],
  [0.763, 1.5, 'inOutCubic'],
  [1, GAVEL_DOWN],
];

export const name = drawing({
  timeline: {
    wide: { mark: 'how', offset: -0.9, dur: 1.2 },
    close: { mark: 'receive', offset: -0.4, dur: 0.9 },
    back: { mark: 'verdict', offset: -0.9, dur: 0.9 },
    lookUp: { mark: 'how', dur: 0.5 },
    questionOut: { mark: 'receive', offset: -0.6, dur: 0.4 },
    // On "taking" their near hand opens palm up and a gold word of light comes
    // down into it: faith, taking God at his word. On "receive" the hand, the
    // word fading in it, goes to the robe's sleeve.
    palm: { mark: 'taking', offset: -0.3, dur: 0.5, ease: 'inOutSine' },
    word: { mark: 'taking', offset: -0.1, dur: 1, ease: 'inOutSine' },
    wordOut: { mark: 'receive', offset: 0.1, dur: 0.5 },
    touch: { mark: 'receive', offset: -0.2, dur: 0.6, ease: 'inOutSine' },
    // The figure lets go of the robe before the heart comes: the new heart is given, not raised.
    release: { mark: 'heart', offset: -0.5, dur: 0.4 },
    give: { mark: 'heart', offset: -0.4, dur: 0.5 },
    pass: { mark: 'heart', offset: 0.1, dur: 0.5, ease: 'inOutSine' },
    heart: { mark: 'heart', offset: 0.35, dur: 0.8, ease: 'outCubic' },
    withdraw: { mark: 'heart', offset: 1, dur: 0.6 },
    sun: { mark: 'every', offset: -0.3, until: 'verdict', ease: 'inOutSine' },
    turn: { mark: 'verdict', offset: -0.2, dur: 0.4 },
    // The Advocate's hand opens to the figure's chest on "not" (a cover-up), a word with no mark.
    show: { mark: 'verdict', word: 'not', offset: -0.3, dur: 0.6 },
    // The judge's hand goes to the gavel before it falls, and holds it down into `thesis`.
    grasp: { with: 'gavel', offset: -0.5, dur: 0.5 },
    gavel: { mark: 'verdict', offset: 0.2, dur: 0.59 },
    // To the pair as "righteous" is said, a word with no mark.
    toPair: { mark: 'verdict', word: 'righteous', offset: 0.35, dur: 0.9 },
    toBench: { mark: 'real', offset: -0.3, dur: 0.8 },
    hollow: { mark: 'real', dur: 0.5 },
    land: { mark: 'true', offset: -0.5, dur: 0.5, ease: 'inCubic' },
    lower: { mark: 'true', offset: 0.3, dur: 0.6 },
    stamp: { mark: 'true', dur: 0.3 },
    shine: { mark: 'true', dur: 0.6 },
    gold: { mark: 'jer', dur: 1.2 },
    // The stamp goes on "the coming King".
    stampOut: { mark: 'jer', word: 'king', dur: 0.5 },
    smile: { mark: 'jer', offset: 0.4, dur: 0.6 },
  },
  // Where the Advocate's open hand gives, and later presents, the light in the figure's chest, in his units.
  knobs: {
    present: [-104, -80],
    // Close on the two of them as the figure touches the robe.
    close: [720, 700],
    closeZoom: 2.6,
    closeRot: 0.03,
    // On the two of them as the Advocate shows the light in the figure: the evidence.
    pair: [760, 690],
    pairZoom: 2,
  },
  draw: (f) => {
    const { ctx, w, h } = f;
    landingSky(ctx, w, h);

    const up = f.at('lookUp') * (1 - f.at('turn'));
    const touch = f.at('touch') * (1 - f.at('release'));
    // The near hand: out palm up for the word, then over to the sleeve, then down.
    const move = f.at('touch');
    NEAR.to[0] = lerp(HELD_OUT[0], TOUCH[0], move);
    NEAR.to[1] = lerp(HELD_OUT[1], TOUCH[1], move);
    NEAR.reach = f.at('palm') * (1 - f.at('release'));
    NEAR.turn = 1 - move;
    NEAR.change = move;
    const turn = f.at('turn');
    // A soft fall: the same arc as the cold open, landing without the bounce.
    const swing = f.keys('gavel', SWING);
    // The cold open's size throughout: hung, falling and landed, with a small thud on landing.
    const pop = STAMP_WIDE * f.keys('stamp', STAMP_LANDS);
    const smile = f.at('smile');
    // The Advocate's hand open to the figure's chest, from "not a cover-up" until the verdict lands.
    const shown = f.at('show');
    const present = shown * (1 - f.at('lower'));
    // The figure looks down at the light in them, then up at the hollow verdict until it drops.
    const down = Math.max(f.at('pass') * (1 - f.at('withdraw')), shown) * (1 - f.at('hollow'));
    // His open hand at the figure's chest: giving the heart on "heart", then showing it on "not a cover-up".
    const reach = Math.max(f.at('give') * (1 - f.at('withdraw')), present);
    const hung = f.at('hollow') * (1 - f.at('land'));
    const [px, py] = f.knob('present');

    landingCourt(ctx, w, h, (k) => f.hand(k), {
      cam: shotPath(REST, [
        [f.at('wide'), WIDE],
        [f.at('close'), knobCamera(f.knob('close'), f.knob('closeZoom'), f.knob('closeRot'))],
        [f.at('back'), WIDE],
        [f.at('toPair'), knobCamera(f.knob('pair'), f.knob('pairZoom'))],
        [f.at('toBench'), WIDE],
      ]),
      swing,
      held: f.at('grasp'),
      stamp: Math.max(f.at('hollow'), f.at('stamp')) * (1 - f.at('stampOut')),
      pop,
      fill: f.at('land'),
      hung: 1 - f.at('land'),
      gold: f.at('gold'),
      shine: 0.9 * f.at('shine'),
      heart: 0.55 * f.at('heart') + 0.35 * present,
      offer: f.at('give'),
      word: f.at('word'),
      wordKept: 1 - f.at('wordOut'),
      given: f.at('pass'),
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
        // The near hand goes to the robe on "receive" and lets it go before "heart".
        near: NEAR,
      },
      advocate: {
        ...ADVOCATE_POSE,
        far: { to: [px, py], reach, grip: 'open' },
        tilt: -0.06 + 0.1 * (1 - turn) * f.at('touch') + 0.06 * reach,
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
