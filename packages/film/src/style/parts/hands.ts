// A figure's hands: a circle of one paper, the share of its head's width its
// concept draws, and nothing else: no thumb, no fingers, ever (K1, owner
// 2026-10-12). A field a hand lacks is refused by CircleHands, which nothing
// frees. The host draws each where it works, from the hand's own artboard
// (`drawHand`): a hand at the end of an arm, at its sleeve's cuff (`arm.ts`;
// the owner's sleeves, look ledger, 2026-10-18). Pure.

import { Schema } from 'effect';
import { decoder } from '../decode.ts';
import { Paper } from '../paper.ts';
import { Share } from './measure.ts';

const HandsPart = Schema.TaggedStruct('Hands', {
  paper: Paper,
  /**
   * Its circle's width against the head's, as the concept draws it. The
   * house draws nothing from it: the host sizes each hand by a scale of its
   * own, worked out from this share by hand (RBF's `court-cast.ts` `HAND`).
   */
  share: Share,
});
export type Hands = typeof HandsPart.Type;

/** Hands, checked: a circle of a paper and a share, refused otherwise by CircleHands. */
export const decodeHands = decoder(HandsPart, { any: 'CircleHands' });

/** A figure's two circle hands. */
export const Hands = (o: Omit<Hands, '_tag'>): Hands =>
  decodeHands({ _tag: 'Hands', ...o }, 'Hands');
