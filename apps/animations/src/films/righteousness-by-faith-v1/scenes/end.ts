import { ease, progress } from '@bible/film/core';
import { write } from '@bible/film/canvas';
import { C, F, hand, sun } from '../kit.ts';
import type { Drawing } from './index.ts';

const SOURCES = [
  'E. J. Waggoner — Christ and His Righteousness; The Glad Tidings',
  'A. T. Jones — Lessons on Faith',
  'Ellen G. White — Steps to Christ; The Desire of Ages;',
  "Christ's Object Lessons; Testimonies to Ministers",
  'Scripture: King James Version',
];

/** End card: the title again, and where the words came from. */
export const end: Drawing = {
  enter: { kind: 'ink', dur: 1, color: C.gold },
  min: 7,
  draw: (f) => {
    const { ctx, t } = f;
    sun(ctx, 960, 190, 60, progress(t, 0.4, 1.4, ease.outCubic), f.hand('sun'), t * 0.05);
    write(
      ctx,
      'Righteousness by Faith',
      960,
      420,
      { family: F.display, size: 112, weight: 700, color: C.ink, align: 'center' },
      f.hand('title'),
      {
        progress: progress(t, 0.6, 1.1, ease.linear),
        reveal: 'pop',
      },
    );
    write(ctx, 'sources', 960, 530, { ...hand(46, C.orange), align: 'center' }, f.hand('label'), {
      progress: progress(t, 1.6, 0.6, ease.linear),
      reveal: 'write',
    });
    SOURCES.forEach((line, i) =>
      write(
        ctx,
        line,
        960,
        610 + i * 58,
        {
          family: F.display,
          size: 38,
          weight: 400,
          italic: true,
          color: C.inkSoft,
          align: 'center',
        },
        f.hand(`s${i}`),
        {
          progress: progress(t, 2 + i * 0.35, 0.8, ease.outCubic),
          reveal: 'rise',
          boil: 0.3,
        },
      ),
    );
  },
};
