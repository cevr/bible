// Fixture for film/spawn-budget: each line marked RED fires the rule, and
// nothing else does.
import { describe, it } from 'effect-bun-test';
import { Effect } from 'effect';
import { ChildProcess, ChildProcess as Proc } from 'effect/process';
import { spawn as run } from 'bun';

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

  // Bun's spawn imported from `bun`, or taken apart from the global.
  it.live('spawns through bun', () => Effect.sync(() => run(['true']))); // RED film/spawn-budget
  it.live('spawns a taken-apart spawn', () => Effect.sync(() => spawnSync(['true']))); // RED film/spawn-budget
  it.effect('spawns through an aliased ChildProcess', () => collect(Proc.make('sh'))); // RED film/spawn-budget
});

const { spawnSync } = Bun;

// A `Bun`, `ChildProcess` or helper of the test's own is not the one that spawns.
describe('shadowed names', () => {
  it.live('a local Bun', () => {
    const Bun = { spawnSync: (argv: ReadonlyArray<string>) => argv };
    return Effect.sync(() => Bun.spawnSync(['true']));
  });
  it.effect('a parameter ChildProcess', () =>
    ((ChildProcess: { readonly make: (cmd: string) => string }) =>
      Effect.succeed(ChildProcess.make('sh')))({ make: (cmd) => cmd }),
  );
  it.effect('a local commit', () => {
    const commit = () => Effect.void;
    return commit();
  });
});
