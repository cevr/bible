// The AudioWorklet capture in headless Chrome, with the browser's fake
// microphone playing a known tone (`FAKE_MIC` in `browsers.ts`: a 440 Hz sine
// at half scale on input 1 of a two-input interface, input 2 silent).
// Chromium's fake microphone runs at 44.1 kHz, whatever the file's rate. The
// PCM comes back at the microphone's own rate, even where
// the output device runs at another (48 kHz, as on many Macs), as long as
// the recording ran, at the tone's level (peak 0.5, RMS 0.354: no gain
// control, no suppression); the meter moved while it ran and says closed
// after the stop. A browser that will not run the audio at the microphone's
// rate, or leaves a processing stage on, fails the capture in words. A page
// not allowed the microphone gets MicDenied in the owner's words.

import { Array as Arr, Effect } from 'effect';
import { describe, expect, it } from 'effect-bun-test';
import {
  asset,
  openTab,
  respond,
  scriptOf,
  servePaths,
} from '../../../src/lab/fixtures/browsers.ts';
import type { ProbeSetup, Probed } from '../../../src/lab/fixtures/capture-page.ts';
import { CLOCK_SCRIPT } from '../../../src/lab/fixtures/clock.ts';
import { bundleOf } from '../../../src/lab/fixtures/harness.ts';
import { jsonOf } from '../../../src/lab/fixtures/tab.ts';

const script = bundleOf('capture-page.ts');

/** The capture page in a tab of its own, allowed the microphone or not, probed as `setup` says. */
const probe = (microphone: boolean, setup: ProbeSetup) =>
  Effect.gen(function* () {
    const capture = asset('capture.js', respond(yield* script, 'text/javascript; charset=utf-8'));
    const page = yield* openTab({
      width: 800,
      height: 600,
      microphone,
      init: Arr.filter([CLOCK_SCRIPT], () => setup.dropFlush === true),
      assets: [capture],
      serve: servePaths({
        '/capture': respond(
          `<!doctype html><html><body>${scriptOf(capture)}</body></html>`,
          'text/html',
        ),
      }),
    });
    yield* page.goto('/capture');
    yield* page.until("'captureProbe' in window");
    if (setup.dropFlush === true) {
      // Let real PCM finish recording before advancing only the missing-flush deadline.
      // Do not hold an evaluate call open: the view serializes calls to the page.
      yield* page.evaluate(`globalThis.captureResult = captureProbe(${jsonOf(setup)}); undefined`);
      yield* page.until('globalThis.captureFlushLost === true');
      yield* page.clock.fastForward(1_000);
      return yield* page.evaluate<Probed>('globalThis.captureResult');
    }
    return yield* page.evaluate<Probed>(`captureProbe(${jsonOf(setup)})`);
  });

/** A probe of a page allowed the microphone. */
const allowed = (setup: ProbeSetup) => probe(true, setup);

describe('the AudioWorklet capture', () => {
  it.live(
    'records the fake microphone at its own rate, unprocessed, with the meter moving',
    () =>
      Effect.gen(function* () {
        const probed = yield* allowed({ seconds: 1 });
        expect(probed.refused).toBe('');
        expect(probed.trackRate).toBe(44100);
        expect(probed.rate).toBe(probed.trackRate);
        // The probe stops once a second of frames was kept: the stop hands back all of them.
        expect(probed.frames).toBeGreaterThanOrEqual(probed.rate);
        expect(probed.peak).toBeGreaterThan(0.45);
        expect(probed.peak).toBeLessThan(0.55);
        expect(probed.rms).toBeGreaterThan(0.3);
        expect(probed.rms).toBeLessThan(0.4);
        expect(probed.levels).toBeGreaterThan(10);
        expect(probed.loudest).toBeGreaterThan(0.45);
        expect(probed.closedAfter).toBe(true);
      }).pipe(Effect.scoped),
    30_000,
  );

  it.live(
    'a 44.1 kHz microphone on a machine whose output runs at 48 kHz records at 44.1 kHz, not resampled',
    () =>
      Effect.gen(function* () {
        const probed = yield* allowed({ seconds: 1, outputRate: 48000 });
        expect(probed.refused).toBe('');
        expect(probed.trackRate).toBe(44100);
        expect(probed.rate).toBe(44100);
        expect(probed.frames).toBeGreaterThanOrEqual(44100);
      }).pipe(Effect.scoped),
    30_000,
  );

  it.live(
    'a two-input interface records input 1 as it came: not mixed with input 2, not 6 dB down',
    () =>
      Effect.gen(function* () {
        const probed = yield* allowed({ seconds: 1 });
        expect(probed.refused).toBe('');
        expect(probed.peak).toBeGreaterThan(0.45);
        expect(probed.peak).toBeLessThan(0.55);
        expect(probed.rms).toBeGreaterThan(0.3);
        expect(probed.rms).toBeLessThan(0.4);
      }).pipe(Effect.scoped),
    30_000,
  );

  it.live(
    'a microphone unplugged mid-take is noticed, and what was recorded before it is still handed back',
    () =>
      Effect.gen(function* () {
        const probed = yield* allowed({ seconds: 1, lose: true });
        expect(probed.refused).toBe('');
        expect(probed.lost).toBe(true);
        expect(probed.frames).toBeGreaterThanOrEqual(44100);
        expect(probed.peak).toBeGreaterThan(0.45);
      }).pipe(Effect.scoped),
    30_000,
  );

  it.live(
    'a stop whose last samples never arrive fails the take in words rather than cut it short',
    () =>
      Effect.gen(function* () {
        const probed = yield* allowed({ seconds: 1, dropFlush: true });
        expect(probed.refused).toBe(
          'the recording stopped: its last samples never came from the audio thread, so the take would end short; record it again',
        );
      }).pipe(Effect.scoped),
    30_000,
  );

  it.live(
    'a browser that runs the audio at another rate than the microphone’s fails the capture, never resamples',
    () =>
      Effect.gen(function* () {
        const probed = yield* allowed({ seconds: 1, stuckRate: 48000 });
        expect(probed.refused).toBe(
          'the recording stopped: the browser runs the audio at 48000 Hz, not the microphone’s 44100 Hz, and would resample every take; use Chrome or Firefox',
        );
      }).pipe(Effect.scoped),
    30_000,
  );

  it.live(
    'a browser that leaves a processing stage on fails the capture, naming it',
    () =>
      Effect.gen(function* () {
        const probed = yield* allowed({ seconds: 1, processed: true });
        expect(probed.refused).toBe(
          'the recording stopped: the browser kept echo cancellation on though asked not to; use Chrome or Firefox',
        );
      }).pipe(Effect.scoped),
    30_000,
  );

  it.live(
    'a page not allowed the microphone gets MicDenied, in the owner’s words',
    () =>
      Effect.gen(function* () {
        const probed = yield* probe(false, { seconds: 1 });
        expect(probed.refused).toBe(
          'no microphone: the browser was not allowed to use it; allow the microphone for this page',
        );
      }).pipe(Effect.scoped),
    30_000,
  );
});
