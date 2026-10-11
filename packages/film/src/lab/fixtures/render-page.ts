// The browser tests' render page: the real entry of a film's export page
// (`mountRender`, the app's `index.html`) over a registry holding the probe
// film and the crowd film, so the film it stages is the one its path names,
// never the registry's first. The harness serves it on the export place.

import { Effect } from 'effect';
import { mountRender } from '../../player/render.ts';
import { CROWD, crowdFilm } from './crowd-film.ts';
import { PROBE, probeFilm } from './probe-film.ts';

mountRender({
  [PROBE]: () => Effect.runPromise(Effect.sync(probeFilm)),
  [CROWD]: () => Effect.runPromise(Effect.sync(crowdFilm)),
});
