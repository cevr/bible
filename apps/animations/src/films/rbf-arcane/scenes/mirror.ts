import { UNMOVED, drawing, knobCamera, shotPath, mix } from '@bible/film/canvas';
import { P, person, figure, stains, stage, oval, line } from '../kit.ts';

export const mirror = drawing({
  timeline: {
    shrink: { mark: 'short', dur: 1.8, ease: 'inOutSine' },
    toSew: { mark: 'fig', offset: -0.2, dur: 0.9, ease: 'inOutSine' },
    leaves: { mark: 'fig', offset: 0.4, dur: 2, ease: 'linear' },
    patches: { mark: 'harder', dur: 1.1, ease: 'linear' },
    toPatch: { mark: 'harder', dur: 0.6, ease: 'inOutSine' },
    // The needle hand rises beside the head: a travel of 0.7 s, landing on the word, never a jump.
    promise: { mark: 'promise', offset: -0.3, dur: 0.7, ease: 'inOutSine' },
    // As it lands, the hand opens to show its palm and lets the needle fall.
    open: { after: 'promise', dur: 0.3, ends: true, ease: 'inOutSine' },
    sheepish: { mark: 'going', offset: 0.1, dur: 0.4 },
    // The promising hand comes back down as they turn sheepish.
    lower: { mark: 'going', dur: 0.8, ease: 'inOutSine' },
    // The apron wilts; its two leaves fall one after the other over the same cue.
    droop: { mark: 'rags', offset: 0.3, dur: 1.2, ease: 'outCubic', stagger: 0.29 },
    wide: { mark: 'rags', dur: 1.4, ease: 'inOutSine' },
    stand: { mark: 'mirror', dur: 0.5, ease: 'outBack' },
    become: { mark: 'mirror', offset: 0.6, dur: 0.8, ease: 'inOutSine' },
    flare: { mark: 'stain', dur: 0.8 },
    push: { mark: 'stain', dur: 1, ease: 'inOutSine' },
    scrub: { mark: 'wash', offset: -0.3, dur: 0.7, ease: 'inOutSine' },
    back: { mark: 'wash', dur: 1, ease: 'inOutSine' },
    // Once the camera is back, he glances out at us.
    glance: { after: 'back', offset: 0.3, dur: 0.6 },

    travel: { at: 'start', until: { at: 'end' }, ease: 'linear' },
  },
  knobs: {
    close: [740, 640],
    closeZoom: 1.24,
    sewFace: [680, 685],
    sewFaceZoom: 2.5,
    reflection: [1180, 642],
    reflectionZoom: 2.1,
  },
  draw: (f) => {
    const { ctx, t } = f;
    const cam = shotPath(UNMOVED, [
      [f.at('travel'), knobCamera(f.knob('close'), f.knob('closeZoom'))],
      [f.at('toSew'), knobCamera(f.knob('sewFace'), f.knob('sewFaceZoom'))],
      [f.at('wide'), UNMOVED],
      [f.at('push'), knobCamera(f.knob('reflection'), f.knob('reflectionZoom'))],
    ]);

    const wash = f.at('scrub');
    const reflected = person(1375, 954, 420, {
      dir: -1,
      marks: stains(),
      head: 'cloth',
      face: { brow: 0.5 },
    });
    stage(f, 'garden', cam, () => {
      figure(
        ctx,
        person(630 + 430 * f.at('stand'), 970, 445, {
          marks: stains(),
          near: {
            to: [
              0.22 + 0.08 * f.at('stand'),
              -0.52 -
                0.04 * f.at('stand') +
                0.025 * Math.sin(t * 7) * wash -
                0.25 * f.at('promise') * (1 - f.at('lower')),
            ],
            grip: 'hold',
          },
          face: { brow: 0.65 },
          nod: 0.12 * (1 - f.at('become')),
          turn: 0.45 + 0.3 * f.at('glance'),
        }),
      );
      ctx.save();
      ctx.globalAlpha *= f.at('leaves') * (1 - f.at('droop'));
      for (let i = 0; i < 8; i++)
        oval(
          ctx,
          580 + (i % 3) * 40,
          742 + Math.floor(i / 3) * 51 + 75 * f.stagger('droop', i, 8),
          33,
          44,
          mix(P.sage, P.scarlet, i % 3 === 0 ? 0.35 : 0),
        );
      ctx.restore();
      ctx.save();
      ctx.globalAlpha *= f.at('become');
      ctx.fillStyle = P.woodLit;
      ctx.fillRect(1180, 470, 370, 510);
      ctx.fillStyle = '#aac0b4';
      ctx.fillRect(1200, 488, 330, 470);
      figure(ctx, reflected);
      ctx.restore();
      ctx.save();
      ctx.globalAlpha *= f.at('leaves') * (1 - f.at('stand'));
      line(
        ctx,
        [
          [722, 735],
          [731, 714],
        ],
        P.cream,
        3,
      );
      line(
        ctx,
        [
          [722, 735],
          [690, 768],
          [648, 780],
          [616, 755],
        ],
        P.gold,
        2,
      );
      ctx.restore();
      ctx.save();
      ctx.globalAlpha *= wash;
      ctx.translate(1205, 695 + Math.sin(t * 5) * 12 * wash);
      ctx.rotate(-0.2 + Math.sin(t * 5) * 0.18 * wash);
      oval(ctx, 0, 0, 31, 43, P.woodLit);
      oval(ctx, 0, 0, 25, 36, '#aac0b4');
      line(
        ctx,
        [
          [-12, -9],
          [6, 5],
          [14, 20],
        ],
        P.scarlet,
        8,
      );
      line(
        ctx,
        [
          [0, 38],
          [0, 66],
        ],
        P.woodLit,
        11,
      );
      ctx.restore();
    });
  },
});
