// The AudioWorklet capture in headless Chromium, with the browser's fake
// microphone playing a known tone (a 440 Hz sine at half scale, from a WAV
// the test writes). Chromium's fake microphone runs at 44.1 kHz, whatever the
// file's rate. The PCM comes back at the microphone's own rate, even where
// the output device runs at another (48 kHz, as on many Macs), as long as
// the recording ran, at the tone's level (peak 0.5, RMS 0.354: no gain
// control, no suppression); the meter moved while it ran and says closed
// after the stop. A browser that will not run the audio at the microphone's
// rate, or leaves a processing stage on, fails the capture in words. A page
// not allowed the microphone gets MicDenied in the owner's words.

import { BunServices } from '@effect/platform-bun';
import { Effect, Option } from 'effect';
import { describe, expect, it } from 'effect-bun-test';
import { type BrowserContext, chromium } from 'playwright-core';
import { solidPlugin } from '../../tools/solid-plugin.ts';
import type { ProbeSetup, Probed } from '../fixtures/capture-page.ts';
import { type ToneLayout, toneFile } from '../fixtures/tone.ts';

const ORIGIN = 'http://localhost';

/** The reviewer's microphone: 44.1 kHz, one channel. */
const MONO_44K: ToneLayout = { rate: 44100, channels: 'mono' };

/** A two-input interface: the voice on input 1, silence on input 2. */
const LEFT_ONLY_44K: ToneLayout = { rate: 44100, channels: 'left-only' };

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
const browserWithTone = (layout: ToneLayout) =>
  Effect.gen(function* () {
    const wav = yield* toneFile(3, 0.5, layout);
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

/** The capture page open in `context`, probed as `setup` says. */
const probe = (context: BrowserContext, setup: ProbeSetup) =>
  Effect.gen(function* () {
    const js = yield* script;
    const page = yield* Effect.promise(() => context.newPage());
    yield* Effect.promise(() =>
      page.route(`${ORIGIN}/**`, (r) => {
        if (new URL(r.request().url()).pathname === '/capture.js')
          return r.fulfill({ contentType: 'text/javascript; charset=utf-8', body: js });
        return r.fulfill({
          contentType: 'text/html',
          body: '<!doctype html><html><body><script src="/capture.js"></script></body></html>',
        });
      }),
    );
    yield* Effect.promise(() => page.goto(`${ORIGIN}/capture`));
    yield* Effect.promise(() => page.waitForFunction(() => 'captureProbe' in window));
    return yield* Effect.promise((): Promise<Probed> =>
      page.evaluate((s) => Reflect.get(window, 'captureProbe')(s), setup),
    );
  });

/** A probe of a page allowed the microphone, whose fake plays a tone of `layout`. */
const allowed = (layout: ToneLayout, setup: ProbeSetup) =>
  Effect.gen(function* () {
    const browser = yield* browserWithTone(layout);
    const context = yield* Effect.promise(() =>
      browser.newContext({ permissions: ['microphone'] }),
    );
    return yield* probe(context, setup);
  });

describe('the AudioWorklet capture', () => {
  it.live(
    'records the fake microphone at its own rate, unprocessed, with the meter moving',
    () =>
      Effect.gen(function* () {
        const probed = yield* allowed(MONO_44K, { seconds: 1 });
        expect(probed.refused).toBe('');
        expect(probed.trackRate).toBe(44100);
        expect(probed.rate).toBe(probed.trackRate);
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
    'a 44.1 kHz microphone on a machine whose output runs at 48 kHz records at 44.1 kHz, not resampled',
    () =>
      Effect.gen(function* () {
        const probed = yield* allowed(MONO_44K, { seconds: 1, outputRate: 48000 });
        expect(probed.refused).toBe('');
        expect(probed.trackRate).toBe(44100);
        expect(probed.rate).toBe(44100);
        expect(probed.frames).toBeGreaterThan(44100 * 0.9);
        expect(probed.frames).toBeLessThan(44100 * 1.3);
      }).pipe(Effect.scoped, Effect.provide(BunServices.layer)),
    30_000,
  );

  it.live(
    'a two-input interface records input 1 as it came: not mixed with input 2, not 6 dB down',
    () =>
      Effect.gen(function* () {
        const probed = yield* allowed(LEFT_ONLY_44K, { seconds: 1 });
        expect(probed.refused).toBe('');
        expect(probed.peak).toBeGreaterThan(0.45);
        expect(probed.peak).toBeLessThan(0.55);
        expect(probed.rms).toBeGreaterThan(0.3);
        expect(probed.rms).toBeLessThan(0.4);
      }).pipe(Effect.scoped, Effect.provide(BunServices.layer)),
    30_000,
  );

  it.live(
    'a microphone unplugged mid-take is noticed, and what was recorded before it is still handed back',
    () =>
      Effect.gen(function* () {
        const probed = yield* allowed(MONO_44K, { seconds: 1, lose: true });
        expect(probed.refused).toBe('');
        expect(probed.lost).toBe(true);
        expect(probed.frames).toBeGreaterThan(44100 * 0.9);
        expect(probed.peak).toBeGreaterThan(0.45);
      }).pipe(Effect.scoped, Effect.provide(BunServices.layer)),
    30_000,
  );

  it.live(
    'a stop whose last samples never arrive fails the take in words rather than cut it short',
    () =>
      Effect.gen(function* () {
        const probed = yield* allowed(MONO_44K, { seconds: 1, dropFlush: true });
        expect(probed.refused).toBe(
          'the recording stopped: its last samples never came from the audio thread, so the take would end short; record it again',
        );
      }).pipe(Effect.scoped, Effect.provide(BunServices.layer)),
    30_000,
  );

  it.live(
    'a browser that runs the audio at another rate than the microphone’s fails the capture, never resamples',
    () =>
      Effect.gen(function* () {
        const probed = yield* allowed(MONO_44K, { seconds: 1, stuckRate: 48000 });
        expect(probed.refused).toBe(
          'the recording stopped: the browser runs the audio at 48000 Hz, not the microphone’s 44100 Hz, and would resample every take; use Chrome or Firefox',
        );
      }).pipe(Effect.scoped, Effect.provide(BunServices.layer)),
    30_000,
  );

  it.live(
    'a browser that leaves a processing stage on fails the capture, naming it',
    () =>
      Effect.gen(function* () {
        const probed = yield* allowed(MONO_44K, { seconds: 1, processed: true });
        expect(probed.refused).toBe(
          'the recording stopped: the browser kept echo cancellation on though asked not to; use Chrome or Firefox',
        );
      }).pipe(Effect.scoped, Effect.provide(BunServices.layer)),
    30_000,
  );

  it.live(
    'a page not allowed the microphone gets MicDenied, in the owner’s words',
    () =>
      Effect.gen(function* () {
        const browser = yield* browserWithTone(MONO_44K);
        const context = yield* Effect.promise(() => browser.newContext());
        const probed = yield* probe(context, { seconds: 1 });
        expect(probed.refused).toBe(
          'no microphone: the browser was not allowed to use it; allow the microphone for this page',
        );
      }).pipe(Effect.scoped, Effect.provide(BunServices.layer)),
    30_000,
  );
});
