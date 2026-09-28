// The browser tests' lab page: the real entry (`mountLab`) over a registry
// holding only the probe film. The harness serves it and fakes the lab API.

import { Effect } from 'effect';
import { mountLab } from '../mount.tsx';
import { PROBE, probeFilm } from './probe-film.ts';

mountLab({ [PROBE]: () => Effect.runPromise(Effect.sync(probeFilm)) });
