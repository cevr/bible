// The courtroom, to the verdict: "Imagine standing in a courtroom. The
// evidence is overwhelming. You did it. And the judge looks at you and says,
// righteous." The cues are Righteousness by Faith's `cold` cues on the same
// marks; the look in play draws the frame (`look.ts`).

import { drawing } from '@bible/film/canvas';
import { lookOf } from '../looks/index.ts';

export const court = drawing({
  timeline: {
    drop: { mark: 'evidence', dur: 1.4, ease: 'inCubic', stagger: 0.857 },
    bow: { mark: 'did', dur: 0.35 },
    // The judge leans in, his hand going to the gavel.
    lean: { mark: 'judge', dur: 0.4 },
    gavel: { mark: 'righteous', offset: -0.37, dur: 0.59 },
    stamp: { mark: 'righteous', offset: -0.03, dur: 0.2, ease: 'outBack' },
    lift: { mark: 'righteous', offset: 0.1, dur: 0.37 },
  },
  // Its type said, not inferred: a look's frame type is read off this draw (`CourtFrame`).
  draw: (f): void => lookOf().court(f),
  light: () => lookOf().light ?? { color: '#ffffff', amount: 0 },
});

/** What a look draws the court with. */
export type CourtFrame = Parameters<typeof court.draw>[0];
