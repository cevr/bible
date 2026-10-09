// The browser tests' render page: the real entry of `film render`
// (`mountRender`) over a registry holding the probe film and the footage
// film. The render harness (`render-harness.ts`) serves it and drives its
// export handle.

import { Effect } from 'effect';
import { mountRender } from '../../player/render.ts';
import { FOOTAGE, footageFilm } from './footage-film.ts';
import { PROBE, probeFilm } from './probe-film.ts';

mountRender({
  [PROBE]: () => Effect.runPromise(Effect.sync(probeFilm)),
  [FOOTAGE]: () => Effect.runPromise(Effect.sync(footageFilm)),
});
