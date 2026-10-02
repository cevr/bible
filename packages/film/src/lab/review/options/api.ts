// A film's choices and project as the review page calls them, through the
// client derived from the review API (`ChoicesGroup`, `ProjectGroup` and
// `StepsGroup` in `core/api.ts`): the films, a film's choice points, a verb
// on a variant, a knob, a say on a variant (`Say`: approve, withdraw,
// comment), the sound check, the film's project (its scenes by the address
// tree, each with its render's video) and what is said of it, and the film's
// undo, redo, check and steps. Each write answers what the page then shows:
// a source write the change it made, the choices it leaves and the static
// check after it; a say the choices, or the project, it leaves.

import { Context, Data, Effect, Layer, Match, Option, Predicate } from 'effect';
import { FetchHttpClient } from 'effect/http';
import { HttpApiClient } from 'effect/http-api';
import type { PartAddress } from '../../../core/address.ts';
import { type ProjectView, LabHttpApi, type Say, type Steps } from '../../../core/api.ts';
import type { ChoiceVerb, ChoiceWrite, FilmChoices, SoundCheck } from '../../../core/choice.ts';
import type { ReviewFilms } from '../../../core/review.ts';
import type { CheckLine, CheckReport, LabWrite } from '../../../core/schema.ts';
import { type LabFailure, called } from '../../api.ts';

/** What a page asks of a film: a verb on a variant, a knob set, a say on a variant, a step back or on. */
export type ChoiceAct = Data.TaggedEnum<{
  Verb: { readonly point: string; readonly variant: string; readonly verb: ChoiceVerb };
  Knob: { readonly point: string; readonly value: number };
  Say: { readonly point: string; readonly variant: string; readonly say: Say };
  Undo: {};
  Redo: {};
}>;
export const ChoiceAct = Data.taggedEnum<ChoiceAct>();

/** Whether `act` changes what the film plays (a pick, a knob): the sound check runs after it. */
export const changesSound: (act: ChoiceAct) => boolean = Predicate.or(
  Predicate.isTagged('Verb'),
  Predicate.isTagged('Knob'),
);

/** Whether `act` writes the film's source (all but a say, which writes the catalogue). */
export const writesSource = (act: ChoiceAct): boolean => act._tag !== 'Say';

/** A say as a write's target says it: `approve score warm`, `comment on score warm`. */
const sayTarget = (say: Say, subject: string): string =>
  Match.value(say).pipe(
    Match.tagsExhaustive({
      Approve: () => `approve ${subject}`,
      Withdraw: () => `withdraw the approval of ${subject}`,
      Comment: () => `comment on ${subject}`,
    }),
  );

/**
 * What a write did, as the page says it: its target (`score play warm`,
 * `undo …`, `approve score warm`), the file it wrote, and the act; the check
 * after a source write, and the choices it leaves, when its answer carries
 * them (an undo's does not: the page reads them again).
 */
export interface Wrote {
  readonly act: ChoiceAct;
  readonly target: string;
  readonly file: string;
  readonly findings: Option.Option<ReadonlyArray<CheckLine>>;
  readonly choices: Option.Option<FilmChoices>;
}

/** What is said of a film's project: a say at an address (a scene's render, an act, the film). */
export interface ProjectSay {
  readonly address: PartAddress;
  readonly say: Say;
}

interface OptionsCalls {
  /** The app's films. */
  readonly films: Effect.Effect<ReviewFilms, LabFailure>;
  /** A film's choice points as they stand. */
  readonly choices: (film: string) => Effect.Effect<FilmChoices, LabFailure>;
  /** The film's check, its latest change, and what Undo and Redo would do. */
  readonly check: (film: string) => Effect.Effect<CheckReport, LabFailure>;
  /** The film's latest change, and what Undo and Redo would do, without the check. */
  readonly steps: (film: string) => Effect.Effect<Steps, LabFailure>;
  /** `film check --sound` now: dead air, and balance in the mix the film makes. */
  readonly soundCheck: (film: string) => Effect.Effect<SoundCheck, LabFailure>;
  /** Write `act` into the film's source or its catalogue. */
  readonly write: (film: string, act: ChoiceAct) => Effect.Effect<Wrote, LabFailure>;
  /** The film's project for `variant` (`main` when none), read fresh. */
  readonly project: (
    film: string,
    variant: Option.Option<string>,
  ) => Effect.Effect<ProjectView, LabFailure>;
  /** Say `said` of the film's project; the project as it leaves it. */
  readonly sayOfProject: (
    film: string,
    variant: Option.Option<string>,
    said: ProjectSay,
  ) => Effect.Effect<ProjectView, LabFailure>;
}

