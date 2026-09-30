// `film media push` as it is run, into the fixture library's folder store
// under a temporary home: two renders with one name in two film folders are
// kept apart, each under its path below FILMS_OUT, and a key the store holds
// with other bytes is refused, not replaced. Synthetic files only; the store
// is a folder, so nothing leaves the machine.

import { BunServices } from '@effect/platform-bun';
import { describe, expect, it } from 'effect-bun-test';
import { Effect, FileSystem, Path } from 'effect';
import { runCli, spawnBudget } from './cli-run.ts';

describe('film media push', () => {
  it.effect.layer(BunServices.layer)(
    'keeps two renders of one name apart, and refuses a key held with other bytes',
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const home = yield* fs.makeTempDirectoryScoped({ prefix: 'media-push-' });
        const out = path.join(home, 'out');
        const env = { HOME: home, FILMS_OUT: out };
        const sheet = (film: string) => path.join(out, film, 'contact.jpg');
        for (const film of ['a', 'b']) {
          yield* fs.makeDirectory(path.join(out, film), { recursive: true });
          yield* fs.writeFileString(sheet(film), `the contact sheet of ${film}`);
        }
        const store = path.join(home, 'film-media', 'fixture-sounds', 'renders');

        const pushed = yield* runCli(env, ['media', 'push', sheet('a'), sheet('b')]);
        expect(pushed.exitCode).toBe(0);
        expect(yield* fs.readFileString(path.join(store, 'a', 'contact.jpg'))).toBe(
          'the contact sheet of a',
        );
        expect(yield* fs.readFileString(path.join(store, 'b', 'contact.jpg'))).toBe(
          'the contact sheet of b',
        );

        // Both named into one folder: the second would replace the first, so it is refused.
        yield* runCli(env, ['media', 'push', '--under', 'kept', sheet('a')]);
        const taken = yield* runCli(env, ['media', 'push', '--under', 'kept', sheet('b')]);
        expect(taken.exitCode).not.toBe(0);
        expect(taken.out).toContain('StoreKeyTaken');
        expect(yield* fs.readFileString(path.join(store, 'kept', 'contact.jpg'))).toBe(
          'the contact sheet of a',
        );
      }).pipe(Effect.scoped),
    spawnBudget(3),
  );
});
