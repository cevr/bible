// The studio in the real lab page, in Chromium with a fake microphone
// playing a tone, against fake studio routes. The beats list with their
// counts and badges; the teleprompter reads the selected beat's lines and
// its quotation with who said it; the attempts list with Keep only on one
// that can be kept. The whole take by the studio's keys: R counts in and
// records (the meter moves), Space stops, the recording plays back, K
// submits a lossless WAV at the context's rate; the server's TakeMismatch
// shows in its own words; K accepts it anyway; the take kept and mixed
// reloads the page at the same T, back on the same beat. Keep on an attempt
// keeps it, and a take whose mix failed stays to say so. ←/→ move between
// beats without moving the film; the lab's keys pass through. A mic too hot
// warns of clipping; a mic refused says so.

import { BunServices } from '@effect/platform-bun';
import { Effect, type FileSystem, Option, type Path, Result, type Scope } from 'effect';
import { Base64 } from 'effect/encoding';
import { TakeMismatch } from '../../core/refusals.ts';
import { describe, expect, it } from 'effect-bun-test';
import type { Page } from 'playwright-core';
import {
  type Asked,
  type FakeRoute,
  type Json,
  json,
  openLab,
  refused,
  route,
} from '../fixtures/harness.ts';
import { PROBE } from '../fixtures/probe-film.ts';
import { toneFile } from '../fixtures/tone.ts';
import { COUNT_IN } from './machine.ts';

const beat = (id: string, state: string, parts: Json, extra: Record<string, Json> = {}): Json => ({
  id,
  file: `${id}.wav`,
  parts,
  sources: [],
  state,
  recorded: state === 'recorded',
  attempts: 0,
  ...extra,
});

const BEATS: Json = {
  film: PROBE,
  beats: [
    beat('opening', 'recorded', [{ kind: 'line', text: 'In the beginning.' }]),
    beat('thesis', 'staging', [
      { kind: 'line', text: 'The law is holy.' },
      { kind: 'quotation', text: 'The law of the Lord is perfect.', by: 'David, Ps 19:7' },
    ]),
    beat('close', 'stale', [{ kind: 'line', text: 'Amen.' }], { staleReason: 'text changed' }),
  ],
};

const attempt = (file: string, kept: boolean, current: boolean): Json => ({
  file,
  heard: 'the law is holy',
  wer: 0,
  at: 0,
  duration: 2.5,
  kept,
  current,
});

const ATTEMPTS: Json = {
  beat: 'thesis',
  attempts: [
    attempt('thesis.new.flac', false, true),
    attempt('thesis.kept.flac', true, true),
    attempt('thesis.old.flac', false, false),
  ],
};

const MISMATCH = TakeMismatch.make({
  id: 'thesis',
  script: 'the law is holy',
  heard: 'the lord is light',
  wer: 0.4,
  attempt: 'thesis.abcd.flac',
});

const took = (file: string): Json => ({
  beat: 'thesis',
  take: { hash: 'h', file, duration: 2.5, words: [], source: 'recorded' },
  heard: 'the law is holy',
  wer: 0,
  timings: { voice: 'v', scenes: {} },
  // The newest attempt's mix fails: its keep stays on the page to say so.
  mixed: file !== 'thesis.new.flac',
});

const studioRoutes: ReadonlyArray<FakeRoute> = [
  route('GET', /^\/studio\/beats$/, () => json(BEATS)),
  route('GET', /^\/studio\/takes\/\w+\/attempts$/, () => json(ATTEMPTS)),
  route('POST', /^\/studio\/takes\/thesis$/, () => refused(MISMATCH)),
  route('POST', /^\/studio\/takes\/thesis\/keep$/, (asked) =>
    json(took(String(Reflect.get(Option.getOrElse(asked.body, () => ({})) as object, 'file')))),
  ),
];

const textOf = (page: Page, sel: string) =>
  Effect.promise(() => page.textContent(sel)).pipe(Effect.map((t) => t ?? ''));

/** Wait until the element at `sel` reads `pattern`: a settled value, never the first one drawn. */
const textIs = (page: Page, sel: string, pattern: RegExp) =>
  Effect.promise(() =>
    page.waitForFunction(
      ([source, at]) => new RegExp(source).test(document.querySelector(at)?.textContent ?? ''),
      [pattern.source, sel] as const,
      { timeout: 10_000 },
    ),
  );

