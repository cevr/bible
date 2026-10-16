// Build RBF's figure rigs (`figures.ts`) into `figures.riv` beside this file,
// where `rigs.ts` imports it: the generated project (`project/`) compiled by
// the cold-studies build's `compile` (the Rive CLI, offline and unsigned).
// Fails when the CLI reports a problem.
// `bun src/films/righteousness-by-faith/rigs/build.ts`, from the app's
// folder or anywhere: paths are this file's. The CLI is `rive` on the PATH,
// or the one `RIVE` names.

import * as BunRuntime from '@effect/platform-bun/BunRuntime';
import * as BunServices from '@effect/platform-bun/BunServices';
import { Console, Effect, FileSystem, Schema } from 'effect';
import { compile } from '../../cold-studies/looks/rive/build.ts';
import { ARTBOARDS, figuresRml } from './figures.ts';

const here = import.meta.dir;

/** The CLI's problems as JSON text, for the failure's message. */
const ProblemsJson = Schema.fromJsonString(Schema.Array(Schema.Unknown));

/** The Rive CLI built the project but reported problems with it: as it printed them. */
class RiveProblems extends Schema.TaggedError<RiveProblems>()('RiveProblems', {
  problems: Schema.String,
}) {
  override get message() {
    return `rive --once reported problems: ${this.problems}`;
  }
}

const build = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const rml = figuresRml();
  const built = yield* compile(`${here}/project`, rml, ARTBOARDS.lead);
  yield* Console.log(
    `figures.riv: ${built.bytes} bytes; warnings: ${built.warnings.length}; problems: ${built.problems.length}`,
  );
  yield* Effect.forEach(built.warnings, (w) => Console.log(`  warning: ${w}`));
  if (built.problems.length > 0)
    return yield* RiveProblems.make({
      problems: yield* Schema.encodeEffect(ProblemsJson)(built.problems),
    });
  yield* fs.copyFile(built.riv, `${here}/figures.riv`);
});

if (import.meta.main) build.pipe(Effect.provide(BunServices.layer), BunRuntime.runMain);
