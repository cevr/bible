// The browser tests' Scenes and Play page for a server render to hydrate:
// the player page's own entry (`player-page.ts`: the real `mountPlay` over
// the probe film), bundled with Solid's development build (`bundles.ts`), so
// a mismatch between the server's markup and the browser's components is
// said, as a warning the test reads.

import { Effect } from 'effect';
import { mountPlay } from '../play-mount.tsx';
import { PROBE, probeFilm } from './probe-film.ts';

mountPlay({ [PROBE]: () => Effect.runPromise(Effect.sync(probeFilm)) });
