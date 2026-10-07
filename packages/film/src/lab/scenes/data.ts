// What a film's Scenes read of the lab and say to it, over the page's one
// client (`LabClient`; `OptionsApi`, the project's and the check's routes):
// the film's project (its acts, each scene's render state and approval;
// none for a short, which has no project, or when the lab cannot read it)
// and the check's findings, or why it failed (a failed check is never read as
// clean, RS-1; a short runs none), and a say on scenes
// (approve, comment), answering the project it leaves or why it was not
// said. A say on several scenes is one say naming them all, neighbours or
// not: the project approves them in one run, or refuses the run whole.
// Each scene's marks are read from these (`marks.ts`); nothing on the tape
// waits for them.

import { Boolean as Bool, Effect, Layer, Option, Result } from 'effect';
import type { ProjectView, Say } from '../../core/api.ts';
import { hostOf } from '../../browser/host.ts';
import type { CheckLine } from '../../core/schema.ts';
import type { LabClient } from '../api.ts';
import { failureText } from '../review/format.ts';
import { OptionsApi, optionsApiLayer } from '../review/options/api.ts';

/**
 * What the page has read of the film: its project, when it has one, and the
 * check's findings, or the words it failed in.
 */
export interface ScenesRead {
  readonly project: Option.Option<ProjectView>;
  readonly check: Result.Result<ReadonlyArray<CheckLine>, string>;
}

/** The check's findings as the marks read them: none when it failed (its failure is said apart). */
export const findingsOf = (read: ScenesRead): ReadonlyArray<CheckLine> =>
  Result.getOrElse(read.check, () => []);

/** A say's answer: the project it leaves, or the words it was refused in. */
export type Said =
  | { readonly _tag: 'Said'; readonly project: ProjectView }
  | { readonly _tag: 'Refused'; readonly reason: string };

/** The lab as a film's Scenes call it: each call whole, needing nothing more. */
interface ScenesCalls {
  /** The film's project and findings, read now. */
  readonly read: Effect.Effect<ScenesRead>;
  /** Say `say` of the scenes `ids`, in one say. */
  readonly say: (ids: readonly [string, ...string[]], say: Say) => Effect.Effect<Said>;
}

/** Nothing read: no project, no findings (a short's, which runs no check). */
const NOTHING: ScenesRead = { project: Option.none(), check: Result.succeed([]) };

/**
 * The calls of `film`'s Scenes over `client` (the page's one client of the
 * lab), its options API built once for every call; a short's read no
 * project (it has none).
 */
export const scenesCalls = (
  film: string,
  hasProject: boolean,
  client: Layer.Layer<LabClient>,
): ScenesCalls => {
  const api = hostOf(optionsApiLayer.pipe(Layer.provide(client)));
  return {
    read: Bool.match(hasProject, {
      onFalse: () => Effect.succeed(NOTHING),
      onTrue: () =>
        OptionsApi.use((api) =>
          Effect.all(
            {
              project: Effect.option(api.project(film)),
              check: api.check(film).pipe(
                Effect.map((r) => r.findings),
                Effect.mapError(failureText),
                Effect.result,
              ),
            },
            { concurrency: 2 },
          ),
        ).pipe(Effect.provide(api)),
    }),
    say: (ids, say) =>
      OptionsApi.use((api) =>
        api.sayOfProject(film, { address: { _tag: 'Scenes', ids }, say }),
      ).pipe(
        Effect.match({
          onSuccess: (project): Said => ({ _tag: 'Said', project }),
          onFailure: (e): Said => ({ _tag: 'Refused', reason: e.message }),
        }),
        Effect.provide(api),
      ),
  };
};
