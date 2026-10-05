// The browser's drawing of a film's stills for its Project (`stills.tsx`):
// the app's film's code loaded on demand, the page's faces first, and its
// scenes' middles drawn by the studio's one source of stills
// (`player/stills.ts`, the Scenes tape's own). Only the review's browser
// entry imports it (`mount.tsx`): the server's render reads no film's code
// and draws nothing (`filmCode`, `tools/lab-page.ts`).

import { Effect, Option } from 'effect';
import type { Films } from '../../../player/main.ts';
import { makeStills } from '../../../player/stills.ts';
import type { DrawStills } from './stills.tsx';

/** A still's width in canvas px: a laptop's card is about 210 css px, twice that on a sharp screen. */
const STILL_W = 384;

/**
 * The faces the page's fonts declare, loaded: a still drawn before them would
 * draw a fallback face. Read as it runs (as the player's `loadFonts` is), so
 * importing the module reads no `document`.
 */
const loadFonts = () =>
  Effect.forEach(Array.from(document.fonts), (face) => Effect.promise(() => face.load()), {
    concurrency: 8,
    discard: true,
  });

/** The stills of the app's `films`, each drawn from its code; a film not among them has none. */
export const drawStills =
  (films: Films): DrawStills =>
  (film, how) =>
    Option.map(Option.fromUndefinedOr(films[film]), (load) =>
      Effect.andThen(
        loadFonts(),
        Effect.mapError(Effect.tryPromise(load), () => 'load-failed' as const),
      ).pipe(
        Effect.map((code) => {
          const stills = makeStills(code, { width: STILL_W, captions: true, ...how });
          return {
            at: stills.at,
            want: stills.want,
            onDrawn: stills.onDrawn,
            stop: stills.stop,
            middles: new Map(code.placed.map((p) => [p.spec.id, p.start + p.dur / 2] as const)),
          };
        }),
      ),
    );
