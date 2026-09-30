// The title: a teal sky over a cardboard city that rises into place, the name
// of the film settling above it, and one small grey figure on a rooftop who
// looks up at it. The camera tilts up a little, so the two rows of buildings
// part in depth. `word` opens on a match cut from the name (`NAME`).

import { at, drawing, multiplane, write } from '@bible/film/canvas';
import { lerp } from '@bible/film/core';
import { ROOF, cityBack, cityFront } from '../city.ts';
import { C, F, glow, person, sky } from '../kit.ts';
import { TITLE } from '../script.ts';

/** Where the film's name splits: its first word drops into `word`. */
const FIRST = TITLE.indexOf(' ');

/**
 * The film's name as it settles: its words, where it rests (the line's
 * centre and baseline, in frame px) and its type. `word` opens on a match
 * cut from it: its first word drops onto the page from exactly here.
 */
export const NAME = {
  first: TITLE.slice(0, FIRST),
  rest: TITLE.slice(FIRST),
  x: 960,
  y: 415,
  style: { family: F.display, size: 132, weight: 700, color: C.cream, align: 'center' },
} as const;

export const title = drawing({
  timeline: {
    rise: { at: 'start', dur: 1.2, ease: 'outCubic' },
    settle: { at: 'start', offset: 0.17, dur: 0.6, ease: 'outCubic' },
    // The figure looks up as the rise comes to rest.
    lookUp: { after: 'rise', offset: -0.03, dur: 0.5 },
  },
  draw: (f) => {
    const { ctx, w, h } = f;
    const rise = f.at('rise');
    sky(ctx, w, h, [
      [0, C.tealTop],
      [0.62, C.tealMid],
      [1, C.tealLow],
    ]);
    glow(ctx, 960, 380, 750, C.glow, 0.55);

    // A slow tilt up over the whole title.
    const drift = f.t / Math.max(f.dur, 1);
    multiplane(ctx, { x: 960, y: lerp(580, 540, drift), zoom: lerp(1.04, 1, drift) }, w, h, [
      {
        z: 1.6,
        draw: () => cityBack(ctx, f.hand, (1 - rise) * 60),
      },
      {
        z: 1,
        lift: 1.4,
        draw: () => {
          const up = (1 - rise) * 110;
          cityFront(ctx, f.hand, up);
          const look = f.at('lookUp');
          at(ctx, { x: ROOF.x, y: ROOF.top + up, scale: 0.62 }, () =>
            person(
              ctx,
              {
                tilt: -0.1 * look,
                look: [1.5 * look, -3.5 * look],
                browL: 2 * look,
                browR: 3 * look,
                browTilt: 0.5 * look,
              },
              f.hand('figure'),
            ),
          );
        },
      },
    ]);

    // The name, with the paper shadow it casts on the sky.
    const settle = f.at('settle');
    ctx.save();
    ctx.shadowColor = `${C.boardDeep}48`;
    ctx.shadowOffsetX = 7;
    ctx.shadowOffsetY = 8;
    write(
      ctx,
      NAME.first + NAME.rest,
      NAME.x,
      lerp(NAME.y + 30, NAME.y, settle),
      NAME.style,
      f.hand('title'),
      { alpha: settle, boil: 0.4 },
    );
    ctx.restore();
  },
});
