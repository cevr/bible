// The browser's drawing of a film's stills for its Project (`stills.tsx`):
// the app's film's code loaded on demand, with the faces it draws in (its
// loader gives it once they have loaded, `narratedFilms`: a still drawn
// before them would draw a fallback face), and its scenes' middles drawn by
// the studio's one source of stills (`player/stills.ts`, the Scenes tape's
// own). The film's load runs on the stills' fiber, in the scope they are
// drawn in, so what it holds (its Rive rigs) goes when the Project that shows
// them does, and a Project left mid-load stops the load. Only the review's
// browser entry imports it (`mount.tsx`): the server's render reads no film's
// code and draws nothing (`filmCode`, `tools/lab-page.ts`).

import { Effect, Option } from 'effect';
import type { Films } from '../../../player/main.ts';
import { makeStills } from '../../../player/stills.ts';
import type { DrawStills } from './stills.tsx';

/** A still's width in canvas px: a laptop's card is about 210 css px, twice that on a sharp screen. */
const STILL_W = 384;

/**
 * The stills of the app's `films`, each drawn from its code, loaded into the
 * scope they are drawn in; a film not among them has none, and one whose
 * load fails (its code's import among it) has none either.
 */
export const drawStills =
  (films: Films): DrawStills =>
  (film, how) =>
    Option.map(Option.fromUndefinedOr(films[film]), (load) =>
      load.pipe(
        Effect.mapError(() => 'load-failed' as const),
        Effect.catchDefect(() => Effect.fail('load-failed' as const)),
        Effect.map((code) => {
          // With captions, as the preview draws by default: the Project has no captions toggle
          // (the Scenes tape's stills follow the player's).
          const stills = makeStills(code, { width: STILL_W, captions: true, ...how });
          return {
            ...stills,
            middles: new Map(code.placed.map((p) => [p.spec.id, p.start + p.dur / 2] as const)),
          };
        }),
      ),
    );
