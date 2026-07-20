import { NodeRuntime, NodeServices } from '@effect/platform-node';
import { Effect, FileSystem, Path } from 'effect';
import { build } from 'esbuild';

const program = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const root = path.resolve(import.meta.dirname, '..');
  const outdir = path.join(root, 'dist', 'main');

  yield* fs.remove(outdir, { recursive: true, force: true });

  yield* Effect.tryPromise({
    try: () =>
      build({
        entryPoints: [
          path.join(root, 'electron', 'main.ts'),
          path.join(root, 'electron', 'preload.ts'),
        ],
        outdir,
        outExtension: { '.js': '.cjs' },
        bundle: true,
        platform: 'node',
        format: 'cjs',
        target: 'node20',
        // better-sqlite3 ships a native .node binding; can't be bundled. esbuild
        // would also try to inline the prebuilt-install fallback paths and produce
        // a broken bundle. Keep it as an extern so the require() resolves at runtime
        // against the node_modules copy electron-builder ships.
        external: ['electron', 'better-sqlite3'],
        loader: { '.sql': 'text' },
        sourcemap: true,
        logLevel: 'info',
      }),
    catch: (cause) => cause,
  });
}).pipe(Effect.provide(NodeServices.layer));

NodeRuntime.runMain(program);
