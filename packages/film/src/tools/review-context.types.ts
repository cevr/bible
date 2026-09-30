// Compile-time checks for the review, run by the package typecheck. The
// review runs for days and Bun keeps a module as it first imported it, so
// neither its handlers (`ReviewContext`, what `reviewHandler` runs them
// with) nor its choices (`ChoicesNeeds`, what `Choices.layer` is built on)
// hold a service that imports a film module or the app's sound library: a
// handler or a choice that reached for one would not compile, and reads the
// film through `FreshFilm` instead. Each line below fails the typecheck if a
// loader joins either list.

import type { ChoicesNeeds } from './choices.ts';
import type { FilmRepo } from './film-repo.ts';
import type { SoundLibrary } from './library.ts';
import type { ReviewContext } from './review-http.ts';

/** The services that import a film's modules or the app's `sounds/library.ts`. */
type Loader = FilmRepo | SoundLibrary;

/** `true` when `Context` holds no loader; otherwise the loaders it holds. */
type LoadsNothing<Context> = [Extract<Context, Loader>] extends [never]
  ? true
  : Extract<Context, Loader>;

export const reviewLoadsNothing: LoadsNothing<ReviewContext> = true;

export const choicesLoadNothing: LoadsNothing<ChoicesNeeds> = true;
