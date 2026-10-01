import { drawing, knobCamera, shotPath } from '@bible/film/canvas';
import {
  P,
  person,
  christ,
  figure,
  stage,
  wordLight,
  inscription,
  bench,
  judge,
  gavel,
} from '../kit.ts';
import { cold } from './cold.ts';

export const name = drawing({
  timeline: {
    wide: { mark: 'how', offset: -0.9, dur: 1.2 },
    close: { mark: 'receive', offset: -0.4, dur: 0.9 },
    back: { mark: 'verdict', dur: 0.9, ends: true },
    lookUp: { mark: 'how', dur: 0.5 },
    questionOut: { mark: 'receive', offset: -0.6, dur: 0.4 },
    // On "taking" their near hand opens palm up and a gold word of light comes
    // down into it: faith, taking God at his word. On "receive" the hand, the
    // word fading in it, goes to the robe's sleeve.
    palm: { mark: 'taking', offset: -0.3, dur: 0.5, ease: 'inOutSine' },
    word: { mark: 'taking', offset: -0.1, dur: 1, ease: 'inOutSine' },
    wordOut: { mark: 'receive', offset: 0.1, dur: 0.5 },
    touch: { mark: 'receive', offset: -0.2, dur: 0.6, ease: 'inOutSine' },
    // The figure lets go of the robe before the heart comes: the new heart is given, not raised.
    release: { mark: 'heart', offset: -0.5, dur: 0.4 },
    give: { mark: 'heart', offset: -0.4, dur: 0.5 },
    pass: { mark: 'heart', offset: 0.1, dur: 0.5, ease: 'inOutSine' },
    heart: { mark: 'heart', offset: 0.35, dur: 0.8, ease: 'outCubic' },
    withdraw: { mark: 'heart', offset: 1, dur: 0.6 },
    sun: { mark: 'every', offset: -0.3, until: 'verdict', ease: 'inOutSine' },
    turn: { mark: 'verdict', offset: -0.2, dur: 0.4 },
    // The Advocate's hand opens to the figure's chest on "not" (a cover-up), a word with no mark.
    show: { mark: 'verdict', word: 'not', offset: -0.3, dur: 0.6 },
    // The judge's hand goes to the gavel before it falls, and holds it down into `thesis`.
    grasp: { with: 'gavel', dur: 0.5, ends: true },
    gavel: { mark: 'verdict', offset: 0.2, dur: 0.59 },
    // To the pair as "righteous" is said, a word with no mark.
    toPair: { mark: 'verdict', word: 'righteous', offset: 0.35, dur: 0.9 },
    toBench: { mark: 'real', offset: -0.3, dur: 0.8 },
    hollow: { mark: 'real', dur: 0.5 },
    land: { mark: 'true', dur: 0.5, ends: true, ease: 'inCubic' },
    lower: { mark: 'true', offset: 0.3, dur: 0.6 },
    stamp: { mark: 'true', dur: 0.3 },
    shine: { mark: 'true', dur: 0.6 },
    gold: { mark: 'jer', dur: 1.2 },
    // The stamp goes on "the coming King".
    stampOut: { mark: 'jer', word: 'king', dur: 0.5 },
    smile: { mark: 'jer', offset: 0.4, dur: 0.6 },

    travel: { at: 'start', until: { at: 'end' }, ease: 'linear' },
  },
  knobs: { close: [850, 575], closeZoom: 1.16 },
  draw: (f) => {
    const { ctx } = f;
    const court = f.knobsOf(cold);
    const cam = shotPath(knobCamera(court('wide'), court('wideZoom')), [
      [f.at('travel'), knobCamera(f.knob('close'), f.knob('closeZoom'))],
    ]);

    stage(f, 'court', cam, () => {
      figure(ctx, judge(f.at('gavel'), 0.04 * f.at('grasp')));
      bench(ctx, f.at('gold') * 0.45);
      gavel(ctx, f.at('gavel'));
      figure(
        ctx,
        person(600, 966, 435, {
          robe: P.white,
          cloth: P.white,
          near: { to: [0.23, -0.65], grip: 'open' },
          glow: { color: P.gold, amount: f.at('heart') + f.at('shine') },
          face: { smile: f.at('smile') * 0.8 },
          nod: -0.15 * f.at('lookUp'),
        }),
      );
      figure(
        ctx,
        christ(835, 964, 435, { near: { to: [0.22, -0.62], grip: 'open' }, face: { smile: 0.35 } }),
      );
      wordLight(ctx, 686, 663, 0.55 * f.at('word') * (1 - f.at('wordOut')));
    });
    inscription(
      f,
      'How should man be just with God?',
      960,
      175,
      58,
      f.spoken('how', 'not'),
      1 - f.at('questionOut'),
    );
    inscription(
      f,
      'RIGHTEOUS',
      1280,
      790,
      67,
      1,
      f.at('hollow') * (1 - f.at('stampOut')),
      2 * (1 - f.at('stamp')),
    );
  },
});
