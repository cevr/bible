import { UNMOVED, drawing, knobCamera, shotPath } from '@bible/film/canvas';
import { person, figure, stage, inscription } from '../kit.ts';

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
      figure(ctx, person(700, 770, 170, { pose: 'sit', nod: -0.25 * f.at('lookUp') }));
    });
    inscription(f, 'RIGHTEOUSNESS', 960, 315, 96, f.at('rise'));
    inscription(f, 'BY FAITH', 960, 435, 85, f.at('settle'));
  },
});
