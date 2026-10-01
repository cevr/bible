import { drawing, knobCamera, shotPath } from '@bible/film/canvas';
import { P, person, figure, stains, stage, inscription, bench, papers, gavel } from '../kit.ts';

export const cold = drawing({
  timeline: {
    drop: { mark: 'evidence', dur: 1.4, ease: 'inCubic', stagger: 0.857 },
    bow: { mark: 'did', dur: 0.35 },
    // The judge leans in, his hand going to the gavel; he lets it go as it comes to rest.
    lean: { mark: 'judge', dur: 0.4 },
    gavel: { mark: 'righteous', offset: -0.37, dur: 0.59 },
    stamp: { mark: 'righteous', offset: -0.03, dur: 0.2, ease: 'outBack' },
    lift: { mark: 'righteous', offset: 0.1, dur: 0.37 },
    stampOut: { mark: 'wait', dur: 0.17, ends: true },
    push: { mark: 'wait', dur: 0.9 },
    puzzle: { mark: 'wait', offset: 0.17, dur: 0.25 },
    back: { mark: 'bible', dur: 1 },
    stampBack: { after: 'back', dur: 0.25 },
    rest: { mark: 'oldest', dur: 0.57 },
    drain: { mark: 'oldest', dur: 1.1, ease: 'inOutSine' },
    hollowOut: { mark: 'job', dur: 0.5, ends: true },
    // Wide once the verdict has drained.
    wide: { after: 'drain', offset: 0.1, dur: 1.6 },
    lookUp: { mark: 'job', dur: 0.6 },

    travel: { at: 'start', until: { at: 'end' }, ease: 'linear' },
  },
  knobs: {
    wide: [960, 540],
    wideZoom: 1,
    close: [590, 568],
    closeZoom: 1.12,
    face: [600, 570],
    faceZoom: 3.6,
  },
  draw: (f) => {
    const { ctx } = f;
    const cam = shotPath(knobCamera(f.knob('wide'), f.knob('wideZoom')), [
      [f.at('travel'), knobCamera(f.knob('close'), f.knob('closeZoom'))],
      [f.at('push'), knobCamera(f.knob('face'), f.knob('faceZoom'))],
      [f.at('back'), knobCamera(f.knob('wide'), f.knob('wideZoom'))],
    ]);

    stage(f, 'court', cam, () => {
      figure(
        ctx,
        person(1280, 847, 495, {
          pose: 'sit',
          robe: P.ink,
          head: 'bare',
          beard: true,
          near: { to: [0.3, -0.35], grip: 'hold' },
          face: { brow: -0.2 },
        }),
      );
      bench(ctx);
      gavel(ctx, f.at('gavel'));
      figure(
        ctx,
        person(600, 966, 435, {
          marks: stains(),
          nod: f.at('bow') * 0.15 - f.at('lookUp') * 0.22,
          face: { brow: f.at('puzzle'), open: 0.15 * f.at('puzzle') },
        }),
      );
      ctx.save();
      ctx.globalAlpha *= f.at('drop');
      papers(ctx, f.at('drop'));
      ctx.restore();
    });
    inscription(
      f,
      'RIGHTEOUS',
      1280,
      790,
      67,
      1,
      f.at('stamp') * (1 - f.at('stampOut')) + f.at('stampBack') * (1 - f.at('hollowOut')),
      2 * f.at('drain'),
    );
    inscription(
      f,
      'How should man be just with God?',
      960,
      175,
      58,
      f.spoken('job'),
      f.at('lookUp'),
    );
  },
});
