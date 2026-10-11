// `painterly`: an oil painting come to life, after the art direction of
// Dishonored (its look, none of its assets, people or places).
//
// What makes it this look:
// - Painted, not filled. Every form is a strong silhouette laid in with an
//   underpainting of broad flat patches, then brushed over with dabs on a
//   grid fixed to the world, each loaded with the paint the light asks for
//   from a five-paint ramp, a few broken with a cooler or warmer hue, so
//   colour breaks the way oil does (`brush.ts`). Dabs are measured on the
//   frame, not the canvas, so the brushwork is the same at every scale.
// - An oil pass over the whole frame (WebGL 2, `oil.ts`): a Kuwahara filter
//   (at half size) pushes the paint into flat strokes, a dark teal ink finds
//   the edges and thickens as the paint darkens, bristle streaks run along the
//   forms, the paint stands off a canvas weave with a little impasto, and the
//   one gold paint is laid as beaten gold leaf, kept sharp.
// - A stage of stylised people (`figures.ts`): heavy heads on long faces,
//   big noses and jaws, deep-set eyes, big hands that grip and strike, seen
//   in profile as a theatre shows them.
// - A grave old room (`room.ts`): muted teal, slate and ochre, cool daylight
//   from tall leaded windows falling in shafts through dusty air, warm lamps
//   on a high carved bench, and teal shadow between them.
// - Cut like film (`court.ts`): wide, the accused, the judge, the verdict,
//   each cut on its cue.
// - The verse on a worn printed page painted in the same hand, a stroke of
//   teal along the phrase that floods into the card (its front brushed out
//   past the flood's edge): cream letters in a book serif brushed onto deep
//   teal, "just" in gold leaf (`job.ts`).
//
// Its colour script holds the films' meanings: scarlet only in the stain on
// the accused's shirt, gold only for the verdict and the Word (the only
// leaf, the only sheen). The lamps are the room's practical light, warm
// ochre, never the gold paint.

import type { Look } from '../../look.ts';
import { court } from './court.ts';
import { card, job } from './job.ts';

export const painterly: Look = { court, job, card };