export class OptionsApi extends Context.Service<OptionsApi, OptionsCalls>()(
  '@bible/film/lab/OptionsApi',
) {}

/** `{ variant }` when one is named. */
const variantOf = (variant: Option.Option<string>) =>
  Option.match(variant, { onNone: () => ({}), onSome: (v) => ({ variant: v }) });

/** A film's choice and project routes on `origin`. */
const makeOptionsApi = Effect.fn('lab.options.api')(function* (origin: string) {
  const client = yield* HttpApiClient.make(LabHttpApi, { baseUrl: origin });
  /** A pick or a knob: the change, the choices it leaves, and the check after it. */
  const picked =
    (act: ChoiceAct) =>
    (w: ChoiceWrite): Wrote => ({
      act,
      target: w.target,
      file: w.file,
      findings: Option.some(w.findings),
      choices: Option.some(w.choices),
    });
  /** An undo or a redo: the change, and the check after it (the choices are read again). */
  const stepped =
    (act: ChoiceAct) =>
    (w: LabWrite): Wrote => ({
      act,
      target: w.target,
      file: w.file,
      findings: Option.some(w.findings),
      choices: Option.none(),
    });
  /** A say answers the choices it leaves: it wrote the catalogue, not a source. */
  const said =
    (act: ChoiceAct, target: string) =>
    (choices: FilmChoices): Wrote => ({
      act,
      target,
      file: 'catalogue.json',
      findings: Option.none(),
      choices: Option.some(choices),
    });
  const api: OptionsCalls = {
    films: called(client.choices.films()),
    choices: (film) => called(client.choices.list({ params: { film } })),
    check: (film) => called(client.steps.check({ params: { film } })),
    steps: (film) => called(client.steps.steps({ params: { film } })),
    soundCheck: (film) => called(client.choices.soundCheck({ params: { film } })),
    write: (film, act) =>
      called(
        Match.value(act).pipe(
          Match.tagsExhaustive({
            Verb: (v) =>
              Effect.map(
                client.choices.pick({
                  params: { film },
                  payload: { point: v.point, variant: v.variant, verb: v.verb },
                }),
                picked(act),
              ),
            Knob: (k) =>
              Effect.map(
                client.choices.knob({
                  params: { film },
                  payload: { point: k.point, value: k.value },
                }),
                picked(act),
              ),
            Say: (s) =>
              Effect.map(
                client.choices.say({
                  params: { film },
                  payload: { point: s.point, variant: s.variant, say: s.say },
                }),
                said(act, sayTarget(s.say, `${s.point} ${s.variant}`)),
              ),
            Undo: () =>
              Effect.map(client.steps.undo({ params: { film }, payload: {} }), stepped(act)),
            Redo: () =>
              Effect.map(client.steps.redo({ params: { film }, payload: {} }), stepped(act)),
          }),
        ),
      ),
    project: (film, variant) =>
      called(client.project.get({ params: { film }, query: variantOf(variant) })),
    sayOfProject: (film, variant, said) =>
      called(
        client.project.say({
          params: { film },
          payload: { address: said.address, say: said.say, ...variantOf(variant) },
        }),
      ),
  };
  return api;
});

/** The choice and project routes on the page's own origin, over `fetch`. */
export const optionsApiLayer = (origin: string): Layer.Layer<OptionsApi> =>
  Layer.effect(OptionsApi, makeOptionsApi(origin)).pipe(Layer.provide(FetchHttpClient.layer));
