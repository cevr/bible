import { drawing, knobCamera, shotPath } from '@bible/film/canvas';
import { rooftop, P, person, christ, figure, stage, inscription, bench } from '../kit.ts';
import { name } from './name.ts';

export const thesis = drawing({
  timeline: {
    lookUp: { at: 'speech', dur: 0.5 },
    answer: { at: 'speech', dur: 1.6, ease: 'linear' },
    // The plate fades in over the answer's first words.
    answerIn: { with: 'answer', dur: 0.4, ease: 'linear' },
    // The gavel lifts back from where `name` laid it down.
    gavel: { at: 'start', dur: 2, ease: 'linear' },
    // The judge, who held it down through `name`'s last line, lets it go once it stands again.
    letGo: { after: 'gavel', dur: 0.5 },
    // A pause the script means: the answer stands alone on screen while the
    // music rises, then lets go. What follows it hangs off it.
    textOut: { at: 'speechEnd', offset: 7.9, dur: 1.2 },
    away: { with: 'textOut', offset: 0.6, dur: 4.5, ease: 'inOutSine' },
    // The court lets go to the sky, then the city comes in: no double image.
    courtOut: { with: 'away', offset: 1.66, dur: 0.88, ease: 'linear' },
    cityIn: { after: 'courtOut', offset: -0.15, dur: 2.11, ease: 'outQuad' },
    city: { with: 'cityIn', offset: 0.21, dur: 11, ease: 'inOutSine' },
    // The two of them turn to each other once the city has settled.
    turn: { after: 'city', offset: 1.3, dur: 1.2 },

    travel: { at: 'start', until: { at: 'end' }, ease: 'linear' },
  },
  knobs: { close: [1070, 650], closeZoom: 0.87 },
  draw: (f) => {
    const { ctx } = f;
    const opening = f.knobsOf(name);
    const cam = shotPath(knobCamera(opening('close'), opening('closeZoom')), [
      [f.at('travel'), knobCamera(f.knob('close'), f.knob('closeZoom'))],
    ]);

    const city = f.at('cityIn');
    stage(f, 'court', cam, () => {
      ctx.save();
      ctx.globalAlpha *= 1 - city;
      figure(ctx, person(1280, 847, 495, { pose: 'sit', robe: P.ink, head: 'bare', beard: true }));
      bench(ctx, 0.45);
      figure(
        ctx,
        person(600, 966, 435, {
          robe: P.white,
          cloth: P.white,
          glow: { color: P.gold, amount: 1 },
        }),
      );
      figure(ctx, christ(835, 964, 435));
      ctx.restore();
    });
    ctx.save();
    ctx.globalAlpha *= city;
    stage(f, 'city', cam, () => {
      rooftop(ctx, f.at('turn'));
    });
    ctx.restore();
    inscription(
      f,
      'THE LORD OUR RIGHTEOUSNESS',
      960,
      175,
      65,
      f.at('answer'),
      f.at('answerIn') * (1 - f.at('textOut')),
    );
  },
});
