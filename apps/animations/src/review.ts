// The review page's entry (`/`, served by `film lab`): the renders of every checkout
// compared in sync, read where they lie, over this app's films (each loaded
// only when a film's Project draws its scenes' stills).

import { mountReview } from '@bible/film/review';
import { films } from './films/index.ts';

mountReview(films);
