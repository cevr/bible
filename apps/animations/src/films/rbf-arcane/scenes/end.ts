import { write, drawing, knobCamera, shotPath } from '@bible/film/canvas';
import { P, stage, rooftop } from '../kit.ts';
import { thesis } from './thesis.ts';
import { CREDITS } from '../credits.ts';
import { fonts } from '../../righteousness-by-faith/palette.ts';

export const end = drawing({
  drift: 0,
  timeline: {
    // The strip comes in, the credits roll up it, and it goes: the rest is clear for the end screens.
    stripIn: { at: 'start', dur: 0.8 },
    roll: { at: 'start', dur: 22, ease: 'linear' },
    stripOut: { after: 'roll', dur: 0.8 },
    // The pull back, from where `thesis` leaves the city, settling as the strip goes.
    back: { with: 'roll', dur: 24, ease: 'inOutSine' },
  },
  knobs: { close: [1100, 620], closeZoom: 0.8 },
  draw: (f) => {
    const { ctx } = f;
    const opening = f.knobsOf(thesis);
    const cam = shotPath(knobCamera(opening('close'), opening('closeZoom')), [
      [f.at('back'), knobCamera(f.knob('close'), f.knob('closeZoom'))],
    ]);

    stage(
      f,
      'city',
      cam,
      () => {
        rooftop(ctx, 1);
      },
      false,
    );
    const shown = f.at('stripIn') * (1 - f.at('stripOut'));
    ctx.save();
    ctx.globalAlpha *= shown;
    ctx.fillStyle = P.cream;
    ctx.fillRect(75, 65, 730, 950);
    const top = 930 - f.at('roll') * ((CREDITS.length - 1) * 54 + 765);
    CREDITS.forEach((c, i) => {
      const y = top + i * 54;
      if (y < 130 || y > 955) return;
      const size = c.kind === 'name' ? 46 : c.kind === 'head' ? 29 : 25;
      write(
        ctx,
        c.text,
        440,
        y,
        {
          family: fonts.display,
          size,
          weight: c.kind === 'item' ? 400 : 600,
          color: P.ink,
          align: 'center',
        },
        f.hand(i),
        { boil: 0 },
      );
    });
    ctx.restore();
  },
});
