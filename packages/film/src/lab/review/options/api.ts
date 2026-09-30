// A film's options as the review page calls them, through the client
// derived from the review API (`OptionsGroup` and `StepsGroup` in
// `core/api.ts`): the films, a film's choices, a pick, and the film's undo,
// redo and check. Each write answers the change it made and the film's check
// after it.

import { Context, Data, Effect, Layer, Match } from 'effect';
import { FetchHttpClient } from 'effect/http';
import { HttpApiClient } from 'effect/http-api';
import { ReviewHttpApi } from '../../../core/api.ts';
import type {
  CheckLine,
  CheckReport,
  ChoiceWrite,
  FilmChoices,
  LabWrite,
  ReviewFilms,
  TakeAct,
} from '../../../core/schema.ts';
import { type LabFailure, heard } from '../../api.ts';

/** What a page asks of a film's source: a score option played, a take acted on, a step back or on. */
export type ChoiceAct = Data.TaggedEnum<{
  Pick: { readonly option: string };
  Take: { readonly sound: string; readonly take: string; readonly act: TakeAct };
  Undo: {};
  Redo: {};
}>;
export const ChoiceAct = Data.taggedEnum<ChoiceAct>();

/** What a write did, as the page says it: its target (`score play warm`, `undo …`) and the check after. */
export interface Wrote {
  readonly target: string;
  readonly file: string;
  readonly findings: ReadonlyArray<CheckLine>;
}

export interface OptionsCalls {
  /** The app's films. */
  readonly films: Effect.Effect<ReviewFilms, LabFailure>;
  /** A film's choices as they stand. */
  readonly options: (film: string) => Effect.Effect<FilmChoices, LabFailure>;
  /** The film's check, its latest change, and what Undo and Redo would do. */
  readonly check: (film: string) => Effect.Effect<CheckReport, LabFailure>;
  /** Write `act` into the film's source. */
  readonly write: (film: string, act: ChoiceAct) => Effect.Effect<Wrote, LabFailure>;
}

export class OptionsApi extends Context.Service<OptionsApi, OptionsCalls>()(
  '@bible/film/lab/OptionsApi',
) {}

/** A film's option routes on `origin`. */
export const makeOptionsApi = Effect.fn('lab.options.api')(function* (origin: string) {
  const client = yield* HttpApiClient.make(ReviewHttpApi, { baseUrl: origin });
  const wrote = (w: ChoiceWrite | LabWrite): Wrote => ({
    target: w.target,
    file: w.file,
    findings: w.findings,
  });
  const api: OptionsCalls = {
    films: heard(client.options.films()),
    options: (film) => heard(client.options.list({ params: { film } })),
    check: (film) => heard(client.steps.check({ params: { film } })),
    write: (film, act) =>
      heard(
        Match.value(act).pipe(
          Match.tagsExhaustive({
            Pick: (p) =>
              client.options.pickScore({ params: { film }, payload: { option: p.option } }),
            Take: (t) =>
              client.options.curate({
                params: { film, sound: t.sound },
                payload: { take: t.take, act: t.act },
              }),
            Undo: () => client.steps.undo({ params: { film }, payload: {} }),
            Redo: () => client.steps.redo({ params: { film }, payload: {} }),
          }),
          Effect.map(wrote),
        ),
      ),
  };
  return api;
});

/** The option routes on the page's own origin, over `fetch`. */
export const optionsApiLayer = (origin: string): Layer.Layer<OptionsApi> =>
  Layer.effect(OptionsApi, makeOptionsApi(origin)).pipe(Layer.provide(FetchHttpClient.layer));
