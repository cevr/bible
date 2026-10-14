// How the film sets a full-screen card and a verse on its page (CRAFT rule
// 1): cream on the night ground, flush left, cased as said, the payoff in the
// colour script's gold for the Word, underlined; the verse on a cream page,
// its phrase highlighted in the card's own ground, so a flood is the
// highlight grown. The film declares them (`film.ts`), so the storyboard sets
// its card and verse panels in them; the cold-studies control look sets its
// card in the same.

import type { CardStyle, VerseStyle } from '@bible/film/canvas';
import { C, F } from './kit.ts';

/** The card's ground: the highlight's colour too. */
export const CARD_GROUND = C.night;

export const VERSE_STYLE: VerseStyle = {
  type: { family: F.display, size: 64, weight: 500, color: C.ink, leading: 1.45 },
  width: 1180,
  highlight: CARD_GROUND,
  lit: C.cream,
};

export const CARD_STYLE: CardStyle = {
  ground: CARD_GROUND,
  type: { family: F.display, size: 96, weight: 500, color: C.cream, leading: 1.2 },
  payoffScale: 2.6,
  payoffColor: C.gold,
  payoffType: { weight: 700 },
  // As said, not the reference's lower case: "God" keeps its capital.
  case: 'said',
  treatment: {
    draw: (ctx, box) => {
      ctx.fillStyle = C.gold;
      ctx.fillRect(box.x, box.y + box.h * 0.9, box.w, box.h * 0.035);
    },
  },
};
