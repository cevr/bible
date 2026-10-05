// The browser tests' lab page for a server render to hydrate: the lab
// page's own entry (`lab-page.ts`: the real `mountLab` over the probe film),
// bundled with Solid's development build (`bundles.ts`), so a mismatch
// between the server's markup and the browser's components is said, as a
// warning the test reads. Its registry is an app's (`narratedFilms`): the
// probe film given once its narration is read (none, here: estimates), with
// the face it draws in asked for (`PROBE_FACE`, which a test can hold back).

import { Effect } from 'effect';
import { pictureFaces } from '../../player/face.ts';
import { narratedFilms } from '../../player/narrated.ts';
import { mountLab } from '../mount.tsx';
import { PROBE, PROBE_FACE, probeFilm } from './probe-film.ts';

mountLab(
  narratedFilms(
    { [PROBE]: () => Effect.runPromise(Effect.succeed({ film: () => probeFilm() })) },
    pictureFaces([PROBE_FACE]),
  ),
);
