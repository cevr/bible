// The browser tests' studio page: the real entry of a film's studio
// (`mountFilmStudio`) over a registry holding the probe film, the crowd
// film (many short scenes) and a talk (its footage the test's to serve or
// refuse). The harness serves it on the studio's place.

import { Effect } from 'effect';
import { mountFilmStudio } from '../film-studio/mount.tsx';
import { CROWD, crowdFilm } from './crowd-film.ts';
import { PROBE, probeFilm } from './probe-film.ts';
import { TALK, talkFilm } from './talk-film.ts';

mountFilmStudio({
  [PROBE]: Effect.sync(probeFilm),
  [CROWD]: Effect.sync(crowdFilm),
  [TALK]: talkFilm,
});
