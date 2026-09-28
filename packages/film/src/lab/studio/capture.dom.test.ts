// The AudioWorklet capture in headless Chromium, with the browser's fake
// microphone playing a known tone (a 440 Hz sine at half scale, from a WAV
// the test writes): the PCM comes back at the audio context's own rate, as
// long as the recording ran, at the tone's level (peak 0.5, RMS 0.354: no
// gain control, no suppression); the meter moved while it ran and says
// closed after the stop. A page not allowed the microphone gets MicDenied in
// the owner's words.

import { BunServices } from '@effect/platform-bun';
import { Effect, FileSystem, Option, Path } from 'effect';
import { describe, expect, it } from 'effect-bun-test';
import { type BrowserContext, chromium } from 'playwright-core';
import { solidPlugin } from '../../tools/solid-plugin.ts';
import type { Probed } from '../fixtures/capture-page.ts';

const ORIGIN = 'http://localhost';
const RATE = 48000;

/** A 16-bit mono WAV of `seconds` of a 440 Hz sine at half scale: the fake microphone's input. */
const tone = (seconds: number): Uint8Array => {
  const n = RATE * seconds;
  const bytes = new Uint8Array(44 + n * 2);
  const v = new DataView(bytes.buffer);
  const ascii = (at: number, s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(at + i, s.charCodeAt(i));
  };
  ascii(0, 'RIFF');
  v.setUint32(4, 36 + n * 2, true);
  ascii(8, 'WAVE');
  ascii(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, RATE, true);
  v.setUint32(28, RATE * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  ascii(36, 'data');
  v.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++)
    v.setInt16(
      44 + i * 2,
      Math.round(0.5 * 32767 * Math.sin((2 * Math.PI * 440 * i) / RATE)),
      true,
    );
  return bytes;
};

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
  const fs = yield* FileSystem.FileSystem;
  const dir = yield* fs.makeTempDirectoryScoped({ prefix: 'film-capture-' });
  const wav = (yield* Path.Path).join(dir, 'tone.wav');
  yield* fs.writeFile(wav, tone(3));
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
