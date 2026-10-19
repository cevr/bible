// The repo's tsc, found as the package's `typecheck` finds it.

import { fileURLToPath } from 'node:url';

import { Effect, FileSystem, Path, Schema } from 'effect';

/** The part of TypeScript's package.json that names its compiler's script. */
const TypeScriptPackage = Schema.fromJsonString(
  Schema.Struct({ bin: Schema.Struct({ tsc: Schema.String }) }),
);

/** The repo's tsc, the one the package's `typecheck` runs: its script's path. */
export const tscScript = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const manifest = fileURLToPath(import.meta.resolve('typescript/package.json'));
  const { bin } = yield* Schema.decodeEffect(TypeScriptPackage)(yield* fs.readFileString(manifest));
  return path.join(path.dirname(manifest), bin.tsc);
});
