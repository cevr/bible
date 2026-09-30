// The Solid plugin as Bun's bundler runs it: many `.tsx` modules loaded at
// once (a page's first bundle), each compiled to DOM output. A load builds
// only what it reads with, so a burst of loads puts no listener on the
// process's stdin (a terminal per load warned "11 end listeners added to
// [ReadStream]" as the lab page first bundled).

import type { OnLoadArgs, OnLoadResult, PluginBuilder } from 'bun';
import { describe, expect, it } from 'effect-bun-test';
import { Effect, Option, Predicate } from 'effect';
import { solidPlugin } from './solid-plugin.ts';

/** The plugin's loader: it compiles off the bundler's thread, so each load is a promise. */
type Loader = (args: OnLoadArgs) => Promise<OnLoadResult>;

/** The plugin's `.tsx` loader, as the bundler is handed it. */
const loader = Effect.suspend(() => {
  let found = Option.none<Loader>();
  const build = {
    onLoad: (_: { readonly filter: RegExp }, load: Loader) => {
      found = Option.some(load);
      return build;
    },
  } as unknown as PluginBuilder;
  void solidPlugin.setup(build);
  return Effect.fromOption(found).pipe(Effect.orDie);
});

const TSX = [
  `${import.meta.dir}/../lab/editor/strip.tsx`,
  `${import.meta.dir}/../lab/shell.tsx`,
  `${import.meta.dir}/../lab/review/options/section.tsx`,
];

/** How many `end` listeners the process's stdin holds: the subject of this test. */
// oxlint-disable-next-line effect/noGlobals -- the listeners on this process's own stdin are what is checked
const stdinEnds = () => process.stdin.listenerCount('end');

describe('the Solid plugin', () => {
  it.effect('compiles a burst of modules to DOM output, and adds no listener to stdin', () =>
    Effect.gen(function* () {
      const load = yield* loader;
      const before = stdinEnds();
      const started = TSX.flatMap((path) =>
        Array.from({ length: 8 }, () => load({ path } as OnLoadArgs)),
      );
      // Every load has begun: each would hold its listener now.
      expect(stdinEnds()).toBe(before);
      const out = yield* Effect.forEach(started, (loading) => Effect.promise(() => loading));
      for (const result of out)
        expect(Predicate.hasProperty(result, 'contents') && String(result.contents)).toContain(
          '@solidjs/web',
        );
      expect(stdinEnds()).toBe(before);
    }),
  );
});
