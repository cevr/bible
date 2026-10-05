// The browser tests' lab page over the probe film with a master
// (`narratedProbeFilm`): the same film and frames, its narration asked for at
// the film's URL, so a test can answer it, refuse it, or let a play be blocked.

import { Effect } from 'effect';
import { mountLab } from '../mount.tsx';
import { PROBE, narratedProbeFilm } from './probe-film.ts';

mountLab({ [PROBE]: () => Effect.runPromise(Effect.sync(narratedProbeFilm)) });
