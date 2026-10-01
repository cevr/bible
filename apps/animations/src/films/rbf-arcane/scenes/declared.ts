import { UNMOVED, drawing, knobCamera, shotPath, glow, mix } from '@bible/film/canvas';
import { P, person, figure, stains, stage, wordLight, gifts, inscription } from '../kit.ts';

export const declared = drawing({
  timeline: {
    // It opens on the row `look` left, faith glowing; on "now" the robe lights
    // beside it, and the row lifts off the top as the parchment comes forward.
    robeLit: { mark: 'now', offset: 0.4, dur: 0.7, ease: 'outBack' },
    lift: { mark: 'paul', offset: -0.5, dur: 0.9, ease: 'inCubic' },
    cardIn: { mark: 'justified', offset: -0.3, dur: 0.4, ease: 'outBack' },
    greek: { mark: 'justified', offset: 0.5, dur: 0.5 },
    madeLine: { after: 'greek', dur: 0.5 },
    doubt: { mark: 'still', dur: 0.5 },
    push: { mark: 'still', offset: -0.2, dur: 0.8 },
    cardOut: { mark: 'cover', offset: -0.2, dur: 0.4 },
    drift: { mark: 'cover', offset: 0.1, dur: 1.2, ease: 'outCubic' },
    patch: { mark: 'would', offset: 0.3, dur: 1.2, ease: 'linear' },
    unpatch: { mark: 'subst', dur: 1, ease: 'linear' },
    sink: { mark: 'voice', offset: -0.15, dur: 1.4, ease: 'linear' },
    back: { mark: 'voice', offset: -0.3, dur: 0.8, ease: 'inOutCubic' },
    panel: { mark: 'voice', offset: 0.2, dur: 0.6, ease: 'outBack' },
    speak: { mark: 'speaks', offset: -0.6, dur: 1.3, ease: 'inOutSine' },
    landed: { after: 'speak', dur: 0.5 },
    bloom: { mark: 'made', offset: -0.6, dur: 1.6, ease: 'outCubic' },

    travel: { at: 'start', until: { at: 'end' }, ease: 'linear' },
  },
  knobs: { close: [890, 598], closeZoom: 1.2 },
  draw: (f) => {
    const { ctx } = f;
    const cam = shotPath(UNMOVED, [
      [f.at('travel'), knobCamera(f.knob('close'), f.knob('closeZoom'))],
    ]);

    const made = f.at('bloom');
    stage(f, 'page', cam, () => {
      figure(
        ctx,
        person(750, 964, 490, {
          head: 'bare',
          robe: mix('#82908b', P.white, made),
          marks: stains(1 - made),
          glow: { color: P.gold, amount: made },
          near: { to: [0.2, -0.69], grip: 'open' },
          face: { brow: 0.7 * (1 - made), smile: 0.6 * made },
        }),
      );
      wordLight(
        ctx,
        1400 - 650 * f.at('speak'),
        610 - 130 * Math.sin(f.at('speak') * Math.PI),
        f.at('speak') * (1 - f.at('landed')),
      );
      glow(ctx, 750, 667, 290, P.gold, made * 0.6);
    });
    const card = f.at('cardIn') * (1 - f.at('cardOut'));
    inscription(f, 'JUSTIFY', 1240, 370, 94, 1, card);
    inscription(f, 'δικαιόω · made righteous', 1240, 468, 47, f.at('madeLine'), card);
    inscription(
      f,
      'RIGHTEOUS',
      1140,
      680,
      72,
      1,
      f.at('drift') * (1 - f.at('sink')),
      2 * (1 - f.at('unpatch')),
    );
    gifts(ctx, [1, f.at('robeLit'), 0], 1 - f.at('lift'));
  },
});
