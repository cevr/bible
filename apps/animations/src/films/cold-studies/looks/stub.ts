// A look not drawn yet: its name over a flat ground in each scene, the verse
// set plainly with its highlight, and the engine's card in a plain face, so
// the switch, the flood and the card work for every level before the look
// does. A look's folder drops it once it draws its own.

import { type Hex, type TextStyle, fullCard, verse, write } from '@bible/film/canvas';
import { fonts } from '../palette.ts';
import { type Look, VERSE } from '../look.ts';
import type { CourtFrame } from '../scenes/court.ts';
import type { JobFrame } from '../scenes/job.ts';

/** A stub's colours: its ground, its ink and the payoff's. */
interface StubColors {
  readonly ground: Hex;
  readonly ink: Hex;
  readonly accent: Hex;
}

const label = (size: number, color: Hex): TextStyle => ({
  family: fonts.body,
  size,
  weight: 700,
  color,
  align: 'center',
  tracking: 0.12,
});

/** The ground over the whole frame, and the look's name over it with `what` beneath. */
const named = (f: CourtFrame | JobFrame, name: string, what: string, c: StubColors, y: number) => {
  const { ctx, w, h } = f;
  ctx.fillStyle = c.ground;
  ctx.fillRect(0, 0, w, h);
  write(ctx, name.toUpperCase(), w / 2, y, label(120, c.ink), f.hand('name'), { boil: 0 });
  write(ctx, what, w / 2, y + 70, label(32, c.accent), f.hand('what'), { boil: 0 });
};

export const stub = (name: string, c: StubColors): Look => ({
  court: (f) => named(f, name, 'court · not drawn yet', c, f.h / 2),
  job: (f) => {
    named(f, name, 'job · not drawn yet', c, 220);
    return verse(
      f.ctx,
      VERSE,
      {
        type: { family: fonts.display, size: 60, color: c.ink },
        width: 1300,
        highlight: c.accent,
        lit: c.ground,
      },
      { x: 310, y: 560, highlight: f.at('sweep') },
      f.hand('verse'),
    );
  },
  card: (f, words) => {
    fullCard(f, words, {
      ground: c.accent,
      type: { family: fonts.body, size: 88, weight: 600, color: c.ground },
      payoffScale: 2.5,
      payoffColor: c.ink,
    });
    write(
      f.ctx,
      name.toUpperCase(),
      f.w - 60,
      80,
      { ...label(28, c.ground), align: 'right' },
      f.hand('tag'),
      {
        boil: 0,
      },
    );
  },
});
