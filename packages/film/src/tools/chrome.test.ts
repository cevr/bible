// Every Chrome the film tools and their browser tests spawn is silent: it is
// spawned by `chrome.ts` alone (`openView`), which adds `--mute-audio` and
// `--disable-audio-output` to whatever flags the caller asks for, so no launch
// can do without them. That a running Chrome carries them is read from its
// own command line by the browser tests (`e2e/lab/fixtures/browsers.dom.test.ts`).
// No Chromium.

import { BunServices } from '@effect/platform-bun';
import { describe, expect, it } from 'effect-bun-test';
import { Effect, FileSystem } from 'effect';
import { profileFolder } from './chrome-profile.ts';

/** The package's sources and browser tests, as this guard reads them. */
const PACKAGE = `${import.meta.dir}/../..`;

/** A Chrome spawned other than through `openView`. */
const SPAWNS = /new Bun\.WebView\(/;

describe('the Chrome a tool or test spawns', () => {
  it.effect.layer(BunServices.layer)('is spawned only by chrome.ts, which silences it', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const spawning = yield* Effect.forEach(['src', 'e2e'], (folder) =>
        Effect.flatMap(fs.readDirectory(`${PACKAGE}/${folder}`, { recursive: true }), (files) =>
          Effect.filter(
            files.filter((file) => /\.tsx?$/.test(file)).map((file) => `${folder}/${file}`),
            (file) =>
              Effect.map(fs.readFileString(`${PACKAGE}/${file}`), (text) => SPAWNS.test(text)),
          ),
        ),
      );
      expect(spawning.flat()).toEqual(['src/tools/chrome.ts']);
    }),
  );
});

/** A process id past every system's limit: no process runs as it. */
const STOPPED = 2 ** 30;

describe("a Chrome's profile folder", () => {
  it.effect.layer(BunServices.layer)(
    'is this process, after the folders of processes that stopped are removed',
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const root = yield* fs.makeTempDirectoryScoped();
          yield* fs.makeDirectory(`${root}/${STOPPED}/Default`, { recursive: true });
          yield* fs.makeDirectory(`${root}/${process.ppid}`);
          yield* fs.makeDirectory(`${root}/not-a-pid`);
          const folder = yield* profileFolder(root);
          expect(folder).toBe(`${root}/${process.pid}`);
          expect((yield* fs.readDirectory(root)).toSorted()).toEqual(
            [String(process.pid), String(process.ppid), 'not-a-pid'].toSorted(),
          );
        }),
      ),
  );
});
