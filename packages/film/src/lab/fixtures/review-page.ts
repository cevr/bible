// The browser tests' review page: the real entry (`mountReview`) over a
// registry holding the toy film's code (`toy-film.ts`), the film the review's
// fakes describe, so its Project draws its scenes' stills. The harness
// serves it and fakes the review's routes.

import { Effect } from 'effect';
import { mountReview } from '../review/mount.tsx';
import { TOY, toyFilm } from './toy-film.ts';

mountReview({ [TOY]: () => Effect.runPromise(Effect.sync(toyFilm)) });
