// The browser tests' player page: the real entry of a film's Scenes and Play
// pages (`mountPlay`) over a registry holding the probe film and the crowd
// film (many short scenes, for the tape bar on a phone). The harness serves
// it on the play and Scenes places.

import { Effect } from 'effect';
import { mountPlay } from '../play-mount.tsx';
import { CROWD, crowdFilm } from './crowd-film.ts';
import { PROBE, probeFilm } from './probe-film.ts';

mountPlay({
  [PROBE]: () => Effect.runPromise(Effect.sync(probeFilm)),
  [CROWD]: () => Effect.runPromise(Effect.sync(crowdFilm)),
});
