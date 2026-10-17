// The circle hand as a Rive rig: one plain circle of paper (the generator's
// `hand`), no thumb, no fingers, an artboard of its own so the host draws it
// where it works, over scenery its figure stands behind (the dock's rail,
// the table, the bench) or over the figure itself. One artboard a paper: the
// lead's lilac grey, and the house look's peach skin.

import { type Figure, artboard, boilTimeline, el, hand } from '@bible/film/style/rig';
import { type Paper, looked } from './papers.ts';

/** The artboard: the hand's centre at its centre, room round it for its outline. */
export const HAND_ART = { width: 64, height: 64, r: 19 } as const;

/** A hand in `paper`: its circle at the artboard's centre, its cast left to the host. */
export const handRig = (fig: Figure, paper: Paper) =>
  artboard(
    fig,
    HAND_ART,
    [
      el('Node', { x: HAND_ART.width / 2, y: HAND_ART.height / 2, name: 'hand' }, [
        hand(fig, 'palm', HAND_ART.r, looked(paper, { ground: 'host' })),
      ]),
    ],
    [boilTimeline(fig)],
  );
