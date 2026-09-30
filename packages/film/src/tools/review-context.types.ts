// Compile-time checks for the long-lived servers, run by the package
// typecheck. The review runs for days and the lab for hours, and Bun keeps a
// module as it first imported it, so neither the review's handlers
// (`ReviewContext`, what `reviewHandler` runs them with), its choices
// (`ChoicesNeeds`, what `Choices.layer` is built on), nor the lab's handlers
// (`LabContext`, what `labHandler` runs them with) hold a service that
// imports a film module or the app's sound library, or mixes a film in
// process: a handler or a choice that reached for one would not compile, and
// reads the film through `FreshFilm` instead. Each line below fails the
// typecheck if a loader joins one of the lists.

import type { ChoicesNeeds } from './choices.ts';
import type { FilmRepo } from './film-repo.ts';
import type { LabContext } from './lab.ts';
import type { SoundLibrary } from './library.ts';
import type { Mixer } from './mixer.ts';
import type { ReviewContext } from './review-http.ts';

/** The services that import a film's modules or the app's `sounds/library.ts` in their own process. */
type Loader = FilmRepo | SoundLibrary | Mixer;

/** `true` when `Context` holds no loader; otherwise the loaders it holds. */
type LoadsNothing<Context> = [Extract<Context, Loader>] extends [never]
  ? true
  : Extract<Context, Loader>;

export const reviewLoadsNothing: LoadsNothing<ReviewContext> = true;

export const choicesLoadNothing: LoadsNothing<ChoicesNeeds> = true;

export const labLoadsNothing: LoadsNothing<LabContext> = true;
