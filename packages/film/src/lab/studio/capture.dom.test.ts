// The AudioWorklet capture in headless Chromium, with the browser's fake
// microphone playing a known tone (a 440 Hz sine at half scale, from a WAV
// the test writes): the PCM comes back at the audio context's own rate, as
// long as the recording ran, at the tone's level (peak 0.5, RMS 0.354: no
// gain control, no suppression); the meter moved while it ran and says
// closed after the stop. A page not allowed the microphone gets MicDenied in
// the owner's words.

import { BunServices } from '@effect/platform-bun';
import { Effect, Option } from 'effect';
import { describe, expect, it } from 'effect-bun-test';
import { type BrowserContext, chromium } from 'playwright-core';
import { solidPlugin } from '../../tools/solid-plugin.ts';
import type { Probed } from '../fixtures/capture-page.ts';
import { toneFile } from '../fixtures/tone.ts';

const ORIGIN = 'http://localhost';

const script = Effect.promise(() =>
  Bun.build({
    entrypoints: [`${import.meta.dir}/../fixtures/capture-page.ts`],
    target: 'browser',
    format: 'iife',
    plugins: [solidPlugin],
  }),
).pipe(
  Effect.flatMap((built) =>
    Option.match(Option.fromUndefinedOr(built.outputs[0]), {
      onNone: () => Effect.die(`capture page did not bundle: ${built.logs.join('\n')}`),
      onSome: (out) => Effect.promise(() => out.text()),
    }),
  ),
);

/** A browser whose fake microphone plays the tone; closed with the scope. */
const browserWithTone = Effect.gen(function* () {
  const wav = yield* toneFile(3, 0.5);
  return yield* Effect.acquireRelease(
    Effect.promise(() =>
      chromium.launch({
        channel: 'chromium',
        args: [
          '--use-fake-device-for-media-stream',
          `--use-file-for-fake-audio-capture=${wav}`,
          '--autoplay-policy=no-user-gesture-required',
        ],
      }),
    ),
    (b) => Effect.promise(() => b.close()),
  );
});

/** The capture page open in `context`, probed for `seconds` of recording. */
const probe = (context: BrowserContext, seconds: number) =>
  Effect.gen(function* () {
    const js = yield* script;
    const page = yield* Effect.promise(() => context.newPage());
    yield* Effect.promise(() =>
      page.route(`${ORIGIN}/**`, (r) => {
        if (new URL(r.request().url()).pathname === '/capture.js')
          return r.fulfill({ contentType: 'text/javascript', body: js });
        return r.fulfill({
          contentType: 'text/html',
          body: '<!doctype html><html><body><script src="/capture.js"></script></body></html>',
        });
      }),
    );
    yield* Effect.promise(() => page.goto(`${ORIGIN}/capture`));
    yield* Effect.promise(() => page.waitForFunction(() => 'captureProbe' in window));
    return yield* Effect.promise((): Promise<Probed> =>
      page.evaluate((s) => Reflect.get(window, 'captureProbe')(s), seconds),
    );
  });

describe('the AudioWorklet capture', () => {
  it.live(
    'records the fake microphone at the context rate, unprocessed, with the meter moving',
    () =>
      Effect.gen(function* () {
        const browser = yield* browserWithTone;
        const context = yield* Effect.promise(() =>
          browser.newContext({ permissions: ['microphone'] }),
        );
        const probed = yield* probe(context, 1);
        expect(probed.refused).toBe('');
        expect(probed.rate).toBe(probed.contextRate);
        expect(probed.frames).toBeGreaterThan(probed.rate * 0.9);
        expect(probed.frames).toBeLessThan(probed.rate * 1.3);
        expect(probed.peak).toBeGreaterThan(0.45);
        expect(probed.peak).toBeLessThan(0.55);
        expect(probed.rms).toBeGreaterThan(0.3);
        expect(probed.rms).toBeLessThan(0.4);
        expect(probed.levels).toBeGreaterThan(10);
        expect(probed.loudest).toBeGreaterThan(0.45);
        expect(probed.closedAfter).toBe(true);
      }).pipe(Effect.scoped, Effect.provide(BunServices.layer)),
    30_000,
  );

  it.live(
    'a page not allowed the microphone gets MicDenied, in the owner’s words',
    () =>
      Effect.gen(function* () {
        const browser = yield* browserWithTone;
        const context = yield* Effect.promise(() => browser.newContext());
        const probed = yield* probe(context, 1);
        expect(probed.refused).toBe(
          'no microphone: the browser was not allowed to use it; allow the microphone for this page',
        );
      }).pipe(Effect.scoped, Effect.provide(BunServices.layer)),
    30_000,
  );
});
