// Fixture for film/spawn-budget: each line marked RED fires the rule, and
// nothing else does.
import { describe, it } from 'effect-bun-test';
import { Effect } from 'effect';
import { ChildProcess } from 'effect/process';

declare const collect: (command: unknown) => Effect.Effect<string>;

/** A helper of the file that spawns, two calls deep. */
const git = (...args: ReadonlyArray<string>) => collect(ChildProcess.make('git', args));
const commit = () => git('commit', '-m', 'x');

describe('spawning tests', () => {
  it.effect('spawns through a helper with no budget', () => commit()); // RED film/spawn-budget

  it.effect.layer(Effect.void)('a layered test', () => collect(ChildProcess.make('sh'))); // RED film/spawn-budget

  it.live('spawns Bun directly with no budget', () => Effect.sync(() => Bun.spawnSync(['true']))); // RED film/spawn-budget

  it.effect('spawns through a helper with its budget', () => commit(), 20_000);

  it.effect('spawns nothing', () => Effect.void);
});