/** Wait until the status line reads `pattern`. */
const statusIs = (page: Page, pattern: RegExp) => textIs(page, '[data-role="status"]', pattern);

/** Wait until the recording has kept at least `seconds` of the microphone, as its status counts. */
const recorded = (page: Page, seconds: number) =>
  Effect.promise(() =>
    page.waitForFunction(
      (least) => {
        const status = document.querySelector('[data-role="status"]')?.textContent ?? '';
        return Number(/^recording · (\d+(?:\.\d+)?) s/.exec(status)?.[1] ?? '-1') >= least;
      },
      seconds,
      { timeout: 10_000 },
    ),
  );

/**
 * Run the page's clock on by `ms`: its timers and frames run that much,
 * however slow the machine, so what a key would have started has started.
 */
const runClock = (page: Page, ms: number) => Effect.promise(() => page.clock.runFor(ms));

const press = (page: Page, key: string) => Effect.promise(() => page.keyboard.press(key));

/** The count-in, each second of it moved on by the page's clock, until the take records. */
const countedIn = (page: Page) =>
  Effect.gen(function* () {
    for (let n = COUNT_IN; n > 0; n--) {
      yield* statusIs(page, new RegExp(`^recording in ${n}…$`));
      yield* Effect.promise(() => page.clock.fastForward(1000));
    }
    yield* statusIs(page, /^recording · /);
  });

/** Focus the studio, as a click into it does. */
const focusStudio = (page: Page) => Effect.promise(() => page.focus('[data-role="studio"]'));

const posted = (asked: ReadonlyArray<Asked>, path: RegExp) =>
  asked.filter((a) => a.method === 'POST' && path.test(a.path));

/** The WAV's format fields: format, channels, rate, bits. */
const wavFormat = (base64: string) =>
  Result.map(Base64.decode(base64), (bytes) => {
    const v = new DataView(bytes.buffer, bytes.byteOffset);
    return {
      riff: String.fromCharCode(...bytes.subarray(0, 4)),
      format: v.getUint16(20, true),
      channels: v.getUint16(22, true),
      rate: v.getUint32(24, true),
      bits: v.getUint16(34, true),
    };
  });

const withMic = (amplitude: number, permissions: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    const wav = yield* toneFile(4, amplitude);
    return yield* openLab(studioRoutes, { hash: '#1', mic: { wav, permissions } });
  });

