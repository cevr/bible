// The review's films and a film's project as the review page calls them,
// through the page's one client of the lab's API (`LabClient`; `ChoicesGroup`
// and `ProjectGroup` in `core/api.ts`): the app's films, and a film's project
// (its scenes by the address tree, each with its render's video), read fresh.

import { Context, Effect, Layer } from 'effect';
import type { ProjectView } from '../../../core/api.ts';
import type { ReviewFilms } from '../../../core/review.ts';
import { LabClient, type LabFailure, called } from '../../api.ts';

interface OptionsCalls {
  /** The app's films. */
  readonly films: Effect.Effect<ReviewFilms, LabFailure>;
  /** The film's project (its `main` variant's), read fresh. */
  readonly project: (film: string) => Effect.Effect<ProjectView, LabFailure>;
}

export class OptionsApi extends Context.Service<OptionsApi, OptionsCalls>()(
  '@bible/film/lab/OptionsApi',
) {}

/** The films and project routes, over the page's one client. */
const makeOptionsApi = Effect.fn('lab.options.api')(function* () {
  const client = yield* LabClient;
  const api: OptionsCalls = {
    films: called(client.choices.films()),
    project: (film) => called(client.project.get({ params: { film }, query: {} })),
  };
  return api;
});

/** The films and project routes, over the page's one client (given at its root). */
export const optionsApiLayer: Layer.Layer<OptionsApi, never, LabClient> = Layer.effect(
  OptionsApi,
  makeOptionsApi(),
);
