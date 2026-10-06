// The browser tests' lab page: the real entry (`mountLab`) over a registry
// holding the probe film and the long film (one scene longer than a phone's
// strip window). The harness serves it and fakes the lab API.

import { Effect } from 'effect';
import { mountLab } from '../mount.tsx';
import { LONG, longFilm } from './long-film.ts';
import { PROBE, probeFilm } from './probe-film.ts';

mountLab({
  [PROBE]: () => Effect.runPromise(Effect.sync(probeFilm)),
  [LONG]: () => Effect.runPromise(Effect.sync(longFilm)),
});
