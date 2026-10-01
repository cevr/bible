import { UNMOVED, drawing, knobCamera, shotPath, glow, stars } from '@bible/film/canvas';
import { P, person, figure, stage, tablets, inscription, line } from '../kit.ts';

export const word = drawing({
  timeline: {
    // The match cut: the title's first word, where the title left it, drops
    // onto the page and lands as the card's word; the rest of the name falls away.
    match: { at: 'start', offset: 0.2, dur: 0.9, ease: 'inOutCubic' },
    fall: { at: 'start', dur: 0.6, ease: 'inQuad' },
    // The card comes up under the word as it lands.
    card: { after: 'match', dur: 0.3, ends: true, ease: 'outCubic' },
    shrug: { mark: 'church', offset: 0.2, dur: 0.4, ease: 'outBack' },
    unshrug: { mark: 'fair', dur: 0.5 },
    flip: { mark: 'right', offset: -0.1, dur: 0.5, ease: 'inOutSine' },
    cardOut: { mark: 'whose', offset: -0.2, dur: 0.4, ease: 'inCubic' },
    tape: { mark: 'whose', offset: 0.1, dur: 0.9, ease: 'outCubic' },
    wonder: { mark: 'whose', offset: 0.3, dur: 0.4 },
    tapeUp: { mark: 'psalm', offset: 0.2, dur: 0.6, ease: 'inCubic' },
    drop: { mark: 'all', dur: 0.5, ends: true, ease: 'outBack' },
    light: { mark: 'char', dur: 1.6 },
    grow: { mark: 'circle', offset: 0.1, dur: 1.9, ease: 'inCubic' },
    awe: { mark: 'circle', offset: 0.3, dur: 0.5 },
    lean: { mark: 'all', offset: -0.3, dur: 2.4, ease: 'inOutSine' },
    wide: { mark: 'circle', offset: 0.1, dur: 1.9, ease: 'inOutSine' },

    travel: { at: 'start', until: { at: 'end' }, ease: 'linear' },
  },
  knobs: { close: [1000, 560], closeZoom: 1.12 },
  draw: (f) => {
    const { ctx, t } = f;
    const cam = shotPath(UNMOVED, [
      [f.at('travel'), knobCamera(f.knob('close'), f.knob('closeZoom'))],
    ]);

    stage(f, 'page', cam, () => {
      figure(
        ctx,
        person(470, 970, 440, {
          near: { to: [0.21, -0.64], grip: 'open' },
          face: { brow: 0.55 },
          nod: -0.16 * f.at('awe'),
        }),
      );
      ctx.save();
      ctx.globalAlpha *= f.at('drop');
      tablets(ctx, 1230, 655, 2.5);
      glow(ctx, 1230, 635, 290, P.gold, f.at('light') * 0.45);
      ctx.restore();
      ctx.save();
      ctx.globalAlpha *= f.at('tape') * (1 - f.at('tapeUp'));
      ctx.fillStyle = P.cream;
      ctx.fillRect(680, 715, 550, 28);
      ctx.fillStyle = P.ink;
      for (let i = 0; i < 27; i++) ctx.fillRect(690 + i * 20, 715, 3, i % 5 === 0 ? 20 : 10);
      ctx.restore();
      const r = 130 + f.at('grow') * 1350;
      ctx.save();
      ctx.globalAlpha *= f.at('grow');
      line(
        ctx,
        Array.from(
          { length: 97 },
          (_, i) =>
            [
              1230 + Math.cos((i * Math.PI) / 48) * r,
              650 + Math.sin((i * Math.PI) / 48) * r,
            ] as const,
        ),
        P.gold,
        6,
      );
      stars(ctx, t, {
        seed: 39,
        count: 130,
        box: [0, 0, 1920, 1000],
        size: [1, 4],
        color: P.gold,
        alpha: 0.65 * f.at('grow'),
      });
      ctx.restore();
    });
    inscription(f, 'RIGHTEOUSNESS', 1120, 325, 82, 1, 1 - f.at('cardOut'));
    inscription(f, 'right doing', 1120, 418, 46, f.at('flip'), 1 - f.at('cardOut'));
  },
});
