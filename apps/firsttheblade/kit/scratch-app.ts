/**
 * A copy of the app's served folders and the stills record in a scratch
 * folder, for the tests that change stills, modules or the record and read
 * what the stills rule (`./approval.ts`) finds. Removed when its scope
 * closes.
 */
import { Effect, FileSystem, Path } from 'effect';

import { RECORD } from './approval.ts';
import { SERVED_FOLDERS } from './served.ts';

export const scratchApp = Effect.fn('ScratchApp.make')(function* (app: string) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const root = yield* fs.makeTempDirectoryScoped({ prefix: 'stills-' });
  yield* Effect.forEach(SERVED_FOLDERS, (folder) =>
    fs.copy(path.join(app, folder), path.join(root, folder)),
  );
  yield* fs.makeDirectory(path.dirname(path.join(root, RECORD)), { recursive: true });
  yield* fs.copyFile(path.join(app, RECORD), path.join(root, RECORD));
  return root;
});
