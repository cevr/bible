// A wedge's film module, for the one leg that draws in this process (`check
// --draw --level`): the film's module built with the palette swapped
// (`paletteSwaps`, `wedge.ts`) and imported, so the look it does not play is
// the one drawn. Apart from `wedge.ts` because it imports a film: the lab
// reads `wedge.ts`, and the lab imports no film (`lab.test.ts`).

import { Array as Arr, Effect, FileSystem, Option, Path } from 'effect';
import { PagesBroken } from '../core/easel.ts';
import { importFilmModule } from './film-repo.ts';
import { bunModule } from './lab-page.ts';

/** The folder, in a film's output folder, a wedge's modules are built into for one check (`wedgedModule`). */
export const WEDGE_DIR = '.wedge';

/**
 * The module `file` as this process imports it for `swaps`: as written, for
 * none; for a wedge, built with each of `swaps` read as its text
 * (`bunModule`), written into a fresh folder under `dir` (inside the app, so
 * the packages it imports resolve from there as they do from the film),
 * imported, and the folder removed when the scope closes. A build that
 * fails, or reads none of `swaps`, is `PagesBroken`.
 */
export const wedgedModule = Effect.fn('wedge.module')(function* (
  file: string,
  dir: string,
  swaps: ReadonlyMap<string, string>,
) {
  const broken = (reason: string) => PagesBroken.make({ reason });
  if (swaps.size === 0)
    return yield* Effect.tryPromise({
      try: (): Promise<unknown> => importFilmModule(file),
      catch: (cause) => broken(String(cause)),
    });
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const outputs = yield* bunModule(path, file, swaps).pipe(
    Effect.mapError((failed) => broken(failed.reason)),
  );
  const into = yield* fs.makeDirectory(dir, { recursive: true }).pipe(
    Effect.andThen(fs.makeTempDirectoryScoped({ directory: dir, prefix: 'check-' })),
    Effect.mapError((error) => broken(error.message)),
  );
  yield* Effect.forEach(outputs, (out) => fs.writeFile(path.join(into, out.path), out.bytes)).pipe(
    Effect.mapError((error) => broken(error.message)),
  );
  const entry = Arr.findFirst(outputs, (out) => out.path.endsWith('.js'));
  if (Option.isNone(entry)) return yield* broken(`the build of ${file} made no module`);
  yield* Effect.log(
    `check.wedge.built module=${path.basename(file)} swaps=${[...swaps.keys()].map((f) => path.basename(f)).join(',')}`,
  );
  return yield* Effect.tryPromise({
    try: (): Promise<unknown> => importFilmModule(path.join(into, entry.value.path)),
    catch: (cause) => broken(String(cause)),
  });
});
