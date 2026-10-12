// The browser tests' render page: the real entry of a film's export page
// (`mountRender`, the app's `index.html`) over a registry holding the probe
// film, the crowd film, the footage film and a talk, so the film it stages is
// the one its path names, never the registry's first. The harness serves it
// on the export place; the render harness (`render-harness.ts`) serves it
// with a footage film's or a talk's files.

import { Effect } from 'effect';
import { mountRender } from '../../player/render.ts';
import { CROWD, crowdFilm } from './crowd-film.ts';
import { FOOTAGE, footageFilm } from './footage-film.ts';
import { PROBE, probeFilm } from './probe-film.ts';
import { TALK, talkFilm } from './talk-film.ts';

mountRender({
  [PROBE]: () => Effect.runPromise(Effect.sync(probeFilm)),
  [CROWD]: () => Effect.runPromise(Effect.sync(crowdFilm)),
  [FOOTAGE]: () => Effect.runPromise(Effect.sync(footageFilm)),
  [TALK]: talkFilm,
});
