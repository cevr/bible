// The browser tests' lab page for a server render to hydrate: the lab
// page's own entry (`lab-page.ts`: the real `mountLab` over the probe film),
// bundled with Solid's development build (`bundles.ts`), so a mismatch
// between the server's markup and the browser's components is said, as a
// warning the test reads.

import { Effect } from 'effect';
import { mountLab } from '../mount.tsx';
import { PROBE, probeFilm } from './probe-film.ts';

mountLab({ [PROBE]: () => Effect.runPromise(Effect.sync(probeFilm)) });
