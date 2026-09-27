import { ease, progress } from '@bible/film/core';
import { write } from '@bible/film/canvas';
import { C, F, hand, sun } from '../kit.ts';
import type { Drawing } from './index.ts';

export const title: Drawing = {
  enter: { kind: 'ink', dur: 0.9 },
  min: 4.6,
  draw: (f) => {
    const { ctx, t } = f;
    sun(ctx, 960, 330, 92, progress(t, 0.3, 1.6, ease.outCubic), f.hand('sun'), t * 0.05);
    write(
      ctx,
      'Righteousness by Faith',
      960,
      640,
      { family: F.display, size: 136, weight: 700, color: C.ink, align: 'center' },
      f.hand('title'),
      {
        progress: progress(t, 0.7, 1.3, ease.linear),
        reveal: 'pop',
      },
    );
    write(
      ctx,
      'A. T. Jones · E. J. Waggoner · Ellen G. White',
      960,
      730,
      { ...hand(48, C.orange), align: 'center' },
      f.hand('sub'),
      {
        progress: progress(t, 1.9, 1.2, ease.linear),
        reveal: 'write',
      },
    );
  },
};
