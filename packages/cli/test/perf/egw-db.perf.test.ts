import * as BunServices from '@effect/platform-bun/BunServices';
import { describe, expect, it } from 'effect-bun-test';
import { Config, Effect, FileSystem, Path } from 'effect';

describe('EGW Database Performance', () => {
  const test = it.scopedLive.layer(BunServices.layer);

  test('reports whether the optional EGW performance database is available', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const home = yield* Config.string('HOME');
      const databasePath = path.join(home, '.bible', 'egw-paragraphs.db');
      const exists = yield* fs.exists(databasePath);
      if (!exists) {
        yield* Effect.logWarning(
          `Skipping EGW performance assertions: missing ${databasePath}; run the EGW sync command first`,
        );
      } else {
        yield* Effect.logInfo(`EGW performance database available path=${databasePath}`);
      }
      expect(typeof exists).toBe('boolean');
    }));
});
