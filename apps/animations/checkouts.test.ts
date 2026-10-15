// The checkouts the lab's review reads renders from, on a folder laid out as
// the laptop is: a warm source, its Rifts under `.rifts/<repo>/`, and other
// repositories beside them whose names say nothing.

import { describe, expect, it } from 'effect-bun-test';
import { BunServices } from '@effect/platform-bun';
import { Effect, FileSystem, Path } from 'effect';
import { checkoutRootsOf } from './checkouts.ts';

/** A checkout at `dir` whose root package is `name`, with its app's `made` folder (renders: `out`). */
const checkout = (dir: string, name: string, made = 'out') =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    yield* fs.makeDirectory(path.join(dir, 'apps', 'animations', made), { recursive: true });
    yield* fs.writeFileString(path.join(dir, 'package.json'), `{ "name": "${name}" }`);
  });

describe('the checkouts', () => {
  it.effect(
    'are the folders whose root package is this one: a Rift’s siblings, never its warm source',
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const home = yield* fs.makeTempDirectoryScoped();
        const rifts = path.join(home, '.rifts', 'bible-tools');
        yield* checkout(path.join(home, 'bible-tools'), 'bible');
        for (const rift of ['p5', 'rbfscene', 'oneline', 'seedanim', 'rimproto'])
          yield* checkout(path.join(rifts, rift), 'bible');
        yield* checkout(path.join(rifts, 'empty'), 'bible', 'src');
        // Named like the repository, a different one; named nothing like it, a checkout.
        yield* checkout(path.join(home, 'bible-hymns'), 'hymns');
        yield* checkout(path.join(rifts, 'not-json'), 'bible');
        yield* fs.writeFileString(path.join(rifts, 'not-json', 'package.json'), '{');
        const labels = (repo: string) =>
          Effect.map(checkoutRootsOf(repo), (roots) => roots.map((root) => root.label));
        const rifted = ['oneline', 'p5', 'rbfscene', 'rimproto', 'seedanim'];
        // A lab in a Rift reads and writes (a say writes a catalogue) the Rifts alone: the
        // warm source is only ever read, by git, never written.
        expect(yield* labels(path.join(rifts, 'p5'))).toEqual(rifted);
        expect(yield* labels(path.join(home, 'bible-tools'))).toEqual(['bible-tools', ...rifted]);
        const [first] = yield* checkoutRootsOf(path.join(rifts, 'p5'));
        expect(first?.path).toBe(path.join(rifts, 'oneline', 'apps', 'animations', 'out'));
      }).pipe(Effect.scoped, Effect.provide(BunServices.layer)),
  );

  it.effect(
    'a git worktree’s lab leaves out the checkout it was made from, beside it or in a Rift',
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const home = yield* fs.realPath(yield* fs.makeTempDirectoryScoped());
        const rifts = path.join(home, '.rifts', 'bible-tools');
        /** `name`, a git worktree of the checkout `main`, as `git worktree add` lays one out. */
        const worktree = (main: string, dir: string) =>
          Effect.gen(function* () {
            const admin = path.join(main, '.git', 'worktrees', path.basename(dir));
            yield* checkout(dir, 'bible');
            yield* fs.makeDirectory(admin, { recursive: true });
            yield* fs.writeFileString(path.join(admin, 'commondir'), '../..\n');
            yield* fs.writeFileString(path.join(dir, '.git'), `gitdir: ${admin}\n`);
          });
        const warm = path.join(home, 'bible-tools');
        yield* checkout(warm, 'bible');
        yield* fs.makeDirectory(path.join(warm, '.git'));
        // A batch of the film-architecture loop, made by `git worktree add ../bible-tools-batch`.
        yield* worktree(warm, path.join(home, 'bible-tools-batch'));
        // A unit's worktree of the run's main, a Rift, beside it.
        yield* checkout(path.join(rifts, 'p5'), 'bible');
        yield* fs.makeDirectory(path.join(rifts, 'p5', '.git'));
        yield* checkout(path.join(rifts, 'oneline'), 'bible');
        yield* worktree(path.join(rifts, 'p5'), path.join(rifts, 'unit'));
        const labels = (repo: string) =>
          Effect.map(checkoutRootsOf(repo), (roots) => roots.map((root) => root.label));
        expect(yield* labels(path.join(home, 'bible-tools-batch'))).toEqual(['bible-tools-batch']);
        expect(yield* labels(path.join(rifts, 'unit'))).toEqual(['oneline', 'unit']);
        // The checkouts they were made from still list them.
        expect(yield* labels(warm)).toEqual([
          'bible-tools',
          'bible-tools-batch',
          'oneline',
          'p5',
          'unit',
        ]);
        expect(yield* labels(path.join(rifts, 'p5'))).toEqual(['oneline', 'p5', 'unit']);
      }).pipe(Effect.scoped, Effect.provide(BunServices.layer)),
  );
});
