// A scene's source as it was at HEAD, for the lab's compare: `git show
// HEAD:<file>` for the file SceneSources locates, and from it the drawing's
// timeline and knobs literals (the same parser the writer uses). Only data can
// be drawn this way — the page draws HEAD's values through the code it has
// now — so the answer also says whether the file's code (everything but those
// two literals) changed since HEAD.

import {
  Context,
  Duration,
  Effect,
  FileSystem,
  Layer,
  Path,
  Record as Rec,
  Result,
  Schema,
} from 'effect';
import type { PlatformError } from 'effect/PlatformError';
import { ChildProcess, ChildProcessSpawner } from 'effect/process';
import { type Knob, Knobs, type Span, Timeline } from '../core/schema.ts';
import { HeadUnavailable, type SceneNotLocated } from '../core/refusals.ts';
import { type ProcessTimedOut } from './errors.ts';
import { collectWithin } from './process.ts';
import { codeOf, readKnobs, readSpans } from './scene-source.ts';
import { type Field, type LocateError, type SceneSite, SceneSources } from './scene-sources.ts';

/** A scene's data at HEAD beside the file now. */
interface SceneAtHead {
  readonly site: SceneSite;
  readonly timeline: Readonly<Record<string, Span>>;
  readonly knobs: Readonly<Record<string, Knob>>;
  readonly codeChanged: boolean;
  readonly sameData: boolean;
}

interface SceneHeadService {
  readonly head: (
    film: string,
    scene: string,
  ) => Effect.Effect<SceneAtHead, LocateError | SceneNotLocated | HeadUnavailable>;
}

/** The longest `git show` may take: a lab request waits on it. */
const GIT_LIMIT = Duration.seconds(10);

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
        collectWithin(
          spawner,
          'git show',
          ChildProcess.make('git', ['show', `HEAD:./${path.basename(file)}`], {
            cwd: path.dirname(file),
          }),
          GIT_LIMIT,
        ).pipe(
          Effect.mapError((error: PlatformError | ProcessTimedOut) =>
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
        // Only a field the scene reads from this literal: another's data is not the scene's.
        const ours = (field: Field) => site.access[field]._tag === 'Writable';
        const spans = (source: string): Readonly<Record<string, Span>> =>
          Rec.filter(readSpans(site.file, source, site.exportName), () => ours('timeline'));
        const knobsOf = (source: string): Readonly<Record<string, Knob>> =>
          Rec.filter(readKnobs(site.file, source, site.exportName), () => ours('knobs'));
        const timeline = spans(then);
        const knobs = knobsOf(then);
        const codeChanged = Result.match(code(now), {
          onFailure: () => true,
          onSuccess: (c) => c !== thenCode.success,
        });
        const sameData = sameTimeline(timeline, spans(now)) && sameKnobs(knobs, knobsOf(now));
        yield* Effect.logDebug(
          `scene-head.read scene=${scene} code_changed=${codeChanged} same_data=${sameData}`,
        );
        return { site, timeline, knobs, codeChanged, sameData };
      });

      return SceneHead.of({ head });
    }),
  );
}
