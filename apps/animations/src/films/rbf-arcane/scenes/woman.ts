import { UNMOVED, drawing, knobCamera, shotPath, mix } from '@bible/film/canvas';
import {
  P,
  person,
  christ,
  figure,
  stains,
  stage,
  paintedCrowd,
  oval,
  tablets,
  gifts,
  line,
} from '../kit.ts';

export const woman = drawing({
  timeline: {
    // The charge held up, and lowered as he straightens.
    charge: { mark: 'law', dur: 0.7 },
    chargeDown: { mark: 'first', dur: 0.6 },
    // He stoops to the dust and writes; he straightens on "first".
    stoop: { mark: 'dust', offset: -0.2, dur: 0.9, ease: 'inOutSine' },
    pen: { mark: 'dust', offset: 0.5, dur: 0.5 },
    writing: { mark: 'dust', offset: 0.8, until: 'first', ease: 'linear' },
    straighten: { mark: 'first', dur: 0.9, ease: 'inOutSine' },
    // One by one they drop their stones and go.
    drop: { mark: 'leave', offset: -0.2, until: 'alone', ease: 'linear' },
    leave: { mark: 'leave', offset: 0.3, until: 'none', ease: 'linear' },
    // The shots: in on the charge, over to him writing, wide as he straightens, in on the two.
    toCharge: { mark: 'law', offset: -0.3, dur: 1, ease: 'inOutCubic' },
    toDust: { mark: 'dust', offset: -0.3, dur: 1, ease: 'inOutCubic' },
    toWide: { mark: 'first', offset: -0.2, dur: 1, ease: 'inOutCubic' },
    courtPush: { mark: 'alone', until: 'lord', ease: 'inOutSine' },
    // He asks; close on her as she answers, then the reverse on him as he speaks.
    asks: { mark: 'none', until: 'lord', ease: 'linear' },
    raise: { mark: 'none', dur: 0.8 },
    herFace: { mark: 'lord', dur: 0.8, ends: true, ease: 'inOutCubic' },
    lookUp: { mark: 'lord', dur: 0.6 },
    herPush: { mark: 'lord', until: 'told', ease: 'linear' },
    hisPush: { mark: 'told', until: 'again', ease: 'linear' },
    speaks: { mark: 'told', word: 'Neither', until: 'again', ease: 'linear' },
    // His open hand turns out toward her as he speaks, and settles as the count begins.
    sends: { mark: 'told', word: 'Neither', dur: 0.6 },
    sent: { mark: 'again', offset: -0.4, dur: 0.6 },
    // Wide as she walks out, clean.
    wash: { mark: 'told', word: 'go', dur: 0.6 },
    walkOut: { mark: 'told', word: 'go', offset: 0.3, dur: 2.2, ease: 'inQuad' },
    // The count again, each number lit on the number itself.
    band: { mark: 'again', dur: 0.6, ease: 'outCubic' },
    // Each number's icon pops forward, gold, on the number; the one before steps back.
    oneLit: { mark: 'one', dur: 0.55, ease: 'outBack' },
    oneHold: { mark: 'one', until: 'two', ease: 'linear' },
    twoLit: { mark: 'two', dur: 0.55, ease: 'outBack' },
    // Held from two to three: the push onto his face, and his talking as he speaks.
    twoHold: { mark: 'two', until: 'three', ease: 'linear' },
    threeLit: { mark: 'three', dur: 0.55, ease: 'outBack' },
    threeWalk: { mark: 'three', until: 'order', ease: 'inQuad' },
    // The echo of each gift in the picture: a light behind her face as she calls him Lord, her heart lit as she goes.
    faith: { mark: 'one', offset: 0.1, dur: 0.8, ease: 'outCubic' },
    heart: { mark: 'three', offset: 0.2, dur: 0.8, ease: 'outCubic' },
    // The same three, in the same order: the band down into the section head's row.
    toIdea: { mark: 'order', dur: 1.3, ease: 'inOutCubic' },

    travel: { at: 'start', until: { at: 'end' }, ease: 'linear' },
  },
  knobs: {
    close: [865, 620],
    closeZoom: 1.18,
    herFaceAt: [690, 530],
    herFaceZoom: 5.4,
    hisFaceAt: [1200, 530],
    hisFaceZoom: 5.4,
    dustAt: [1090, 900],
    dustZoom: 2.5,
  },
  draw: (f) => {
    const { ctx } = f;
    const cam = shotPath(UNMOVED, [
      [f.at('travel'), knobCamera(f.knob('close'), f.knob('closeZoom'))],
      [f.at('toDust'), knobCamera(f.knob('dustAt'), f.knob('dustZoom'))],
      [f.at('toWide'), UNMOVED],
      [f.at('herFace'), knobCamera(f.knob('herFaceAt'), f.knob('herFaceZoom'))],
      [f.at('hisPush'), knobCamera(f.knob('hisFaceAt'), f.knob('hisFaceZoom'))],
      [f.at('sent'), UNMOVED],
      [f.at('oneLit'), knobCamera(f.knob('herFaceAt'), f.knob('herFaceZoom'))],
      [f.at('twoLit'), knobCamera(f.knob('hisFaceAt'), f.knob('hisFaceZoom'))],
      [f.at('threeLit'), UNMOVED],
    ]);

    const wash = f.at('wash');
    const replay = f.at('band');
    const womanX = 690 - 480 * f.at('walkOut') * (1 - replay) - 350 * f.at('threeWalk');
    stage(f, 'temple', cam, () => {
      for (const [i, p] of paintedCrowd(69, 700, 9).entries()) {
        const leave = f.stagger('leave', i, 9);
        figure(ctx, {
          ...p,
          x: p.x - 650 * leave,
          alpha: 1 - leave,
          near: { to: [0.17, -0.68], grip: 'hold' },
          face: { brow: -0.7 },
        });
        oval(ctx, p.x + 30, p.y - 140 * (1 - f.stagger('drop', i, 9)), 11, 8, '#8d8d7b');
      }
      ctx.save();
      ctx.globalAlpha *= f.at('charge') * (1 - f.at('chargeDown'));
      tablets(ctx, 320, 610, 1.1);
      ctx.restore();
      figure(
        ctx,
        person(womanX, 948, 455, {
          head: 'veil',
          robe: mix('#958582', P.white, wash),
          cloth: mix('#aa8f80', P.white, wash),
          marks: stains(1 - wash),
          pose: 'walk',
          step: f.at('walkOut') * Math.PI * 7,
          nod: -0.15 * f.at('lookUp'),
          glow: { color: P.gold, amount: f.at('heart') },
          face: { brow: 0.45, smile: wash * 0.5 },
        }),
      );
      figure(
        ctx,
        christ(1200, 945, 450, {
          lean: 0.5 * f.at('stoop') * (1 - f.at('straighten')),
          pose: 'stoop',
          near: { to: [0.24, -0.27 - 0.39 * f.at('straighten')], grip: 'point' },
          face: { open: 0.12 * Math.sin(f.at('speaks') * Math.PI * 14) },
        }),
      );
      ctx.save();
      ctx.globalAlpha *= f.at('writing');
      for (let i = 0; i < 7; i++)
        line(
          ctx,
          [
            [1070 + i * 16, 960],
            [1080 + i * 16, 953],
            [1092 + i * 16, 959],
          ],
          '#806b54',
          3,
        );
      ctx.restore();
    });
    gifts(ctx, [f.at('oneLit'), f.at('twoLit'), f.at('threeLit')], replay);
  },
});
