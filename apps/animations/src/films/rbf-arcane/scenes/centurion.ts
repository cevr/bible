import { UNMOVED, drawing, knobCamera, shotPath } from '@bible/film/canvas';
import { P, person, christ, figure, stage, wordLight, gifts, bed, sleeping } from '../kit.ts';

export const centurion = drawing({
  timeline: {
    worry: { mark: 'servant', dur: 0.5 },
    offer: { mark: 'offer', dur: 0.7 },
    push: { mark: 'only', offset: -0.2, dur: 0.9 },
    stop: { mark: 'only', offset: 0.25, dur: 0.6, ease: 'outCubic' },
    // Out over the town as he says "come", and the word leaves with it.
    pullOut: { mark: 'only', word: 'come', dur: 1.1 },
    fly: { with: 'pullOut', offset: 0.07, dur: 1.7, ease: 'inOutSine' },
    // Landed by the bed, the word's light fades.
    landed: { after: 'fly', dur: 1.5, ease: 'linear' },
    sit: { mark: 'healed', dur: 0.8, ease: 'outBack' },
    // As the servant starts to sit up, the colour comes back to the face.
    colour: { with: 'sit', offset: 0.056, dur: 0 },
    toWindow: { mark: 'room', offset: -0.4, dur: 1.1 },
    handShot: { mark: 'room', word: 'room', dur: 1.2, ease: 'outCubic' },
    open: { mark: 'def', dur: 0.6 },
    settle: { mark: 'faith', offset: -0.8, dur: 1.5, ease: 'outCubic' },
    // The word's fall into the palm, beside its glide across: down fast, then
    // resting, so its path arcs over into the hand.
    drop: { with: 'settle', until: { cue: 'settle' }, ease: 'outExpo' },
    hold: { mark: 'faith', offset: 0.7, until: 'gift', ease: 'linear' },
    // Faith's disc opens on the word in his hand and pulls back to the row's
    // place; the robe and the heart pop in beside it as it settles, so no disc
    // slides in cut by the frame.
    toIcons: { mark: 'gift', offset: -0.1, dur: 0.3 },
    pullBack: { with: 'toIcons', dur: 0.9, ease: 'inOutSine' },
    robeIn: { with: 'pullBack', offset: 0.45, dur: 0.4, ease: 'outBack' },
    heartIn: { with: 'pullBack', offset: 0.6, dur: 0.4, ease: 'outBack' },
    // The word-bubble lights on "faith", a word with no mark of its own.
    // Faith pops forward in gold on its word, the other two faded back.
    faithLit: { mark: 'gift', word: 'faith', dur: 0.6, ease: 'outBack' },

    travel: { at: 'start', until: { at: 'end' }, ease: 'linear' },
  },
  knobs: {
    close: [870, 650],
    closeZoom: 1.15,
    soldierFace: [530, 525],
    soldierZoom: 5.2,
    servantFace: [1495, 670],
    servantZoom: 3.9,
  },
  draw: (f) => {
    const { ctx } = f;
    const cam = shotPath(UNMOVED, [
      [f.at('travel'), knobCamera(f.knob('close'), f.knob('closeZoom'))],
      [f.at('push'), knobCamera(f.knob('soldierFace'), f.knob('soldierZoom'))],
      [f.at('pullOut'), UNMOVED],
      [f.at('toWindow'), knobCamera(f.knob('servantFace'), f.knob('servantZoom'))],
      [f.at('handShot'), knobCamera(f.knob('soldierFace'), f.knob('soldierZoom'))],
      [f.at('pullBack'), UNMOVED],
    ]);

    const sit = f.at('sit');
    stage(f, 'town', cam, () => {
      figure(
        ctx,
        person(530, 940, 455, {
          robe: '#a39886',
          head: 'helmet',
          cloth: '#a6a191',
          crest: P.scarlet,
          beard: true,
          near: { to: [0.25, -0.69 - 0.13 * f.at('stop')], grip: 'palm' },
          face: { brow: 0.6 },
        }),
      );
      figure(ctx, christ(1000, 940, 460, { near: { to: [0.3, -0.64], grip: 'open' } }));
      bed(ctx, 1520, 865, 0.8);
      ctx.save();
      ctx.globalAlpha *= 1 - sit;
      sleeping(ctx, 1520, 865, 0.7);
      ctx.restore();
      figure(
        ctx,
        person(1510, 933.7, 290, {
          pose: 'sit',
          alpha: sit,
          robe: P.white,
          head: 'bare',
          face: { smile: 0.6 },
        }),
      );
      wordLight(
        ctx,
        620 + 895 * f.at('fly'),
        635 - 185 * Math.sin(f.at('fly') * Math.PI),
        0.65 * f.at('fly') * (1 - f.at('landed')),
      );
      wordLight(ctx, 590, 655, 0.6 * f.at('settle'));
    });
    gifts(ctx, [f.at('faithLit'), 0, 0], f.at('toIcons'));
  },
});
