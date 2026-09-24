/**
 * The Docker build context EGW Search ships, made fresh on every plan and
 * deploy.
 *
 * Alchemy reads a local context by walking it in full before it applies the
 * ignore file (`alchemy/src/Railway/local-context.ts`, `selectedEntries`).
 * With the monorepo root as the context, that walk crossed about 550,000
 * entries, most of them `node_modules`. It took 18 of the 62 seconds a deploy
 * took. Here `turbo prune --docker` writes only the files git tracks for
 * `@bible/egw-search` and its workspace dependencies, about 330 entries, in
 * a fraction of a second. The image then has no prune stage of its own.
 *
 * The layout is turbo's: `json/` holds the manifests and the pruned
 * lockfile, and `full/` holds the sources. The root `tsconfig.json`, the
 * Dockerfile and its ignore file are copied beside them. The directory is
 * git-ignored and replaced on every run.
 */
import { BunServices } from '@effect/platform-bun';
import { Data, Effect, FileSystem, Path } from 'effect';
import { ChildProcess, ChildProcessSpawner } from 'effect/unstable/process';

/** The Dockerfile's path inside the context. */
export const DOCKERFILE = 'Dockerfile';

/** `turbo prune` did not write the context. */
export class PruneFailed extends Data.TaggedError('PruneFailed')<{ readonly exitCode: number }> {}

/** Writes the context and returns its path. A failed prune stops the stack. */
export const makeContext = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  const infra = yield* path.fromFileUrl(new URL('.', import.meta.url));
  const app = path.dirname(infra);
  const root = path.resolve(app, '../..');
  const context = path.join(app, '.deploy');

  yield* fs.remove(context, { recursive: true, force: true });
  const exitCode = yield* Effect.scoped(
    Effect.flatMap(
      spawner.spawn(
        ChildProcess.make(
          'bun',
          ['x', 'turbo', 'prune', '@bible/egw-search', '--docker', '--out-dir', context],
          { cwd: root, stdout: 'ignore', stderr: 'inherit' },
        ),
      ),
      (handle) => handle.exitCode,
    ),
  );
  if (exitCode !== 0) {
    return yield* new PruneFailed({ exitCode });
  }
  yield* fs.copyFile(path.join(root, 'tsconfig.json'), path.join(context, 'tsconfig.json'));
  yield* fs.copyFile(path.join(infra, 'Dockerfile'), path.join(context, DOCKERFILE));
  yield* fs.copyFile(
    path.join(infra, 'Dockerfile.dockerignore'),
    path.join(context, `${DOCKERFILE}.dockerignore`),
  );
  return context;
}).pipe(Effect.provide(BunServices.layer));
