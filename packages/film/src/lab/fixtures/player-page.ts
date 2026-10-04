// The browser tests' player page: the real entry of a film's Scenes and Play
// pages (`mountPlay`) over a registry holding only the probe film. The
// harness serves it on the play and look-book places.

import { Effect } from 'effect';
import { mountPlay } from '../play-mount.tsx';
import { PROBE, probeFilm } from './probe-film.ts';

mountPlay({ [PROBE]: () => Effect.runPromise(Effect.sync(probeFilm)) });
