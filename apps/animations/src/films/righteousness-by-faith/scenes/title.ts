// The title, drawn to its Board (`title.start`, try 3): the court of `cold`
// pulled wide from high in its back wall, the pews nearest, the room small
// in the middle of the frame, the lead in the dock with the seal over his
// stain and the crack at his feet, the light falling through the high
// window. The camera keeps pulling back while the film's name settles on
// the wall above the room, cream paper lettering in the film's ink: the
// only text (`CARDS`). The court is as `cold` leaves it: the stack laid,
// the gavel hanging over its block.

import { type Camera, drawing, knobCamera, multiplane, shotPath, write } from '@bible/film/canvas';
import { lerp } from '@bible/film/core';
import { COURT_RIGS, courtFigures, courtShadows, restPose, stainAt } from '../court-cast.ts';
import { REST_POINT, backWall, floor, pews } from '../court-set.ts';
import { C, F } from '../kit.ts';
import { TITLE } from '../script.ts';
import { GAVEL_HANGS, STACK_BEFORE, STACK_LAID } from './cold.ts';

/** The film's name: where it settles (its centre and baseline, frame px) and its type. */
const NAME = {
  x: 960,
  y: 250,
  style: { family: F.display, size: 112, weight: 700, color: C.cream, align: 'center' },
} as const;

/** The court as `cold` leaves it: the stack laid, the seal over the stain, the gavel hanging. */
const POSE = (() => {
  const p = restPose();
  p.stack = STACK_BEFORE + STACK_LAID;
  const [x, y] = stainAt(0);
  Object.assign(p.lead.seal, { x, y, shown: 1 });
  p.judge.grip[0] = GAVEL_HANGS.grip[0];
  p.judge.grip[1] = GAVEL_HANGS.grip[1];
  p.judge.rot = GAVEL_HANGS.rot;
  p.judge.hands[0] = [GAVEL_HANGS.grip[0], GAVEL_HANGS.grip[1]];
  // The lead looks up at the window's light.
  p.lead.numbers.gazeX = -120;
  p.lead.numbers.gazeY = -420;
  return p;
})();

export const title = drawing({
  timeline: {
    // The camera keeps pulling back and up over the whole title.
    pull: { at: 'start', until: { at: 'end' }, ease: 'outCubic' },
    settle: { at: 'start', offset: 0.25, dur: 0.8, ease: 'outCubic' },
  },
  knobs: {
    // Where the pull starts, and where it ends: high and wide, the room small mid-frame.
    near: [768, 470],
    nearZoom: 0.78,
    wide: [768, 380],
    wideZoom: 0.6,
  },
  rigs: COURT_RIGS,
  draw: (f) => {
    const { ctx, w, h } = f;
    const cam: Camera = shotPath(knobCamera(f.knob('near'), f.knob('nearZoom')), [
      [f.at('pull'), knobCamera(f.knob('wide'), f.knob('wideZoom'))],
    ]);
    multiplane(
      ctx,
      cam,
      w,
      h,
      [
        { z: 1.12, draw: () => backWall(ctx) },
        {
          z: 1,
          draw: () => {
            floor(ctx);
            courtShadows(ctx);
            courtFigures(f, POSE);
          },
        },
        { z: 0.72, draw: () => pews(ctx) },
      ],
      { rest: REST_POINT },
    );
    // The name: cream paper letters in the film's ink, settling onto the wall.
    const settle = f.at('settle');
    const y = lerp(NAME.y + 26, NAME.y, settle);
    const name = { ...NAME.style };
    write(ctx, TITLE, NAME.x, y, { ...name, color: C.outline }, f.hand('titleInk'), {
      alpha: settle,
      boil: 0,
      outline: 12,
      fill: 0,
    });
    write(ctx, TITLE, NAME.x, y, name, f.hand('title'), { alpha: settle, boil: 0 });
  },
});
