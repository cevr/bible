// A film's choices and project as the review page calls them, through the
// client derived from the review API (`ChoicesGroup`, `ProjectGroup` and
// `StepsGroup` in `core/api.ts`): the films, a film's choice points, a verb
// on a variant, a knob, an approval or a comment, the sound check, the
// film's project (its scenes by the address tree) and what is said of it,
// and the film's undo, redo and check. Each source write answers the change
// it made and the film's static check after it.

import { Context, Data, Effect, Layer, Match, Option, Predicate } from 'effect';
import { FetchHttpClient } from 'effect/http';
import { HttpApiClient } from 'effect/http-api';
import type { PartAddress } from '../../../core/address.ts';
import { ReviewHttpApi } from '../../../core/api.ts';
import type { Project } from '../../../core/catalogue.ts';
import type { ChoiceVerb, ChoiceWrite, FilmChoices, SoundCheck } from '../../../core/choice.ts';
import type { ReviewFilms } from '../../../core/review.ts';
import type { CheckLine, CheckReport, LabWrite } from '../../../core/schema.ts';
import { type LabFailure, heard } from '../../api.ts';

/** What a page asks of a film: a verb on a variant, a knob set, a say, a step back or on. */
export type ChoiceAct = Data.TaggedEnum<{
  Verb: { readonly point: string; readonly variant: string; readonly verb: ChoiceVerb };
  Knob: { readonly point: string; readonly value: number };
  Approve: { readonly point: string; readonly variant: string };
  Comment: { readonly point: string; readonly variant: string; readonly text: string };
  Undo: {};
  Redo: {};
}>;
export const ChoiceAct = Data.taggedEnum<ChoiceAct>();

/** Whether `act` changes what the film plays (a pick, a knob): the sound check runs after it. */
export const changesSound: (act: ChoiceAct) => boolean = Predicate.or(
  Predicate.isTagged('Verb'),
  Predicate.isTagged('Knob'),
);

/**
 * What a write did, as the page says it: its target (`score play warm`,
 * `undo …`, `approve score warm`), the file it wrote, the check after a
 * source write (none for a say, which writes the catalogue), and the act.
 */
export interface Wrote {
  readonly act: ChoiceAct;
  readonly target: string;
  readonly file: string;
  readonly findings: ReadonlyArray<CheckLine>;
}

/** What is said of a film's project: an approval at an address, every current scene, a comment. */
export type ProjectAct = Data.TaggedEnum<{
  Approve: { readonly address: PartAddress };
  ApproveAll: {};
  Comment: { readonly address: PartAddress; readonly text: string };
}>;
export const ProjectAct = Data.taggedEnum<ProjectAct>();

export interface OptionsCalls {
  /** The app's films. */
  readonly films: Effect.Effect<ReviewFilms, LabFailure>;
  /** A film's choice points as they stand. */
  readonly choices: (film: string) => Effect.Effect<FilmChoices, LabFailure>;
  /** The film's check, its latest change, and what Undo and Redo would do. */
  readonly check: (film: string) => Effect.Effect<CheckReport, LabFailure>;
  /** `film check --sound` now: dead air, and balance in the mix the film makes. */
  readonly soundCheck: (film: string) => Effect.Effect<SoundCheck, LabFailure>;
  /** Write `act` into the film's source or its catalogue. */
  readonly write: (film: string, act: ChoiceAct) => Effect.Effect<Wrote, LabFailure>;
  /** The film's project for `variant` (`main` when none), read fresh. */
  readonly project: (
    film: string,
    variant: Option.Option<string>,
  ) => Effect.Effect<Project, LabFailure>;
  /** Say `act` of the film's project; the project as it leaves it. */
  readonly sayOfProject: (
    film: string,
    variant: Option.Option<string>,
    act: ProjectAct,
  ) => Effect.Effect<Project, LabFailure>;
}

export class OptionsApi extends Context.Service<OptionsApi, OptionsCalls>()(
  '@bible/film/lab/OptionsApi',
) {}

/** `{ variant }` when one is named. */
const variantOf = (variant: Option.Option<string>) =>
  Option.match(variant, { onNone: () => ({}), onSome: (v) => ({ variant: v }) });

/** A film's choice and project routes on `origin`. */
export const makeOptionsApi = Effect.fn('lab.options.api')(function* (origin: string) {
  const client = yield* HttpApiClient.make(ReviewHttpApi, { baseUrl: origin });
  const wrote =
    (act: ChoiceAct) =>
    (w: ChoiceWrite | LabWrite): Wrote => ({
      act,
      target: w.target,
      file: w.file,
      findings: w.findings,
    });
  /** A say answers the choices, not a change: it wrote the catalogue. */
  const said = (act: ChoiceAct, target: string) => (): Wrote => ({
    act,
    target,
    file: 'catalogue.json',
    findings: [],
  });
  const api: OptionsCalls = {
    films: heard(client.choices.films()),
    choices: (film) => heard(client.choices.list({ params: { film } })),
    check: (film) => heard(client.steps.check({ params: { film } })),
    soundCheck: (film) => heard(client.choices.soundCheck({ params: { film } })),
    write: (film, act) =>
      heard(
        Match.value(act).pipe(
          Match.tagsExhaustive({
            Verb: (v) =>
              Effect.map(
                client.choices.pick({
                  params: { film },
                  payload: { point: v.point, variant: v.variant, verb: v.verb },
                }),
                wrote(act),
              ),
            Knob: (k) =>
              Effect.map(
                client.choices.knob({
                  params: { film },
                  payload: { point: k.point, value: k.value },
                }),
                wrote(act),
              ),
            Approve: (a) =>
              Effect.map(
                client.choices.approve({
                  params: { film },
                  payload: { point: a.point, variant: a.variant },
                }),
                said(act, `approve ${a.point} ${a.variant}`),
              ),
            Comment: (c) =>
              Effect.map(
                client.choices.comment({
                  params: { film },
                  payload: { point: c.point, variant: c.variant, text: c.text },
                }),
                said(act, `comment on ${c.point} ${c.variant}`),
              ),
            Undo: () =>
              Effect.map(client.steps.undo({ params: { film }, payload: {} }), wrote(act)),
            Redo: () =>
              Effect.map(client.steps.redo({ params: { film }, payload: {} }), wrote(act)),
          }),
        ),
      ),
    project: (film, variant) =>
      heard(client.project.get({ params: { film }, query: variantOf(variant) })),
    sayOfProject: (film, variant, act) =>
      heard(
        Match.value(act).pipe(
          Match.tagsExhaustive({
            Approve: (a) =>
              client.project.approve({
                params: { film },
                payload: { address: a.address, ...variantOf(variant) },
              }),
            ApproveAll: () =>
              client.project.approveAll({ params: { film }, payload: variantOf(variant) }),
            Comment: (c) =>
              client.project.comment({
                params: { film },
                payload: { address: c.address, text: c.text, ...variantOf(variant) },
              }),
          }),
        ),
      ),
  };
  return api;
});

/** The choice and project routes on the page's own origin, over `fetch`. */
export const optionsApiLayer = (origin: string): Layer.Layer<OptionsApi> =>
  Layer.effect(OptionsApi, makeOptionsApi(origin)).pipe(Layer.provide(FetchHttpClient.layer));
