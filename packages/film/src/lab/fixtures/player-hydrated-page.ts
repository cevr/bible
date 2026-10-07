// The browser tests' Scenes and Play page for a server render to hydrate:
// the player page's own entry (`player-page.ts`: the real `mountPlay` over
// the probe film), bundled with Solid's development build (`bundles.ts`), so
// a mismatch between the server's markup and the browser's components is
// said, as a warning the test reads. Its registry is an app's
// (`narratedFilms`), as the lab's page's is: the probe film given once its
// narration is read (none, here: estimates), with the face it draws in asked
// for (`PROBE_FACE`, which a test can hold back).

import { Effect } from 'effect';
import { pictureFaces } from '../../player/face.ts';
import { narratedFilms } from '../../player/narrated.ts';
import { mountPlay } from '../play-mount.tsx';
import { PROBE, PROBE_FACE, probeFilm } from './probe-film.ts';

mountPlay(
  narratedFilms(
    { [PROBE]: () => Effect.runPromise(Effect.succeed({ film: () => probeFilm() })) },
    pictureFaces([PROBE_FACE]),
  ),
);
