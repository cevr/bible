import { NodeRuntime, NodeServices } from '@effect/platform-node';
import { Data, Effect, FileSystem, Path } from 'effect';
import { build } from 'esbuild';

class MainBundleError extends Data.TaggedError('MainBundleError')<{
  readonly cause: unknown;
}> {}

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
        //
        // `@huggingface/transformers` is external for the same reason and one
        // more: it depends on `onnxruntime-node`, which ships a prebuilt
        // `.node` binding per platform *and architecture*, so bundling it would
        // pull every platform's binary into this build — including the Windows
        // ones — and fail on the first of them for want of a loader. §9.5's
        // embedder loads it lazily at runtime, so the require() resolves
        // against the node_modules copy electron-builder ships, exactly as
        // better-sqlite3's does.
        external: ['electron', 'better-sqlite3', '@huggingface/transformers', 'onnxruntime-node'],
        loader: { '.sql': 'text' },
        sourcemap: true,
        logLevel: 'info',
      }),
    catch: (cause) => new MainBundleError({ cause }),
  });
}).pipe(Effect.provide(NodeServices.layer));

NodeRuntime.runMain(program);
