// A film's choices and project as the review page calls them, through the
// page's one client of the lab's API (`LabClient`; `ChoicesGroup`, `ProjectGroup` and
// `StepsGroup` in `core/api.ts`): the films, a film's choice points, a verb
// on a variant, a knob, a say on a variant (`Say`: approve, withdraw,
// comment), the sound check, the film's project (its scenes by the address
// tree, each with its render's video) and what is said of it, and the film's
// undo, redo, check and steps. Each write answers what the page then shows:
// a source write the change it made, the choices it leaves and the static
// check after it; a say the choices, or the project, it leaves.

import { Context, Data, Effect, Layer, Match, Option, Predicate } from 'effect';
import type { PartAddress } from '../../../core/address.ts';
import type { ProjectView, Say, Steps } from '../../../core/api.ts';
import type { ChoiceVerb, ChoiceWrite, FilmChoices, SoundCheck } from '../../../core/choice.ts';
import type { ReviewFilms } from '../../../core/review.ts';
import type { CheckLine, CheckReport, LabWrite, PageBuild } from '../../../core/schema.ts';
import {
  LabClient,
  type LabFailure,
  LabUnreachable,
  type StepVerb,
  called,
  landedStep,
  stepRequest,
} from '../../api.ts';

/** What a page asks of a film: a verb on a variant, a knob set, a say on a variant, a step back or on. */
export type ChoiceAct = Data.TaggedEnum<{
  Verb: {
    readonly point: string;
    readonly variant: string;
    readonly verb: ChoiceVerb;
    /** A voice's attempt kept though it is heard as something else (Accept anyway). */
    readonly acceptMismatch?: true;
  };
  Knob: { readonly point: string; readonly value: number };
  Say: { readonly point: string; readonly variant: string; readonly say: Say };
  /** A step back or on: of one change (a receipt's, by its id), or of the newest with none. */
  Undo: { readonly change: Option.Option<string> };
  Redo: { readonly change: Option.Option<string> };
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
 * them (an undo's does not: the page reads them again); the change a source
 * write made, by its id, which its receipt's Undo acts on; and the build the
 * page hears the mix it made by, when it made one a page hears.
 */
export interface Wrote {
  readonly act: ChoiceAct;
  readonly target: string;
  readonly file: string;
  readonly change: Option.Option<string>;
  readonly findings: Option.Option<ReadonlyArray<CheckLine>>;
  readonly choices: Option.Option<FilmChoices>;
  readonly mixed: Option.Option<PageBuild>;
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
  /** The film's project (its `main` variant's), read fresh. */
  readonly project: (film: string) => Effect.Effect<ProjectView, LabFailure>;
  /** Say `said` of the film's project; the project as it leaves it. */
  readonly sayOfProject: (film: string, said: ProjectSay) => Effect.Effect<ProjectView, LabFailure>;
}

export class OptionsApi extends Context.Service<OptionsApi, OptionsCalls>()(
  '@bible/film/lab/OptionsApi',
) {}

/** An Undo's or a Redo's change: the one it steps (a receipt's), or none for the newest. */
const stepAsk = (change: Option.Option<string>) =>
  Option.match(change, { onNone: () => ({}), onSome: (c) => ({ change: c }) });

/** A film's choice and project routes, over the page's one client. */
const makeOptionsApi = Effect.fn('lab.options.api')(function* () {
  const client = yield* LabClient;
  /**
   * An undo or a redo on `film` of `change` (the newest with none), sent with
   * an id unique to its request: when its answer is lost on the way back, the
   * lab's check says by that id whether it landed (`landedStep`), and it is
   * said as landed, or as unreachable with no record of it. Never guessed at.
   */
  const step = (film: string, verb: StepVerb, change: Option.Option<string>) =>
    Effect.gen(function* () {
      const request = yield* stepRequest;
      return yield* called(
        client.steps[verb]({ params: { film }, payload: { request, ...stepAsk(change) } }),
      ).pipe(
        Effect.catchTag('LabUnreachable', (lost) =>
          called(client.steps.check({ params: { film } })).pipe(
            Effect.mapError(() =>
              LabUnreachable.make({
                message: `${lost.message}, nor did the lab's check answer to say whether that ${verb} landed: see the lab log before stepping again`,
              }),
            ),
            Effect.flatMap((report) =>
              Effect.mapError(Effect.fromOption(landedStep(report, request)), () =>
                LabUnreachable.make({
                  message: `${lost.message}, and the lab has no record of that ${verb}: it did not land, or is still landing; see the lab log before stepping again`,
                }),
              ),
            ),
          ),
        ),
      );
    });
  /** A pick or a knob: the change, the choices it leaves, the check after it, and its mix. */
  const picked =
    (act: ChoiceAct) =>
    (w: ChoiceWrite): Wrote => ({
      act,
      target: w.target,
      file: w.file,
      change: Option.fromUndefinedOr(w.change),
      findings: Option.some(w.findings),
      choices: Option.some(w.choices),
      mixed: Option.fromUndefinedOr(w.mixed),
    });
  /** An undo or a redo: the change, the check after it (the choices are read again), and its mix. */
  const stepped =
    (act: ChoiceAct) =>
    (w: LabWrite): Wrote => ({
      act,
      target: w.target,
      file: w.file,
      change: Option.fromUndefinedOr(w.change),
      findings: Option.some(w.findings),
      choices: Option.none(),
      mixed: Option.fromUndefinedOr(w.mixed),
    });
  /** A say answers the choices it leaves: it wrote the catalogue, not a source. */
  const said =
    (act: ChoiceAct, target: string) =>
    (choices: FilmChoices): Wrote => ({
      act,
      target,
      file: 'catalogue.json',
      change: Option.none(),
      findings: Option.none(),
      choices: Option.some(choices),
      mixed: Option.none(),
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
                  // `acceptMismatch` only when accepted: a plain pick posts as it always has.
                  payload: {
                    point: v.point,
                    variant: v.variant,
                    verb: v.verb,
                    ...Option.match(Option.fromUndefinedOr(v.acceptMismatch), {
                      onNone: () => ({}),
                      onSome: (acceptMismatch) => ({ acceptMismatch }),
                    }),
                  },
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
            Undo: (u) => Effect.map(step(film, 'undo', u.change), stepped(act)),
            Redo: (r) => Effect.map(step(film, 'redo', r.change), stepped(act)),
          }),
        ),
      ),
    project: (film) => called(client.project.get({ params: { film }, query: {} })),
    sayOfProject: (film, said) =>
      called(
        client.project.say({
          params: { film },
          payload: { address: said.address, say: said.say },
        }),
      ),
  };
  return api;
});

/** The choice and project routes, over the page's one client (given at its root). */
export const optionsApiLayer: Layer.Layer<OptionsApi, never, LabClient> = Layer.effect(
  OptionsApi,
  makeOptionsApi(),
);
