// The title, painted to its kept panel (`title.start`, try 3): the court of
// `cold` seen high and wide from its back, in the sun through the high
// window at the upper left: the back wall with its pilasters and wainscot,
// the left wall with the window, the floor running far back under the
// beams, the crack from the dock's foot toward the aisle, the pews nearest.
// The three stand small on the floor as the panel stands them: the lead in
// the dock with the scarlet stain and no seal (the seal is `cold`'s, given;
// the title is the case before it), his eyes on the prosecutor; the
// prosecutor at his table, one hand out at the lead, protesting; the judge
// stern at his bench, the gavel on its block. The camera pulls slowly back
// while the film's name settles on a torn paper strip on the empty upper
// back wall: the only text (`CARDS`).

import { at, drawing, rounded, write } from '@bible/film/canvas';
import { lerp } from '@bible/film/core';
import { COURT_RIGS, courtFigures, courtShadows, restPose } from '../court-cast.ts';
import { widePews, wideRoom } from '../court-set.ts';
import { C, F, piece } from '../kit.ts';
import { LIGHT } from '../light.ts';
import { TITLE } from '../script.ts';

/**
 * The cast in the wide: the Board's pixels scaled to the panel's size of
 * them and moved onto its floor, each group spread off its `cold` place as
 * the panel spreads them (Board pixels).
 */
const CAST = {
  x: 425,
  y: 315,
  scale: 0.6,
  spread: { lead: [0, 0], prosecutor: [98, 27], judge: [258, 60] },
} as const;

/** The film's name: its strip's centre and size on the back wall, frame px, and its type. */
const NAME = {
  x: 990,
  y: 200,
  w: 1000,
  h: 140,
  style: { family: F.display, size: 82, weight: 700, color: C.cream, align: 'center' },
} as const;

/** The court as the panel stages it: the case before the verdict. */
const POSE = (() => {
  const p = restPose();
  // Three sheets laid flat along the table.
  p.stack = 1;
  // The lead, worried, his eyes on the prosecutor.
  Object.assign(p.lead.numbers, { gazeX: 520, browTilt: 0.3, browY: -1, mouth: -0.6 });
  // The prosecutor turned on the lead, one hand out at him, protesting.
  Object.assign(p.prosecutor.numbers, {
    gazeX: -520,
    browY: 0.6,
    browTilt: -0.34,
    eyes: 1.1,
    mouthLine: 0,
    mouthOpen: 0,
    shout: 0.75,
    lean: -0.05,
    tilt: -0.05,
  });
  p.prosecutor.hands[0] = [598, 430];
  // The judge, stern over the bench.
  Object.assign(p.judge.numbers, { browY: 1.6, browTilt: -0.3, mouth: -1 });
  return p;
})();

export const title = drawing({
  timeline: {
    // The camera keeps pulling back over the whole title.
    pull: { at: 'start', until: { at: 'end' }, ease: 'outCubic' },
    settle: { at: 'start', offset: 0.25, dur: 0.8, ease: 'outCubic' },
  },
  knobs: {
    // How close the pull starts, and where it ends: the panel's own framing.
    near: 1.08,
  },
  rigs: COURT_RIGS,
  // The court's light with a little of the film's vignette: the kept title panel darkens toward
  // its corners, where the room's own light (`LIGHT.room`) lets the bench keep its full light.
  light: { ...LIGHT.room, vignette: 0.1 },
  draw: (f) => {
    const { ctx, w, h } = f;
    const zoom = lerp(f.knob('near'), 1, f.at('pull'));
    // The frame's pixels at the film's 1920, pulled back about the floor's middle.
    ctx.save();
    ctx.translate(w / 2, h * 0.55);
    ctx.scale((zoom * w) / 1920, (zoom * w) / 1920);
    ctx.translate(-960, -594);
    wideRoom(ctx);
    at(ctx, { x: CAST.x, y: CAST.y, scale: CAST.scale }, () => {
      courtShadows(ctx, CAST.spread);
      courtFigures(f, POSE, CAST.spread);
    });
    widePews(ctx);
    // The name, on a strip of the film's dark paper torn along its edges, settling onto the wall.
    const settle = f.at('settle');
    const y = lerp(NAME.y + 22, NAME.y, settle);
    piece(ctx, rounded(NAME.x, y, NAME.w, NAME.h, 0), C.ink, f.hand('strip'), {
      role: 'scenery',
      kind: 'torn',
      torn: 5,
      shadow: 0.3,
      alpha: settle,
    });
    write(ctx, TITLE, NAME.x, y + 28, NAME.style, f.hand('title'), { alpha: settle, boil: 0 });
    ctx.restore();
  },
});
