// The accuser: Zechariah's vision in the heavenly court (Zech 3:1–2). The
// camera comes down from the high window to Joshua, head bowed in filthy
// clothes, with those who stand before him on either side; the Angel, Christ
// in white and gold, stands at the bench. On "Satan" a tall shadow-grey figure
// steps up at Joshua's right hand and points, and each stain flares. On "day"
// the camera looks up at the window, where the sun sinks low: the great day
// closing. On "angel" Christ raises a hand; on "silence" the pointing arm
// drops and the accuser shrinks back. It ends on the frame `robe` opens on:
// both draw the court's `zechCourt`.

import { type Pt, camera, drawing, shotPath } from '@bible/film/canvas';
import { lerp } from '@bible/film/core';
import { knobCamera } from '../kit.ts';
import {
  ANGEL_HAND,
  JOSHUA,
  TUNIC_STAINS,
  ZECH_REST as REST,
  courtWall,
  zechCourt,
} from '../court.ts';

/** Christ's near hand raised (at rest it is the court's `ANGEL_HAND`, as `robe` opens). */
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
    flare: { mark: 'points', dur: 1.5, stagger: 0.8, ease: 'linear' },
    dim: { with: 'flare', offset: 0.9, dur: 2.4, stagger: 0.5, ease: 'linear' },
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
  knobs: {
    // Up at the high window, above everyone's heads.
    high: [1045, 280],
    highZoom: 2.3,
    // Close on Joshua.
    josh: [760, 660],
    joshZoom: 1.9,
    // Joshua and the accuser at his right hand.
    pair: [560, 640],
    pairZoom: 1.4,
  },
  draw: (f) => {
    const { ctx, w, h } = f;
    const hand = (k: string) => f.hand(k);

    const HIGH = knobCamera(f.knob('high'), f.knob('highZoom'));
    const JOSH = knobCamera(f.knob('josh'), f.knob('joshZoom'));
    const PAIR = knobCamera(f.knob('pair'), f.knob('pairZoom'));
    const cam = shotPath(HIGH, [
      [f.at('down'), REST],
      [f.at('push'), JOSH],
      [f.at('toPair'), PAIR],
      [f.at('wide'), REST],
      [f.at('up'), HIGH],
      [f.at('back'), REST],
    ]);

    // Aimed a little down, at the stains on his clothes.
    const point = 0.7 * f.at('point') * (1 - f.at('drop'));
    const raise = f.at('raise') * (1 - f.at('lower'));
    // Joshua bows on his name and lifts his head as the accuser is silenced.
    const bow = f.at('bow') * (1 - f.at('lift'));
    // Each stain lights in 0.3 s, 0.4 s after the one before, and dims over
    // 1.2 s from 0.9 s after it lit.
    const stainLit = (i: number) =>
      f.stagger('flare', i, TUNIC_STAINS.length) * (1 - f.stagger('dim', i, TUNIC_STAINS.length));

    courtWall(ctx, w, h);
    camera(ctx, cam, w, h, () =>
      zechCourt(ctx, hand, {
        // The sun stands higher in the window and sinks to where `robe` finds it.
        sun: lerp(-0.6, 0, f.at('sink')),
        accuser: { enter: f.at('enter'), shrink: f.at('shrink'), point },
        // Christ at the bench, raising a hand on "angel".
        angel: {
          lift: raise,
          tilt: -0.05 * raise,
          hand: [lerp(ANGEL_HAND[0], HAND_UP[0], raise), lerp(ANGEL_HAND[1], HAND_UP[1], raise)],
        },
        // Joshua, head bowed, the specks on his skin.
        joshua: { tilt: 0.1, nod: 7 * bow, look: [0, 3 * bow], browTilt: 0.2 + 0.2 * bow },
        specks: 1,
        cheek: { dy: 7 * bow, alpha: 1 },
        // Those who stand before him; on "silence" they take hold of his clothes.
        tunic: { at: JOSHUA, flare: stainLit },
        helpers: { grip: f.at('grip'), dx: 0, bob: 0, up: 0 },
      }),
    );
  },
});
