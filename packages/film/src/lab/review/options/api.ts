// A film's options as the review page calls them (`choices-http.ts`), through
// the lab's client: the films, a film's choices, a pick, and the film's undo,
// redo and check (the lab's own routes, `makeLabApi`). Each write answers the
// change it made and the film's check after it.

import { Context, Data, Effect, Layer, Match, Schema } from 'effect';
import { FetchHttpClient } from 'effect/http';
import {
  type CheckLine,
  CheckReport,
  ChoiceWrite,
  FilmChoices,
  LabWrite,
  ReviewFilms,
  ScorePick,
  type TakeAct,
  TakeCuration,
  labBase,
  optionsUrl,
} from '../../../core/schema.ts';
import { type LabFailure, labClient } from '../../api.ts';

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

const NoBody = Schema.Struct({});

/** A path segment, encoded. */
const seg = (part: string) => encodeURIComponent(part);

/** A film's option routes on `origin`. */
export const makeOptionsApi = Effect.fn('lab.options.api')(function* (origin: string) {
  const { get, post } = yield* labClient(origin, '');
  const wrote = (w: ChoiceWrite | LabWrite): Wrote => ({
    target: w.target,
    file: w.file,
    findings: w.findings,
  });
  const api: OptionsCalls = {
    films: get('/review/films', ReviewFilms),
    options: (film) => get(optionsUrl(film), FilmChoices),
    check: (film) => get(`${labBase(film)}/check`, CheckReport),
    write: (film, act) =>
      Match.value(act).pipe(
        Match.tagsExhaustive({
          Pick: (p) =>
            post(`${optionsUrl(film)}/score/pick`, ScorePick, { option: p.option }, ChoiceWrite),
          Take: (t) =>
            post(
              `${optionsUrl(film)}/effect/${seg(t.sound)}/takes`,
              TakeCuration,
              { take: t.take, act: t.act },
              ChoiceWrite,
            ),
          Undo: () => post(`${labBase(film)}/undo`, NoBody, {}, LabWrite),
          Redo: () => post(`${labBase(film)}/redo`, NoBody, {}, LabWrite),
        }),
        Effect.map(wrote),
      ),
  };
  return api;
});

/** The option routes on the page's own origin, over `fetch`. */
export const optionsApiLayer = (origin: string): Layer.Layer<OptionsApi> =>
  Layer.effect(OptionsApi, makeOptionsApi(origin)).pipe(Layer.provide(FetchHttpClient.layer));
