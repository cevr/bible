/** Puts onnxruntime's dylib where the compiled binary's dlopen looks.
 *
 *  A `bun build --compile` binary embeds `onnxruntime_binding.node` and Bun
 *  extracts it into the OS temp dir on first load. The binding links
 *  `@rpath/libonnxruntime.<version>.dylib` with `@loader_path` as its rpath —
 *  so dlopen searches *the temp dir*, where nothing put the library, and the
 *  vector leg degrades to §9.6's `embedder` absence. The build stages the
 *  dylib under `data/onnxruntime/` beside the binary; this copies it into the
 *  temp dir before the model loads.
 *
 *  In the workspace (`bun src/main.ts`) the binding loads from
 *  `node_modules` with the dylib beside it, no staged `data/onnxruntime/`
 *  exists, and this is a no-op. Every failure is swallowed: this is a repair
 *  step for one packaging seam, and the embedder's own typed absence is the
 *  honest report when the repair could not happen.
 */

import { Config, Effect, FileSystem, Option, Path } from 'effect';

import { packagedDataCandidates } from './paths.js';

/** Where Bun extracts embedded `.node` files: the platform temp dir, which on
 *  macOS is `$TMPDIR` (a per-user `/var/folders/…/T/`). */
const tempDir: Config.Config<string> = Config.String('TMPDIR').pipe(Config.withDefault('/tmp'));

export const ensureOnnxDylibs: Effect.Effect<void, never, FileSystem.FileSystem | Path.Path> =
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;

    const candidates = packagedDataCandidates('onnxruntime');
    let staged = Option.none<string>();
    for (const candidate of candidates) {
      if (yield* fs.exists(candidate).pipe(Effect.orElseSucceed(() => false))) {
        staged = Option.some(candidate);
        break;
      }
    }
    // The workspace case: nothing staged, nothing to repair.
    if (Option.isNone(staged)) return;

    const destination = yield* tempDir;
    const entries = yield* fs.readDirectory(staged.value);
    for (const entry of entries) {
      if (!entry.endsWith('.dylib')) continue;
      const target = path.join(destination, entry);
      if (yield* fs.exists(target).pipe(Effect.orElseSucceed(() => false))) continue;
      yield* fs.copyFile(path.join(staged.value, entry), target).pipe(Effect.ignore);
    }
  }).pipe(Effect.ignore);
