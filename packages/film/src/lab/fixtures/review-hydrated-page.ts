// The browser tests' review page for a server render to hydrate: the review
// page's own entry (`review-page.ts`: the real `mountReview` over the toy
// film), bundled with Solid's development build (`bundles.ts`), so a
// mismatch between the server's markup and the browser's components is
// said, as a warning the test reads.

import { Effect } from 'effect';
import { mountReview } from '../review/mount.tsx';
import { TOY, toyFilm } from './toy-film.ts';

mountReview({ [TOY]: () => Effect.runPromise(Effect.sync(toyFilm)) });
