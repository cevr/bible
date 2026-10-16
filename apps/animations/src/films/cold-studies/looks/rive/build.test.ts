// The figures' projects built with the Rive CLI (`build.ts`): every option
// of every art-direction axis (`direction.ts`), one axis at a time with the
// others at K1, builds with no warnings and no problems, and the committed
// figures.riv is the build of DIRECTION. The builds have a file of their own,
// apart from the axis property (`direction-*.test.ts`), so the runner's workers
// take the CLI's runs and the property's checks side by side.
//
// The compile is deterministic, so each build is kept by what makes it: the
// CLI's version, `build.ts` (which writes the project) and the project's text.
// A run compiles only a project no kept build was made from, and reads the
// riv, the warnings and the problems of the rest from the build the CLI made
// of that same text (node_modules/.cache/rive-builds).

import * as BunServices from '@effect/platform-bun/BunServices';
import { describe, expect, test } from 'bun:test';
import { Console, Effect, FileSystem, Option, Result, Schema } from 'effect';
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

/** Where the builds are kept, each in the folder its key names. */
const KEPT = `${import.meta.dir}/../../../../../node_modules/.cache/rive-builds`;

/** What a kept build's report holds beside its riv. */
const Report = Schema.fromJsonString(
  Schema.Struct({ warnings: Schema.Array(Schema.String), problems: Schema.Array(Schema.Unknown) }),
);

/** A project built as `build.ts` builds it, in a directory of its own: the riv, its warnings and problems. */
const compiled = (rml: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const built = yield* compile(yield* fs.makeTempDirectoryScoped(), rml);
    return {
      riv: yield* fs.readFile(built.riv),
      warnings: built.warnings,
      problems: built.problems,
    };
  }).pipe(Effect.scoped);

/** `rml`'s build: the one kept for its key, else the CLI's, kept for the next run. */
const builtIn = (rml: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const maker = yield* fs.readFileString(`${import.meta.dir}/build.ts`);
    const at = `${KEPT}/${Bun.hash(`${REBUILD.cli}\n${maker}\n${rml}`).toString(36)}`;
    const kept = yield* Effect.option(
      Effect.all({
        riv: fs.readFile(`${at}/figures.riv`),
        report: Effect.flatMap(
          fs.readFileString(`${at}/report.json`),
          Schema.decodeUnknownEffect(Report),
        ),
      }),
    );
    if (Option.isSome(kept)) return { riv: kept.value.riv, ...kept.value.report };
    const built = yield* compiled(rml);
    // Written beside, then renamed into place: a reader sees a whole build or none.
    const beside = `${at}.${process.pid}`;
    yield* fs.makeDirectory(beside, { recursive: true });
    yield* fs.writeFile(`${beside}/figures.riv`, built.riv);
    yield* fs.writeFileString(
      `${beside}/report.json`,
      yield* Schema.encodeEffect(Report)({ warnings: built.warnings, problems: built.problems }),
    );
    yield* fs.rename(beside, at).pipe(
      // Another run kept the same build first: its copy is this one.
      Effect.catch(() => fs.remove(beside, { recursive: true })),
    );
    return built;
  }).pipe(Effect.provide(BunServices.layer));

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
