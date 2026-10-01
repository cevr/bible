import { UNMOVED, house, drawing, knobCamera, shotPath } from '@bible/film/canvas';
import { P, person, figure, stage, inscription } from '../kit.ts';

export const title = drawing({
  timeline: {
    rise: { at: 'start', dur: 1.2, ease: 'outCubic' },
    settle: { at: 'start', offset: 0.17, dur: 0.6, ease: 'outCubic' },
    // The figure looks up as the rise comes to rest.
    lookUp: { after: 'rise', offset: -0.03, dur: 0.5 },
    // A slow tilt up over the whole title.
    tilt: { at: 'start', until: { at: 'end' }, ease: 'linear' },
  },
  knobs: { close: [960, 465], closeZoom: 1.08 },
  draw: (f) => {
    const { ctx } = f;
    const cam = shotPath(UNMOVED, [
      [f.at('tilt'), knobCamera(f.knob('close'), f.knob('closeZoom'))],
    ]);

    stage(f, 'city', cam, () => {
      house(ctx, {
        x: 520,
        y: 985,
        w: 370,
        h: 245,
        side: 45,
        wall: P.peach,
        light: { side: 1, key: P.peach, shade: P.tealDeep },
        openings: [{ u: 0.35, v: 0.3, w: 0.22, h: 0.45, lamp: P.gold }],
      });
      figure(ctx, person(700, 785.9, 170, { pose: 'sit', nod: -0.25 * f.at('lookUp') }));
    });
    inscription(f, 'RIGHTEOUSNESS', 960, 315, 96, f.at('rise'));
    inscription(f, 'BY FAITH', 960, 435, 85, f.at('settle'));
  },
});
