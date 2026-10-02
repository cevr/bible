// The browser tests' player page: the real entry (`mountPlayer`) over a
// registry holding only the probe film. The harness serves it on the play
// and look-book places.

import { Effect } from 'effect';
import { mountPlayer } from '../../player/main.ts';
import { PROBE, probeFilm } from './probe-film.ts';

mountPlayer({ [PROBE]: () => Effect.runPromise(Effect.sync(probeFilm)) });
