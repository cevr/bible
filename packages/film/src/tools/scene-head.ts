// A scene's source as it was at HEAD, for the lab's compare: `git show
// HEAD:<file>` for the file SceneSources locates, and from it the drawing's
// timeline and knobs literals (the same parser the writer uses). Only data can
// be drawn this way — the page draws HEAD's values through the code it has
// now — so the answer also says whether the file's code (everything but those
// two literals) changed since HEAD.

import { Context, Effect, FileSystem, Layer, Path, Result, Schema } from 'effect';
import type { PlatformError } from 'effect/PlatformError';
import { ChildProcess, ChildProcessSpawner } from 'effect/unstable/process';
import { type Knob, Knobs, type Span, Timeline } from '../core/schema.ts';
import { HeadUnavailable, type SceneNotLocated } from './errors.ts';
import { collect } from './process.ts';
import { codeOf, readKnobs, readSpans } from './scene-source.ts';
import { type LocateError, type SceneSite, SceneSources } from './scene-sources.ts';

/** A scene's data at HEAD beside the file now. */
export interface SceneAtHead {
  readonly site: SceneSite;
  readonly timeline: Readonly<Record<string, Span>>;
  readonly knobs: Readonly<Record<string, Knob>>;
  readonly codeChanged: boolean;
  readonly sameData: boolean;
}

export interface SceneHeadService {
  readonly head: (
    film: string,
    scene: string,
  ) => Effect.Effect<SceneAtHead, LocateError | SceneNotLocated | HeadUnavailable>;
}

/** The same data, key order aside. */
const sameTimeline = Schema.toEquivalence(Timeline);
const sameKnobs = Schema.toEquivalence(Knobs);

export class SceneHead extends Context.Service<SceneHead, SceneHeadService>()(
  '@bible/film/tools/SceneHead',
) {
  static readonly layer = Layer.effect(
    SceneHead,
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const sources = yield* SceneSources;
      const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;

      /** The file's text at HEAD, run where the file is so any repository root works. */
      const atHead = (file: string) =>
        collect(
          spawner,
          ChildProcess.make('git', ['show', `HEAD:./${path.basename(file)}`], {
            cwd: path.dirname(file),
          }),
        ).pipe(
          Effect.mapError((error: PlatformError) =>
            HeadUnavailable.make({ file, reason: error.message }),
          ),
          Effect.flatMap((done) => {
            if (done.exitCode === 0) return Effect.succeed(done.stdout);
            const reason = done.stderr.trim() || `exit ${done.exitCode}`;
            return Effect.fail(HeadUnavailable.make({ file, reason }));
          }),
        );

      const head = Effect.fn('SceneHead.head')(function* (film: string, scene: string) {
        const site = yield* sources.site(film, scene);
        const now = yield* fs
          .readFileString(site.file)
          .pipe(
            Effect.mapError((error) =>
              HeadUnavailable.make({ file: site.file, reason: error.message }),
            ),
          );
        const then = yield* atHead(site.file);
        const code = (source: string) => codeOf(site.file, source, site.exportName);
        const thenCode = code(then);
        if (Result.isFailure(thenCode))
          return yield* HeadUnavailable.make({ file: site.file, reason: thenCode.failure.reason });
        const timeline = readSpans(site.file, then, site.exportName);
        const knobs = readKnobs(site.file, then, site.exportName);
        const codeChanged = Result.match(code(now), {
          onFailure: () => true,
          onSuccess: (c) => c !== thenCode.success,
        });
        const sameData =
          sameTimeline(timeline, readSpans(site.file, now, site.exportName)) &&
          sameKnobs(knobs, readKnobs(site.file, now, site.exportName));
        yield* Effect.logDebug(
          `scene-head.read scene=${scene} code_changed=${codeChanged} same_data=${sameData}`,
        );
        return { site, timeline, knobs, codeChanged, sameData };
      });

      return SceneHead.of({ head });
    }),
  );
}
