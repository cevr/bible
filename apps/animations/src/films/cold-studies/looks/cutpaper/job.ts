// The control's verse and card: Job 9:2 on a torn cream page laid on the
// parchment, the phrase highlighted in the card's own ink so the flood is
// the highlight grown; the card is the film's own (`righteousness-by-faith/
// card.ts`: flush left, cream on near-black, cased as said), "just" in the
// colour script's gold for the Word, underlined.

import { type Box, type CardWord, at, fullCard, rounded, verse, write } from '@bible/film/canvas';
import { lerp } from '@bible/film/core';
import { CARD_STYLE, VERSE_STYLE } from '../../../righteousness-by-faith/card.ts';
import { C, F, piece } from '../../../righteousness-by-faith/kit.ts';
import { VERSE } from '../../look.ts';
import type { JobFrame } from '../../scenes/job.ts';

/** The page: where it sits, centred, and its size. */
const PAGE = { x: 960, y: 540, w: 1400, h: 520 } as const;

export const job = (f: JobFrame): Box => {
  const { ctx } = f;
  const settle = f.at('page');
  let box: Box = { x: 0, y: 0, w: 0, h: 0 };
  at(ctx, { x: 0, y: lerp(40, 0, settle) }, () => {
    piece(ctx, rounded(PAGE.x, PAGE.y, PAGE.w, PAGE.h, 10), C.cream, f.hand('page'), {
      role: 'scenery',
      kind: 'cut',
      torn: 3,
      shadow: 0.35,
    });
    const left = PAGE.x - PAGE.w / 2 + 110;
    write(
      ctx,
      VERSE.ref,
      left,
      PAGE.y - 150,
      { family: F.body, size: 34, weight: 600, color: C.inkSoft, tracking: 0.08 },
      f.hand('ref'),
      { boil: 0 },
    );
    box = verse(
      ctx,
      VERSE,
      VERSE_STYLE,
      { x: left, y: PAGE.y - 40, highlight: f.at('sweep') },
      f.hand('verse'),
    );
  });
  return box;
};

export const card = (f: JobFrame, words: ReadonlyArray<CardWord>) => fullCard(f, words, CARD_STYLE);
