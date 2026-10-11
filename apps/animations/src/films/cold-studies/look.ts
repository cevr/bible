// What a look is: the whole of the moment drawn in one art direction. The
// study's two scenes own the timing (their cues, pinned to the take's marks,
// in `scenes/`); a look owns every pixel inside them: the courtroom and its
// people, Job's verse on its page, and the full-screen card's typography.
// Each look lives in `looks/<name>/` and is one line of `looks/index.ts`.
//
// A look draws a frame as a pure function of the frame's time: everything it
// shows at `f.t` is set from `f.t` and the cues (`f.at`, `f.keys`,
// `f.stagger`), never from the frame before. A look drawn in 3D keeps its
// renderer and its scene objects between frames but sets every transform,
// material value and camera from `f` before it renders, then composites the
// WebGL canvas into `f.ctx` with `drawImage` (`glCanvas`, `looks/ps1/`).

import type { Box, CardWord, Light, Verse } from '@bible/film/canvas';
import type { CourtFrame } from './scenes/court.ts';
import type { JobFrame } from './scenes/job.ts';

export interface Look {
  /**
   * The `court` scene, the whole frame (`f.w` × `f.h`, 1920 × 1080 units):
   * "Imagine standing in a courtroom. The evidence is overwhelming. You did
   * it. And the judge looks at you and says, righteous." Its cues: `drop`
   * (the evidence falling, staggered), `bow` (head down on "You did it"),
   * `lean` (the judge leans in), `gavel`, `stamp` (the verdict) and `lift`
   * (the head comes up at the verdict).
   */
  readonly court: (f: CourtFrame) => void;
  /**
   * The `job` scene: Job 9:2 on its page (`VERSE`), the phrase highlighted
   * `f.at('sweep')` of the way, the page in from `f.at('page')`. Returns the
   * box the card floods out from over `flood`, in the canvas's own pixels:
   * the engine's `verse` returns its highlight's last line so, through every
   * transform it was drawn under.
   */
  readonly job: (f: JobFrame) => Box;
  /**
   * The full-screen card over its cue, on the bare frame: "How should man be
   * just with God?", each word from `word.at` (scene seconds), "just" the
   * payoff. The engine's `fullCard` sets them in a `CardStyle`, or the look
   * sets them its own way.
   */
  readonly card: (f: JobFrame, words: ReadonlyArray<CardWord>) => void;
  /** The light over both scenes (the act light, CRAFT rule 11); none leaves the film's vignette alone. */
  readonly light?: Light;
}

/** A verse on its page, and where it is from. */
interface CitedVerse extends Verse {
  readonly ref: string;
}

/** Job 9:2, KJV, verbatim (`bible verse "Job 9:2"`, its supplied word unbracketed), and the phrase the card lifts. */
export const VERSE: CitedVerse = {
  ref: 'Job 9:2',
  text: 'I know it is so of a truth: but how should man be just with God?',
  phrase: 'how should man be just with God?',
};
