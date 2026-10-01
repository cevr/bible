import { UNMOVED, drawing, knobCamera, shotPath, glow } from '@bible/film/canvas';
import { P, person, christ, figure, stains, stage, oval, bench } from '../kit.ts';

export const accuser = drawing({
  timeline: {
    down: { at: 'start', dur: 3.1, ease: 'inOutSine' },
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
    back: { mark: 'angel', dur: 1, ends: true, ease: 'inOutCubic' },
    raise: { mark: 'angel', offset: 0.1, dur: 0.8, ease: 'inOutSine' },
    drop: { mark: 'silence', dur: 0.6, ease: 'inCubic' },
    shrink: { mark: 'silence', offset: 0.1, dur: 0.8 },
    lower: { mark: 'silence', offset: 0.4, dur: 0.7 },
    lift: { mark: 'silence', offset: 0.1, dur: 0.6 },
    grip: { mark: 'silence', offset: 0.5, dur: 0.8 },

    travel: { at: 'start', until: { at: 'end' }, ease: 'linear' },
  },
  knobs: {
    close: [775, 615],
    closeZoom: 1.25,
    faceAt: [570, 545],
    faceZoom: 5.4,
  },
  draw: (f) => {
    const { ctx } = f;
    const cam = shotPath(UNMOVED, [
      [f.at('travel'), knobCamera(f.knob('close'), f.knob('closeZoom'))],
      [f.at('push'), knobCamera(f.knob('faceAt'), f.knob('faceZoom'))],
      [f.at('toPair'), knobCamera(f.knob('close'), f.knob('closeZoom'))],
      [f.at('back'), UNMOVED],
    ]);

    const retreat = f.at('shrink');
    stage(f, 'court', cam, () => {
      bench(ctx, 0.25);
      figure(
        ctx,
        person(570, 944, 430, {
          head: 'turban',
          marks: stains(),
          nod: 0.15 * f.at('bow'),
          face: { brow: 0.7 },
          near: { to: [0.08, -0.59], grip: 'rest' },
        }),
      );
      figure(
        ctx,
        person(770 + 100 * (1 - f.at('enter')) + 220 * retreat, 944, 490, {
          robe: P.ink,
          cloth: P.tealDeep,
          head: 'hood',
          alpha: f.at('enter') * (1 - retreat),
          near: { to: [0.28, -0.62 + f.at('drop') * 0.3], grip: 'point' },
          face: { brow: -0.7 },
          light: { from: -2.2, key: '#94aaa3', rim: P.tealRim, shade: P.tealDeep },
        }),
      );
      figure(
        ctx,
        christ(1130, 930, 450, {
          near: { to: [0.24, -0.62 - 0.2 * f.at('raise')], grip: 'palm' },
          face: { brow: -0.2 },
        }),
      );
      glow(ctx, 560, 650, 190, P.scarlet, 0.4 * f.at('flare') * (1 - f.at('dim')));
      oval(ctx, 1420, 520, 40, 40, P.gold);
    });
  },
});
