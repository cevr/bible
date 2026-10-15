// The browser tests' lab page: the real entry (`mountLab`) over a registry
// holding the probe film, the long film (one scene longer than a phone's
// strip window), the tracked film (two cues on one track) and a talk
// (`labTalkFilm`, its footage left out). The harness serves it and fakes the
// lab API.

import { Effect } from 'effect';
import { mountLab } from '../mount.tsx';
import { LONG, longFilm } from './long-film.ts';
import { PROBE, probeFilm } from './probe-film.ts';
import { TALK, labTalkFilm } from './talk-film.ts';
import { TRACKED, trackedFilm } from './tracked-film.ts';

mountLab({
  [PROBE]: Effect.sync(probeFilm),
  [LONG]: Effect.sync(longFilm),
  [TRACKED]: Effect.sync(trackedFilm),
  [TALK]: labTalkFilm,
});