/** The film seconds `#T` holds. */
const shownT = (page: Page) =>
  Effect.promise(() =>
    page.evaluate(() => Number.parseFloat(location.hash.replace(/^#/, '').split('&')[0] ?? '')),
  );

const scoped = <A, E>(self: Effect.Effect<A, E, Scope.Scope | FileSystem.FileSystem | Path.Path>) =>
  self.pipe(Effect.scoped, Effect.provide(BunServices.layer));

describe('the studio', () => {
  it.live(
    'lists the beats, reads the selected one, and lists its attempts',
    () =>
      scoped(
        Effect.gen(function* () {
          const { page, errors } = yield* withMic(0.5, ['microphone']);
          yield* Effect.promise(() => page.waitForSelector('[data-beat="thesis"]'));
          expect(yield* textOf(page, '.studio-counts')).toBe('1 recorded · 1 staging · 1 stale');
          const badges = yield* Effect.promise(() =>
            page.$$eval('[data-role="badge"]', (els) => els.map((e) => e.textContent)),
          );
          expect(badges).toEqual(['recorded', 'staging', 'stale: text changed']);
          expect(yield* textOf(page, '[data-role="prompter"]')).toBe('In the beginning.');
          yield* Effect.promise(() => page.click('[data-beat="thesis"]'));
          yield* Effect.promise(() => page.waitForSelector('.studio-quotation cite'));
          expect(yield* textOf(page, '.studio-line')).toBe('The law is holy.');
          expect(yield* textOf(page, '.studio-quotation p')).toBe(
            'The law of the Lord is perfect.',
          );
          expect(yield* textOf(page, '.studio-quotation cite')).toBe('David, Ps 19:7');
          yield* Effect.promise(() => page.waitForSelector('.studio-attempt'));
          const rows = yield* Effect.promise(() =>
            page.$$eval('.studio-attempt', (els) =>
              els.map((e) => ({
                file: e.getAttribute('data-file'),
                line: e.querySelector('.studio-attempt-line')?.textContent,
                keep: !(e.querySelector('[data-act="keep"]') as HTMLButtonElement).disabled,
                src: e.querySelector('audio')?.getAttribute('src'),
              })),
            ),
          );
          expect(rows).toEqual([
            {
              file: 'thesis.new.flac',
              line: '“the law is holy” · 0.0% · 2.5 s',
              keep: true,
              src: `/lab/${PROBE}/studio/takes/thesis/attempts/thesis.new.flac`,
            },
            {
              file: 'thesis.kept.flac',
              line: '“the law is holy” · 0.0% · 2.5 s',
              keep: false,
              src: `/lab/${PROBE}/studio/takes/thesis/attempts/thesis.kept.flac`,
            },
            {
              file: 'thesis.old.flac',
              line: '“the law is holy” · 0.0% · 2.5 s',
              keep: false,
              src: `/lab/${PROBE}/studio/takes/thesis/attempts/thesis.old.flac`,
            },
          ]);
          expect(errors).toEqual([]);
        }),
      ),
    60_000,
  );

  it.live(
    'records by its keys, submits a lossless WAV, and accepts a mismatch anyway',
    () =>
      scoped(
        Effect.gen(function* () {
          const { page, asked, errors } = yield* withMic(0.5, ['microphone']);
          yield* Effect.promise(() => page.waitForSelector('[data-beat="thesis"]'));
          yield* Effect.promise(() => page.click('[data-beat="thesis"]'));
          yield* focusStudio(page);
          yield* press(page, 'r');
          yield* countedIn(page);
          // The meter reads its floor until the tone's chunks arrive: wait for the tone's level.
          yield* textIs(page, '[data-role="peak"]', /^peak −[5-7]\.\d dBFS$/);
          yield* recorded(page, 1.2);
          yield* press(page, ' ');
          yield* statusIs(page, /^review \d+\.\d s: hear it, then submit$/);
          const review = yield* Effect.promise(() =>
            page.$eval('[data-role="review"]', (a) => (a as HTMLAudioElement).src),
          );
          expect(review).toMatch(/^blob:/);
          // The browser reads the recording back as audio it can play, over a second long.
          yield* Effect.promise(() =>
            page.waitForFunction(
              () =>
                (document.querySelector('[data-role="review"]') as HTMLAudioElement).duration > 1,
              '',
              { timeout: 5000 },
            ),
          );
          expect(yield* Effect.promise(() => page.locator('.studio-meter-fill').count())).toBe(0);

          yield* press(page, 'k');
          yield* statusIs(page, /^take thesis says something else \(wer 40\.0%\)/);
          const [take] = posted(asked, /^\/studio\/takes\/thesis$/);
          const body = Option.getOrElse(
            Option.fromUndefinedOr(take).pipe(Option.flatMap((t) => t.body)),
            () => ({}),
          ) as { audio: string; type: string };
          expect(body.type).toBe('audio/wav');
          const contextRate = yield* Effect.promise(() =>
            page.evaluate(() => new AudioContext().sampleRate),
          );
          expect(Result.getOrUndefined(wavFormat(body.audio))).toEqual({
            riff: 'RIFF',
            format: 1,
            channels: 1,
            rate: contextRate,
            bits: 24,
          });
          const tone = yield* Effect.promise(() =>
            page.getAttribute('[data-role="status"]', 'data-tone'),
          );
          expect(tone).toBe('refused');
          const accept = yield* textOf(page, '[data-act="acceptAnyway"]');
          expect(accept).toBe('Accept anyway (K)');

          // The take kept and mixed: the page loads again, at the same T, on the same beat.
          const beatsBefore = asked.filter((a) => a.path === '/studio/beats').length;
          const loaded = page.waitForEvent('load');
          yield* press(page, 'k');
          yield* Effect.promise(() => loaded);
          const [keep] = posted(asked, /^\/studio\/takes\/thesis\/keep$/);
          expect(
            Option.getOrUndefined(Option.fromUndefinedOr(keep).pipe(Option.flatMap((k) => k.body))),
          ).toEqual({
            file: 'thesis.abcd.flac',
            acceptMismatch: true,
          });
          yield* Effect.promise(() => page.waitForSelector('[data-beat="thesis"].selected'));
          expect(yield* shownT(page)).toBe(1);
          expect(asked.filter((a) => a.path === '/studio/beats').length).toBeGreaterThan(
            beatsBefore,
          );
          // The reload keeps the studio's keys: R records with no click back into it.
          yield* press(page, 'r');
          yield* statusIs(page, /^recording in [123]…$/);
          yield* press(page, 'Escape');
          yield* statusIs(page, /^ready/);
          expect(errors).toEqual([]);
        }),
      ),
    60_000,
  );

  it.live(
    'keeps an earlier attempt',
    () =>
      scoped(
        Effect.gen(function* () {
          const { page, asked } = yield* withMic(0.5, ['microphone']);
          yield* Effect.promise(() => page.waitForSelector('[data-beat="thesis"]'));
          yield* Effect.promise(() => page.click('[data-beat="thesis"]'));
          yield* Effect.promise(() =>
            page.click('[data-file="thesis.new.flac"] [data-act="keep"]'),
          );
          yield* statusIs(
            page,
            /^kept thesis\.new\.flac: heard “the law is holy” · 0\.0% words differ · the mix failed; the lab log says why$/,
          );
          // The attempts are read again after the keep.
          expect(
            asked.filter((a) => a.path === '/studio/takes/thesis/attempts').length,
          ).toBeGreaterThan(1);
          const [keep] = posted(asked, /^\/studio\/takes\/thesis\/keep$/);
          expect(
            Option.getOrUndefined(Option.fromUndefinedOr(keep).pipe(Option.flatMap((k) => k.body))),
          ).toEqual({
            file: 'thesis.new.flac',
            acceptMismatch: false,
          });
        }),
      ),
    60_000,
  );

  it.live(
    'takes its keys only while it has focus: ←/→ move between beats, not the film',
    () =>
      scoped(
        Effect.gen(function* () {
          const { page } = yield* openLab(studioRoutes, {
            hash: '#1',
            mic: { wav: yield* toneFile(4, 0.5), permissions: ['microphone'] },
          });
          yield* Effect.promise(() => page.waitForSelector('[data-beat="thesis"]'));
          const playLabel = () => textOf(page, '[data-act="play"]');
          const paused = yield* playLabel();
          yield* focusStudio(page);
          yield* press(page, 'ArrowRight');
          yield* Effect.promise(() => page.waitForSelector('[data-beat="thesis"].selected'));
          yield* press(page, 'ArrowRight');
          yield* Effect.promise(() => page.waitForSelector('[data-beat="close"].selected'));
          // At the last beat → and Space (nothing to stop) are still the studio's: the film holds.
          yield* press(page, 'ArrowRight');
          yield* press(page, ' ');
          yield* runClock(page, 300);
          expect(yield* shownT(page)).toBe(1);
          expect(yield* playLabel()).toBe(paused);
          expect(
            yield* Effect.promise(() => page.locator('[data-beat="close"].selected').count()),
          ).toBe(1);
          // Out of the studio the lab's keys are the lab's again: → steps the film, not the beat.
          yield* Effect.promise(() =>
            page.evaluate(() => (document.activeElement as HTMLElement).blur()),
          );
          yield* press(page, 'Shift+ArrowRight');
          yield* Effect.promise(() =>
            page.waitForFunction(
              () => Number.parseFloat(location.hash.replace(/^#/, '').split('&')[0] ?? '') === 2,
            ),
          );
          expect(yield* shownT(page)).toBe(2);
          expect(
            yield* Effect.promise(() => page.locator('[data-beat="close"].selected').count()),
          ).toBe(1);
        }),
      ),
    60_000,
  );

  it.live(
    'keeps its keys when the button clicked goes: Record clicked, Space stops the take, not the film',
    () =>
      scoped(
        Effect.gen(function* () {
          const { page, errors } = yield* withMic(0.5, ['microphone']);
          yield* Effect.promise(() => page.waitForSelector('[data-beat="thesis"]'));
          yield* Effect.promise(() => page.click('[data-beat="thesis"]'));
          const playLabel = () => textOf(page, '[data-act="play"]');
          const paused = yield* playLabel();
          yield* Effect.promise(() => page.click('[data-act="arm"]'));
          yield* countedIn(page);
          yield* recorded(page, 0.6);
          yield* press(page, ' ');
          yield* statusIs(page, /^review \d+\.\d s: hear it, then submit$/);
          expect(yield* shownT(page)).toBe(1);
          expect(yield* playLabel()).toBe(paused);
          expect(errors).toEqual([]);
        }),
      ),
    60_000,
  );

  it.live(
    'keeps an attempt’s row (and its player) while the recorder moves',
    () =>
      scoped(
        Effect.gen(function* () {
          const { page } = yield* withMic(0.5, ['microphone']);
          yield* Effect.promise(() => page.waitForSelector('[data-beat="thesis"]'));
          yield* Effect.promise(() => page.click('[data-beat="thesis"]'));
          yield* Effect.promise(() => page.waitForSelector('[data-file="thesis.new.flac"] audio'));
          // Mark the row's player; a row built again would lose the mark.
          yield* Effect.promise(() =>
            page.$eval('[data-file="thesis.new.flac"] audio', (a) =>
              Reflect.set(a, 'filmMark', true),
            ),
          );
          yield* focusStudio(page);
          yield* press(page, 'r');
          yield* statusIs(page, /^recording in [123]…$/);
          yield* press(page, 'Escape');
          yield* statusIs(page, /^ready/);
          const marked = yield* Effect.promise(() =>
            page.$eval('[data-file="thesis.new.flac"] audio', (a) => Reflect.get(a, 'filmMark')),
          );
          expect(marked).toBe(true);
        }),
      ),
    60_000,
  );

  it.live(
    'shows a remembered microphone that is gone as gone, and Default picks the default again',
    () =>
      scoped(
        Effect.gen(function* () {
          const { page } = yield* withMic(0.5, ['microphone']);
          yield* Effect.promise(() => page.waitForSelector('[data-beat="thesis"]'));
          yield* Effect.promise(() =>
            page.evaluate(() => window.localStorage.setItem('film-lab-mic', 'film-probe-gone')),
          );
          yield* Effect.promise(() => page.reload());
          yield* Effect.promise(() =>
            page.waitForSelector('[data-field="mic"] option[value="film-probe-gone"]', {
              state: 'attached',
              timeout: 10_000,
            }),
          );
          const shown = yield* Effect.promise(() =>
            page.$eval(
              '[data-field="mic"]',
              (s) => (s as HTMLSelectElement).selectedOptions[0]?.textContent,
            ),
          );
          expect(shown).toBe('the microphone picked before (not connected)');
          yield* Effect.promise(() => page.selectOption('[data-field="mic"]', ''));
          const stored = yield* Effect.promise(() =>
            page.evaluate(() => window.localStorage.getItem('film-lab-mic')),
          );
          expect(stored).toBe('');
        }),
      ),
    60_000,
  );

  it.live(
    'warns of clipping when the microphone runs too hot',
    () =>
      scoped(
        Effect.gen(function* () {
          const { page } = yield* withMic(0.99, ['microphone']);
          yield* Effect.promise(() => page.waitForSelector('[data-beat="thesis"]'));
          yield* focusStudio(page);
          yield* press(page, 'r');
          yield* Effect.promise(() =>
            page.waitForSelector('[data-role="clip"]', { timeout: 10_000 }),
          );
          expect(yield* textOf(page, '[data-role="clip"]')).toBe('clipping: turn the input down');
          yield* press(page, 'Escape');
          yield* statusIs(page, /^ready/);
        }),
      ),
    60_000,
  );

  it.live(
    'shows a refused microphone in the owner’s words',
    () =>
      scoped(
        Effect.gen(function* () {
          const { page } = yield* withMic(0.5, []);
          yield* Effect.promise(() => page.waitForSelector('[data-beat="thesis"]'));
          yield* focusStudio(page);
          yield* press(page, 'r');
          yield* statusIs(page, /^no microphone: /);
          expect(yield* textOf(page, '[data-role="status"]')).toBe(
            'no microphone: the browser was not allowed to use it; allow the microphone for this page',
          );
        }),
      ),
    60_000,
  );
});
