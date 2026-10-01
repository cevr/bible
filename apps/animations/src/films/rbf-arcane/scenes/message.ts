import { UNMOVED, drawing, knobCamera, shotPath, glow, mix } from '@bible/film/canvas';
import {
  P,
  person,
  christ,
  figure,
  stage,
  paintedCrowd,
  oval,
  robe,
  gifts,
  inscription,
  line,
} from '../kit.ts';

export const message = drawing({
  timeline: {
    // Outside the hall at dusk, the figure from `mirror` looks up at its one
    // lit window; on "year" the camera pushes through the window into the hall.
    lookUp: { mark: 'how', offset: 0.3, dur: 0.8, ease: 'inOutSine' },
    window: { mark: 'year', offset: -0.3, dur: 1.3, ease: 'inCubic' },
    // Waggoner holds the open Bible from the cut: the hall opens on it.
    bible: { at: 'start', dur: 0 },
    placard: { after: 'window', dur: 0.5, ease: 'outBack' },
    stepUp: { mark: 'two', dur: 0.6 },
    push: { mark: 'two', offset: 0.3, dur: 1.4, ease: 'inOutSine' },
    placardOut: { mark: 'two', offset: 0.1, dur: 0.4 },
    back: { mark: 'rep', dur: 1, ease: 'inOutSine' },
    split: { mark: 'rep', offset: 0.5, dur: 0.8, ease: 'outBack' },
    precious: { mark: 'precious', dur: 0.9 },
    curious: { mark: 'what', dur: 0.4 },
    light: { mark: 'answer', offset: -0.2, dur: 1.4 },
    turn: { mark: 'answer', dur: 0.6 },
    toPulpit: { mark: 'answer', offset: 0.2, dur: 1.6, ease: 'inOutSine' },
    roof: { mark: 'angel', dur: 1.1, ease: 'inCubic' },
    fly: { mark: 'angel', offset: 0.4, dur: 1.5, ease: 'outCubic' },
    // The angel has the banner in hand as it flies in, still off frame.
    grasp: { with: 'fly', dur: 0 },
    flyOut: { mark: 'hand', offset: -0.2, dur: 0.9, ease: 'inCubic' },
    // The banner fades as the angel starts to leave.
    bannerOut: { with: 'flyOut', dur: 0.567, ease: 'inCubic' },
    meet: { mark: 'hand', offset: 0.2, dur: 0.9, ease: 'outCubic' },
    golden: { after: 'meet', dur: 0.6 },
    // Halfway through the gold coming up, the cross is cut in gold.
    gilded: { with: 'golden', offset: 0.3, dur: 0 },
    through: { mark: 'three', offset: -0.1, dur: 0.6, ease: 'inCubic' },
    faith: { mark: 'faith', offset: -0.15, dur: 0.45, ease: 'outBack' },
    forgiveness: { mark: 'forgiveness', offset: -0.15, dur: 0.45, ease: 'outBack' },
    power: { mark: 'power', offset: -0.15, dur: 0.45, ease: 'outBack' },
    figureIn: { after: 'through', dur: 0.5, ease: 'outBack' },
    hear: { mark: 'three', offset: 0.9, dur: 0.5 },
    given: { mark: 'makes', offset: -0.6, dur: 0.8, ease: 'inOutSine' },
    warm: { after: 'given', dur: 1 },
    // The figure lifts its open hand, turns it palm up as it comes, and the
    // camera pushes into it: the insert, the same hand close up.
    offer: { with: 'handIn', dur: 0.6, ends: true },
    palmUp: { mark: 'gifts', offset: -0.7, dur: 0.3, ease: 'inOutSine' },
    handIn: { mark: 'gifts', offset: -0.4, dur: 0.7, ease: 'inOutCubic' },
    // Close on the palm, its fingers curl a little on "gifts": the hand that takes hold of them.
    take: { mark: 'gifts', dur: 0.7, ease: 'inOutSine' },
    // The days start on "daily" and run to the last word.
    days: { mark: 'daily', until: { at: 'speechEnd' }, ease: 'linear' },

    travel: { at: 'start', until: { at: 'end' }, ease: 'linear' },
  },
  knobs: { close: [990, 570], closeZoom: 1.13 },
  draw: (f) => {
    const { ctx } = f;
    const cam = shotPath(UNMOVED, [
      [f.at('travel'), knobCamera(f.knob('close'), f.knob('closeZoom'))],
    ]);

    const band = f.at('through');
    stage(f, 'hall', cam, () => {
      for (const p of paintedCrowd(321, 960, 15)) figure(ctx, { ...p, alpha: 1 - band });
      figure(
        ctx,
        person(850, 935, 450, {
          robe: '#556674',
          head: 'bare',
          beard: true,
          near: { to: [0.16, -0.65], grip: 'hold' },
          alpha: 1 - band,
        }),
      );
      figure(
        ctx,
        person(1100, 935, 465, {
          robe: '#8b7065',
          head: 'bare',
          beard: true,
          near: { to: [0.25, -0.69], grip: 'open' },
          alpha: 1 - band,
        }),
      );
      ctx.save();
      ctx.globalAlpha *= 1 - band;
      ctx.fillStyle = P.cream;
      ctx.fillRect(810, 565, 120, 65);
      line(
        ctx,
        [
          [870, 565],
          [870, 630],
        ],
        P.wood,
        3,
      );
      glow(ctx, 960, 630, 420, P.gold, 0.6 * f.at('light'));
      ctx.restore();
      figure(
        ctx,
        person(960, 975, 460, {
          robe: mix('#86918b', P.white, f.at('warm')),
          head: 'bare',
          glow: { color: P.gold, amount: f.at('given') },
          near: { to: [0.26, -0.64], grip: 'open' },
          alpha: band,
        }),
      );
    });
    const banner = f.at('fly') * (1 - f.at('bannerOut'));
    ctx.save();
    ctx.globalAlpha *= banner;
    figure(ctx, christ(500 + 1000 * f.at('fly'), 340, 150, { shadow: 0 }));
    robe(ctx, 500 + 1000 * f.at('fly') - 80, 265, 0.9);
    ctx.fillStyle = P.cream;
    ctx.fillRect(450, 380, 1040, 112);
    ctx.restore();
    inscription(f, 'The commandments of God, and the faith of Jesus', 960, 447, 39, 1, banner);
    gifts(ctx, [f.at('faith'), f.at('forgiveness'), f.at('power')], band);
    if (f.at('days') > 0)
      oval(
        ctx,
        550 + 850 * f.at('days'),
        440 - 170 * Math.sin(f.at('days') * Math.PI * 3),
        29,
        29,
        P.gold,
      );
  },
});
