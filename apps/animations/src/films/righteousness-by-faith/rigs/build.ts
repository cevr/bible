// Build RBF's figure rigs (`figures.ts`) into `figures.riv` beside this file,
// where `rigs.ts` imports it, with the stamp of what it was built from
// (`figures.stamp.json`): the generated project (`project/`) compiled by the
// house's `compile` (`@bible/film/style/build`: the Rive CLI, offline and
// unsigned). It builds nothing while a locked figure's print is not the one
// its lock holds (`unlocked`), unless an override with the owner's words
// frees that print, which it lists. A build whose stamp still holds
// (`unbuilt`) compiles nothing, so to build with a newer CLI, delete the
// stamp first. Fails when the CLI reports a problem. The film's test
// (`build.test.ts`) holds the locks and the committed file to the rigs
// through the same checks.
// `bun src/films/righteousness-by-faith/rigs/build.ts`, from the app's
// folder or anywhere: paths are this file's. The CLI is `rive` on the PATH,
// or the one `RIVE` names.

import * as BunRuntime from '@effect/platform-bun/BunRuntime';
import * as BunServices from '@effect/platform-bun/BunServices';
import { Console, Effect, FileSystem, Schema } from 'effect';
import { compile, unbuilt, unlocked } from '@bible/film/style/build';
import { ARTBOARDS, figuresRml, lockedPrints } from './figures.ts';

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

/** A locked figure's print is not the one its lock holds, and no override with the owner's words frees it: why, each. */
class LocksBroken extends Schema.TaggedError<LocksBroken>()('LocksBroken', {
  broken: Schema.Array(Schema.String),
}) {
  override get message() {
    return `locked figures changed:\n${this.broken.join('\n')}`;
  }
}

/** The committed figures and their stamp, beside this file. */
const committed = { riv: `${here}/figures.riv`, stamp: `${here}/figures.stamp.json` };

const build = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const locks = yield* unlocked(lockedPrints());
  yield* Effect.forEach(locks.overridden, ({ item, override }) =>
    Console.log(
      `overridden: ${item}'s lock (FigureLock): ${override.reason} ("${override.quote}")`,
    ),
  );
  if (locks.broken.length > 0)
    return yield* LocksBroken.make({ broken: locks.broken.map((b) => b.why) });
  const rml = figuresRml();
  const stale = yield* unbuilt({ ...committed, rml, main: ARTBOARDS.lead });
  if (stale.length === 0)
    return yield* Console.log('figures.riv is the build of the rigs: nothing to build');
  yield* Effect.forEach(stale, (why) => Console.log(`building: ${why}`));
  const built = yield* compile(`${here}/project`, rml, ARTBOARDS.lead);
  yield* Console.log(
    `figures.riv: ${built.bytes} bytes; warnings: ${built.warnings.length}; problems: ${built.problems.length}`,
  );
  yield* Effect.forEach(built.warnings, (w) => Console.log(`  warning: ${w}`));
  if (built.problems.length > 0)
    return yield* RiveProblems.make({
      problems: yield* Schema.encodeEffect(ProblemsJson)(built.problems),
    });
  yield* fs.copyFile(built.riv, committed.riv);
  yield* fs.writeFileString(committed.stamp, built.stamp);
});

if (import.meta.main) build.pipe(Effect.provide(BunServices.layer), BunRuntime.runMain);
