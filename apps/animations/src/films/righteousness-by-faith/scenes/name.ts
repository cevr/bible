// The landing: the cold open's courtroom again (same bench, same places,
// same framing), now standing in the cardboard world under the landing sky.
// The figure stands where they stood as the accused, in the white robe, and
// Christ stands beside them as Advocate. Job's question writes itself above
// the bench again; on "receive" the figure touches the robe's sleeve; the
// gavel falls softly on "verdict", and on "true" the same word stamps across
// the bench as in the cold open, and the robe glows with it. On "jer" the
// bench itself goes gold, and the word gives way to the name in `thesis`.

import { type Camera, drawing, write } from '@bible/film/canvas';
import { keys, lerp } from '@bible/film/core';
import { landingSky } from '../city.ts';
import { QUESTION, REST, WIDE, landingCourt, questionStyle } from '../court.ts';
import { between } from '../kit.ts';

/** Close on the two of them as the figure touches the robe. */
const CLOSE: Camera = { x: 720, y: 700, zoom: 2.6, rot: 0.03 };

export const name = drawing({
  timeline: {
    wide: { mark: 'how', offset: -0.9, dur: 1.2 },
    close: { mark: 'receive', offset: -0.4, dur: 0.9 },
    back: { mark: 'verdict', offset: -0.9, dur: 0.9 },
    lookUp: { mark: 'how', dur: 0.5 },
    questionOut: { mark: 'receive', offset: -0.6, dur: 0.4 },
    touch: { mark: 'receive', offset: -0.1, dur: 0.6 },
    release: { mark: 'taking', offset: 0.6, dur: 0.6 },
    turn: { mark: 'verdict', offset: -0.2, dur: 0.4 },
    gavel: { mark: 'verdict', offset: 0.2, dur: 0.59 },
    stamp: { mark: 'true', offset: -0.03, dur: 0.2, ease: 'outBack' },
    shine: { mark: 'true', dur: 0.6 },
    gold: { mark: 'jer', dur: 1.2 },
    stampOut: { mark: 'jer', offset: 1.4, dur: 0.5 },
    smile: { mark: 'jer', offset: 0.4, dur: 0.6 },
  },
  draw: (f) => {
    const { ctx, w, h } = f;
    landingSky(ctx, w, h);

    const up = f.at('lookUp') * (1 - f.at('turn'));
    const touch = f.at('touch') * (1 - f.at('release'));
    const turn = f.at('turn');
    const g = f.cue('gavel');
    // A soft fall: the same arc as the cold open, landing without the bounce.
    const swing = keys(f.t - g.start, [
      [0, 0.35],
      [0.22, -0.2],
      [0.45, 1.5, 'inOutCubic'],
      [0.59, 1.45],
    ]);
    const s = f.cue('stamp');
    const pop = keys(f.t - s.start, [
      [0, 1.2],
      [0.12, 0.97, 'outCubic'],
      [0.2, 1],
    ]);
    const smile = f.at('smile');

    landingCourt(ctx, w, h, (k) => f.hand(k), {
      cam: between(
        between(between(REST, WIDE, f.at('wide')), CLOSE, f.at('close')),
        WIDE,
        f.at('back'),
      ),
      swing,
      stamp: f.at('stamp') * (1 - f.at('stampOut')),
      pop,
      gold: f.at('gold'),
      shine: 0.9 * f.at('shine'),
      figure: {
        tilt: -0.12 * up + 0.08 * touch - 0.05 * turn,
        nod: 5 * touch,
        look: [lerp(lerp(0, 3, up), -2, touch) + 3 * turn, lerp(-5 * up, 3, touch)],
        browL: 3 * up + 2 * smile,
        browR: 4 * up + 2 * smile,
        browTilt: 0.35 * up,
        handR: touch > 0.01 ? [lerp(40, -24, touch), lerp(-60, -76, touch)] : undefined,
      },
      advocate: {
        tilt: -0.06 + 0.1 * (1 - turn) * f.at('touch'),
        look: [lerp(-3, 3, turn), 1],
        browTilt: 0.15,
        handL: [-86, -104],
        handR: [30, -58],
      },
    });

    // Job's question, where the cold open wrote it, the only words on screen.
    const out = f.at('questionOut');
    if (out < 1)
      write(ctx, QUESTION, 960, 205, questionStyle, f.hand('question'), {
        progress: f.spoken('how', 'not'),
        reveal: 'write',
        boil: 0.4,
        alpha: 1 - out,
      });
  },
});
