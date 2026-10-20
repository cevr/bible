// How the film sets a full-screen card and a verse on its page (CRAFT rule
// 1): cream on the night ground, flush left, cased as said, the payoff in the
// colour script's gold for the word, underlined; the verse on a cream page,
// its phrase highlighted in the card's own ground. The film declares them
// (`film.ts`), so the storyboard sets its card and verse panels in them.

import type { CardStyle, VerseStyle } from '@bible/film/canvas';
import { fonts, palette } from './palette.ts';

/** The card's ground: the highlight's colour too. */
export const CARD_GROUND = palette.night;

export const VERSE_STYLE: VerseStyle = {
  type: { family: fonts.display, size: 64, weight: 500, color: palette.ink, leading: 1.45 },
  width: 1180,
  highlight: CARD_GROUND,
  lit: palette.cream,
};

export const CARD_STYLE: CardStyle = {
  ground: CARD_GROUND,
  type: { family: fonts.display, size: 96, weight: 500, color: palette.cream, leading: 1.2 },
  payoffScale: 2.6,
  payoffColor: palette.gold,
  payoffType: { weight: 700 },
  // As said: "LORD" and "Christ" keep their capitals.
  case: 'said',
  treatment: {
    draw: (ctx, box) => {
      ctx.fillStyle = palette.gold;
      ctx.fillRect(box.x, box.y + box.h * 0.9, box.w, box.h * 0.035);
    },
  },
};
