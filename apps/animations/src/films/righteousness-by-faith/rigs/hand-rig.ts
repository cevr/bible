// The circle hand as a Rive rig: one plain circle of paper (the generator's
// `hand`), no thumb, no fingers, an artboard of its own so the host draws it
// where it works, over scenery its figure stands behind (the dock's rail,
// the table, the bench) or over the figure itself. One artboard a paper: the
// lead's lilac grey, and the house look's peach skin.

import { type Figure, artboard, boilTimeline, el, hand } from '@bible/film/style/rig';
import { type Paper, looked } from './papers.ts';

/** The artboard: the hand's centre at its centre, room round it for its outline. */
export const HAND_ART = { width: 64, height: 64, r: 19 } as const;

/**
 * How far past the house hand Christ's held-out hand grows as He reaches to
 * us (court onYou): its circle as court.you draws it against His face.
 */
export const HAND_OUT = 1.62;

/**
 * The held-out hand's artboards, each `size` times the house hand in the
 * house line: four steps to `HAND_OUT`, each about 1.13 times the last, so the
 * step nearest a reach, scaled the rest of the way, draws the house line
 * within 7 %.
 */
export const HAND_OUT_STEPS = [
  HAND_OUT ** 0.25,
  HAND_OUT ** 0.5,
  HAND_OUT ** 0.75,
  HAND_OUT,
] as const;

/**
 * A hand in `paper`: its circle at the artboard's centre, its cast left to
 * the host; `size` times the house hand's circle with the house line, so a
 * hand held out big keeps its figure's ink.
 */
export const handRig = (fig: Figure, paper: Paper, size = 1) =>
  artboard(
    fig,
    { width: HAND_ART.width * size, height: HAND_ART.height * size },
    [
      el(
        'Node',
        { x: (HAND_ART.width * size) / 2, y: (HAND_ART.height * size) / 2, name: 'hand' },
        [hand(fig, 'palm', HAND_ART.r * size, looked(paper, { ground: 'host' }))],
      ),
    ],
    [boilTimeline(fig)],
  );
