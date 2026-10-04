// What a film's Scenes read of the lab and say to it, over the page's one
// client (`LabClient`; `OptionsApi`, the project's and the check's routes):
// the film's project (its acts, each scene's render state and approval;
// none for a short, which has no project, or when the lab cannot read it)
// and the check's findings (none when it cannot run), and a say on scenes
// (approve, comment), answering the project it leaves or why it was not
// said. A say on scenes apart is said a run of neighbours at a time (one
// address holds only scenes next to each other), stopping at a refusal.
// Each scene's marks are read from these (`marks.ts`); nothing on the tape
// waits for them.

import { Array as Arr, Boolean as Bool, Effect, Layer, Match, Option } from 'effect';
import type { ProjectView, Say } from '../../core/api.ts';
import type { CheckLine } from '../../core/schema.ts';
import { LabClient } from '../api.ts';
import { OptionsApi, optionsApiLayer } from '../review/options/api.ts';

/** What the page has read of the film: its project, when it has one, and the check's findings. */
export interface ScenesRead {
  readonly project: Option.Option<ProjectView>;
  readonly findings: ReadonlyArray<CheckLine>;
}

/** A say's answer: the project it leaves, or the words it was refused in. */
export type Said =
  | { readonly _tag: 'Said'; readonly project: ProjectView }
  | { readonly _tag: 'Refused'; readonly reason: string };

/** The lab as a film's Scenes call it: each call whole, needing nothing more. */
interface ScenesCalls {
  /** The film's project and findings, read now. */
  readonly read: Effect.Effect<ScenesRead>;
  /** Say `say` of the scenes `ids`, in film order `order`, a run of neighbours at a time. */
  readonly say: (
    ids: ReadonlyArray<string>,
    order: ReadonlyArray<string>,
    say: Say,
  ) => Effect.Effect<Said>;
}

/** Nothing read: no project, no findings. */
const NOTHING: ScenesRead = { project: Option.none(), findings: [] };

/**
 * `ids` as runs of scenes next to each other in `order` (the film's): one
 * say approves one run (the project refuses scenes apart in one address).
 */
export const runsOf = (
  ids: ReadonlyArray<string>,
  order: ReadonlyArray<string>,
): ReadonlyArray<readonly [string, ...string[]]> => {
  const picked = new Set(ids);
  return order
    .reduce<ReadonlyArray<ReadonlyArray<string>>>(
      (runs, id, k) =>
        Match.value({ inRun: picked.has(id), after: k > 0 && picked.has(order[k - 1] ?? '') }).pipe(
          Match.when({ inRun: false }, () => runs),
          Match.when({ after: true }, () => [...runs.slice(0, -1), [...(runs.at(-1) ?? []), id]]),
          Match.orElse(() => [...runs, [id]]),
        ),
      [],
    )
    .filter(Arr.isReadonlyArrayNonEmpty);
};

/** The calls of `film`'s Scenes; a short's read no project (it has none). */
export const scenesCalls = (film: string, hasProject: boolean): ScenesCalls => {
  const client = optionsApiLayer.pipe(Layer.provide(LabClient.layer));
  const sayRun = (ids: readonly [string, ...string[]], say: Say): Effect.Effect<Said> =>
    OptionsApi.use((api) => api.sayOfProject(film, { address: { _tag: 'Scenes', ids }, say })).pipe(
      Effect.match({
        onSuccess: (project): Said => ({ _tag: 'Said', project }),
        onFailure: (e): Said => ({ _tag: 'Refused', reason: e.message }),
      }),
      Effect.provide(client),
    );
  /** Each run in turn, stopping at a refusal: the last answer. */
  const sayRuns = (
    runs: ReadonlyArray<readonly [string, ...string[]]>,
    say: Say,
  ): Effect.Effect<Said> =>
    Arr.match(runs, {
      onEmpty: () => Effect.succeed<Said>({ _tag: 'Refused', reason: 'no scene to say it of' }),
      onNonEmpty: ([first, ...rest]) =>
        Effect.flatMap(sayRun(first, say), (answer) =>
          Bool.match(answer._tag === 'Refused' || rest.length === 0, {
            onTrue: () => Effect.succeed(answer),
            onFalse: () => sayRuns(rest, say),
          }),
        ),
    });
  return {
    read: Bool.match(hasProject, {
      onFalse: () => Effect.succeed(NOTHING),
      onTrue: () =>
        OptionsApi.use((api) =>
          Effect.all(
            {
              project: Effect.option(api.project(film)),
              findings: api.check(film).pipe(
                Effect.map((r) => r.findings),
                Effect.orElseSucceed((): ReadonlyArray<CheckLine> => []),
              ),
            },
            { concurrency: 2 },
          ),
        ).pipe(Effect.provide(client)),
    }),
    say: (ids, order, say) => sayRuns(runsOf(ids, order), say),
  };
};
