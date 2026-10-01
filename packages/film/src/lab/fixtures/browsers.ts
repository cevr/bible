// The browser tests' Chromium: one per way of launching it, per test process.
// Every case that launches it the same way shares the process and opens its
// own context (its own pages, storage, permissions and clock), so cases stay
// apart while the launch, the slowest part of a case, is paid once per worker.
// A fake microphone is a launch flag, so each tone gets its own browser,
// shared by the cases that play that tone. Playwright kills what it launched
// when the test process exits.

import { BunServices } from '@effect/platform-bun';
import { Config, Effect, FileSystem, Option, Path } from 'effect';
import { type Browser, chromium } from 'playwright-core';
import { MONO_48K, type ToneLayout, tone } from './tone.ts';

/** The renderer's software 2D canvas (`tools/browser.ts`), as every test browser draws. */
const SOFTWARE_CANVAS = '--disable-accelerated-2d-canvas';

/** The fake origin the lab and review pages are served at (secure for the microphone). */
export const ORIGIN = 'http://lab.test';

const launched = new Map<string, Promise<Browser>>();

/** The browser `key` names: launched by `start` the first time a case asks for it. */
const once = (key: string, start: Effect.Effect<Browser>) =>
  Effect.promise(() =>
    Option.getOrElse(Option.fromUndefinedOr(launched.get(key)), () => {
      const started = Effect.runPromise(start);
      launched.set(key, started);
      return started;
    }),
  );

/** Plays media without a gesture: the test is the reviewer, and it never clicks first. */
const AUTOPLAY = '--autoplay-policy=no-user-gesture-required';

/** Headless Chromium, shared by the process. */
export const sharedBrowser = once(
  'headless',
  Effect.promise(() => chromium.launch({ args: [SOFTWARE_CANVAS, AUTOPLAY] })),
);

/** A fake microphone's tone: `seconds` of 440 Hz at `amplitude`, laid out as `layout`. */
export interface Tone {
  readonly seconds: number;
  readonly amplitude: number;
  readonly layout?: ToneLayout;
}

/**
 * `t` as a WAV in the system's temp folder, named by the tone: the same bytes
 * for every run and worker, so it is written whole (to a file of this
 * process's, then renamed over the name) and left for the next run.
 */
const toneFile = (t: Tone, layout: ToneLayout, name: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const temp = yield* Config.String('TMPDIR').pipe(Config.withDefault('/tmp'));
    const wav = (yield* Path.Path).join(temp, `film-tone-${name}.wav`);
    const own = `${wav}.${process.pid}`;
    yield* fs.writeFile(own, tone(t.seconds, t.amplitude, layout));
    yield* fs.rename(own, wav);
    return wav;
  }).pipe(Effect.orDie, Effect.provide(BunServices.layer));

/**
 * The full Chromium (the headless shell has no getUserMedia) with its fake
 * microphone playing `t`, shared by the cases that play the same tone. The
 * fake origin counts as secure, as localhost does.
 */
export const micBrowser = (t: Tone) => {
  const layout = t.layout ?? MONO_48K;
  const name = `${t.seconds}s-${t.amplitude}-${layout.rate}-${layout.channels}`;
  return once(
    `mic ${name}`,
    Effect.flatMap(toneFile(t, layout, name), (wav) =>
      Effect.promise(() =>
        chromium.launch({
          channel: 'chromium',
          args: [
            SOFTWARE_CANVAS,
            '--use-fake-device-for-media-stream',
            `--use-file-for-fake-audio-capture=${wav}`,
            `--unsafely-treat-insecure-origin-as-secure=${ORIGIN}`,
            AUTOPLAY,
          ],
        }),
      ),
    ),
  );
};
