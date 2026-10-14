// The figures' projects built with the Rive CLI (`build.ts`): every option
// of every art-direction axis (`direction.ts`), one axis at a time with the
// others at K1, builds with no warnings and no problems, and the committed
// figures.riv is the build of DIRECTION. The builds have a file of their own,
// apart from the axis property (`direction.test.ts`), so the runner's workers
// take the CLI's runs and the property's checks side by side.

import * as BunServices from '@effect/platform-bun/BunServices';
import { describe, expect, test } from 'bun:test';
import { Console, Effect, FileSystem, Result } from 'effect';
import { compile, rive } from './build.ts';
import { DIRECTION, type Direction, K1, OPTIONS } from './direction.ts';
import { figuresRml } from './figures.ts';

/** Every option, by the study's name, as a direction: K1 with that one axis changed. */
const CASES = Object.entries(OPTIONS).map(
  ([name, set]) => [name, { ...K1, ...set } satisfies Direction] as const,
);

// Top-level await, deliberately: `test.skipIf` needs the boolean at module
// evaluation. CI has no Rive CLI; there the builds skip and say so.
// oxlint-disable-next-line effect/noAsyncFunction -- test.skipIf needs this at module-evaluation time
const cli = await Effect.runPromise(
  Effect.result(rive('rive --version', ['--version'])).pipe(Effect.provide(BunServices.layer)),
);
const noCli = Result.isFailure(cli);

test('reports whether the Rive CLI is here, so a skipped build is never silent', () =>
  Effect.runPromise(
    Effect.gen(function* () {
      if (noCli)
        yield* Console.warn('[papercut] no Rive CLI (`rive`, or `RIVE`): option builds SKIPPED');
      expect(Result.isSuccess(cli) || Result.isFailure(cli)).toBe(true);
    }),
  ));

/** How to rebuild `figures.riv` when it is stale, and the CLI that built this one. */
const REBUILD = {
  run: 'cd apps/animations/src/films/cold-studies && bun looks/rive/build.ts',
  cli: Result.isSuccess(cli) ? cli.success.trim() : 'none',
};

/** A project built as `build.ts` builds it, in a directory of its own: the riv, its warnings and problems. */
const builtIn = (rml: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const built = yield* compile(yield* fs.makeTempDirectoryScoped(), rml);
    return {
      riv: yield* fs.readFile(built.riv),
      warnings: built.warnings,
      problems: built.problems,
    };
  }).pipe(Effect.scoped, Effect.provide(BunServices.layer));

/** `rml` built, as an exit: a failed build fails only the cases that read it. */
const begin = (rml: string) => Effect.runPromiseExit(builtIn(rml));

/** Each distinct project's build, by its text: `DIRECTION` is K1, as is each option K1 is made of. */
const builds = new Map<string, ReturnType<typeof begin>>();

/** `rml`'s build, begun on the first ask and shared by every later one. */
const buildOf = (rml: string) => {
  const build = builds.get(rml) ?? begin(rml);
  builds.set(rml, build);
  return build;
};

/** `d`'s project, built. */
const builtOf = (d: Direction) => Effect.flatten(Effect.promise(() => buildOf(figuresRml(d))));

// Every build begins as the file loads, so the CLI's runs overlap instead of
// queueing case by case.
if (!noCli) for (const d of [DIRECTION, ...CASES.map(([, d]) => d)]) void buildOf(figuresRml(d));

// The film reads `DIRECTION` (props, probes, gaze) beside the committed riv:
// the two must be one build, or a pick without a rebuild pairs new props with
// old figures. The compile is deterministic, so the bytes are the check.
test.skipIf(noCli)(
  'the committed figures.riv is the build of DIRECTION',
  () =>
    Effect.runPromise(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const fresh = (yield* builtOf(DIRECTION)).riv;
        const committed = yield* fs.readFile(`${import.meta.dir}/figures.riv`);
        expect({ fresh: Buffer.from(committed).equals(Buffer.from(fresh)), ...REBUILD }).toEqual({
          fresh: true,
          ...REBUILD,
        });
      }).pipe(Effect.scoped, Effect.provide(BunServices.layer)),
    ),
  30_000,
);

describe.each(CASES)('option %s', (_, d) => {
  test.skipIf(noCli)(
    'builds with the Rive CLI with no warnings and no problems',
    () =>
      Effect.runPromise(
        Effect.gen(function* () {
          const { warnings, problems } = yield* builtOf(d);
          expect({ warnings, problems }).toEqual({ warnings: [], problems: [] });
        }),
      ),
    30_000,
  );
});
