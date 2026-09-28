// The end card on parchment: the film's name, and the sources it quotes, by
// author, as one block of type. It holds still: the film has stopped
// breathing by its last card.

import { block, drawing, write } from '@bible/film/canvas';
import { C, F } from '../kit.ts';

const SOURCES = [
  'Scripture: King James Version.',
  'Ellen G. White: Letter 57, 1895 (Testimonies to Ministers); Manuscript 24, 1888; Letter 85, 1891; Christ’s Object Lessons; The Desire of Ages; Faith and Works; Testimonies for the Church, vol. 5.',
  'E. J. Waggoner: Christ and His Righteousness; The Glad Tidings; General Conference Daily Bulletin, March 8, 1897.',
  'A. T. Jones: Lessons on Faith; The Consecrated Way to Christian Perfection.',
  'Fundamental Principles of the Seventh-day Adventists (1889).',
].join('   ');

export const end = drawing({
  drift: 0,
  timeline: {
    show: { scene: 'start', dur: 0.5 },
  },
  draw: (f) => {
    const { ctx } = f;
    const show = f.at('show');
    write(
      ctx,
      'Righteousness by Faith',
      960,
      330,
      { family: F.display, size: 104, weight: 700, color: C.ink, align: 'center' },
      f.hand('name'),
      { alpha: show, boil: 0.3 },
    );
    block(
      ctx,
      SOURCES,
      960,
      470,
      1400,
      { family: F.body, size: 30, color: C.inkSoft, align: 'center', leading: 1.45 },
      f.hand('sources'),
      { alpha: show, boil: 0 },
    );
  },
});
