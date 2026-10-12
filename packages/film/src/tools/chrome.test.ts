// Every Chrome the film tools and their browser tests spawn is silent: the
// flags it is spawned with lead with `--mute-audio` and `--disable-audio-output`
// (no page heard, the host's output device never opened) whatever the caller asks
// for (the renderer's, the browser tests'), and `chrome.ts` is the one place
// that spawns one, so no launch can do without them. No Chromium.

import { BunServices } from '@effect/platform-bun';
import { describe, expect, it, test } from 'effect-bun-test';
import { Effect, FileSystem } from 'effect';
import { launchArgs } from './browser.ts';
import { chromeArgs } from './chrome.ts';

/** The package's sources and browser tests, as this guard reads them. */
const PACKAGE = `${import.meta.dir}/../..`;

/** A Chrome spawned other than through `openView`. */
const SPAWNS = /new Bun\.WebView\(/;

describe('the Chrome a tool or test spawns', () => {
  test('is spawned silent, with the flags its caller asks for after it', () => {
    for (const asked of [launchArgs('darwin'), launchArgs('linux'), []])
      expect(chromeArgs(asked)).toEqual(['--mute-audio', '--disable-audio-output', ...asked]);
  });

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
