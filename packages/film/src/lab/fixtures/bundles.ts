// Browser fixture scripts are compiled once by the suite runner, shared as
// immutable files for that invocation. A direct `bun test` still builds its
// own script. No result survives an invocation or a source change.

import { BunServices } from '@effect/platform-bun';
import { Config, Effect, FileSystem, Option } from 'effect';
import { solidPlugin } from '../../tools/solid-plugin.ts';

export const ENTRIES = ['lab-page.ts', 'review-page.ts', 'player-page.ts', 'capture-page.ts'];

export const compile = (entry: string) =>
  Effect.promise(() =>
    Bun.build({
      entrypoints: [`${import.meta.dir}/${entry}`],
      target: 'browser',
      format: 'iife',
      minify: true,
      plugins: [solidPlugin],
    }),
  ).pipe(
    Effect.flatMap((built) => {
      if (!built.success) return Effect.die(`${entry} did not bundle: ${built.logs.join('\n')}`);
      return Option.match(Option.fromUndefinedOr(built.outputs[0]), {
        onNone: () => Effect.die(`${entry} did not bundle: ${built.logs.join('\n')}`),
        onSome: (out) => Effect.promise(() => out.text()),
      });
    }),
  );

export const bundled = (entry: string) =>
  Effect.flatMap(Config.option(Config.String('FILM_TEST_BUNDLES')), (dir) =>
    Option.match(dir, {
      onNone: () => compile(entry),
      onSome: (root) =>
        FileSystem.FileSystem.use((fs) => fs.readFileString(`${root}/${entry}.js`)).pipe(
          Effect.orDie,
          Effect.provide(BunServices.layer),
        ),
    }),
  ).pipe(Effect.orDie);
