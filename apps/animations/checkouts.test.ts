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
    'are the folders whose root package is this one, a Rift’s warm source and siblings included',
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
        const all = ['bible-tools', 'oneline', 'p5', 'rbfscene', 'rimproto', 'seedanim'];
        expect(yield* labels(path.join(rifts, 'p5'))).toEqual(all);
        expect(yield* labels(path.join(home, 'bible-tools'))).toEqual(all);
        const [first] = yield* checkoutRootsOf(path.join(rifts, 'p5'));
        expect(first?.path).toBe(path.join(home, 'bible-tools', 'apps', 'animations', 'out'));
      }).pipe(Effect.scoped, Effect.provide(BunServices.layer)),
  );
});
