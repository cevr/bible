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
import { Effect, type FileSystem, Option, type Path, Result, Schedule, type Scope } from 'effect';
import { Base64 } from 'effect/encoding';
import { TakeMismatch } from '../../../src/core/refusals.ts';
import { describe, expect, it } from 'effect-bun-test';
import type { Tab } from '../../../src/lab/fixtures/tab.ts';
import {
  type Asked,
  type FakeRoute,
  type Json,
  json,
  openLab,
  refused,
  route,
} from '../../../src/lab/fixtures/harness.ts';
import { PROBE } from '../../../src/lab/fixtures/probe-film.ts';
import {
  attached,
  attributeIs,
  attributesAre,
  countIs,
  evaluates,
  textIs,
  textsAre,
  until,
} from '../../../src/lab/fixtures/settled.ts';
import { COUNT_IN } from '../../../src/lab/studio/machine.ts';

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
  transcript: 'the law is holy',
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
  transcript: 'the law is holy',
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

/** The play button's label while the film is paused. */
const PAUSED = '▶︎';

/**
 * How often the page has asked for `path`, once it has more than `least`
 * times: a request the page makes after what it shows (a list read again).
 */
const askedMoreThan = (asked: ReadonlyArray<Asked>, path: string, least: number) =>
  Effect.sync(() => asked.filter((a) => a.path === path).length).pipe(
    Effect.repeat({ until: (n) => n > least, schedule: Schedule.spaced('20 millis') }),
    Effect.timeout('10 seconds'),
  );

/** Wait until the status line reads `pattern`. */
const statusIs = (page: Tab, pattern: RegExp) => textIs(page, '[data-role="status"]', pattern);

/** Wait until the recording has kept at least `seconds` of the microphone, as its status counts. */
const recorded = (page: Tab, seconds: number) =>
  page.until(`(() => {
    const status = document.querySelector('[data-role="status"]')?.textContent ?? '';
    return Number(/^recording · (\\d+(?:\\.\\d+)?) s/.exec(status)?.[1] ?? '-1') >= ${seconds};
  })()`);

/**
 * Run the page's clock on by `ms`: its timers and frames run that much,
 * however slow the machine, so what a key would have started has started.
 */
const runClock = (page: Tab, ms: number) => page.clock.runFor(ms);

const press = (page: Tab, key: string) => page.press(key);

/** The count-in, each second of it moved on by the page's clock, until the take records. */
const countedIn = (page: Tab) =>
  Effect.gen(function* () {
    for (let n = COUNT_IN; n > 0; n--) {
      yield* statusIs(page, new RegExp(`^recording in ${n}…$`));
      yield* page.clock.fastForward(1000);
    }
    yield* statusIs(page, /^recording · /);
  });

/** Focus the studio, as a click into it does. */
const focusStudio = (page: Tab) => page.focus('[data-role="studio"]');

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

/** The lab with the studio's routes, and the fake microphone (`browsers.ts`): allowed or refused, and hot to clip. */
const withMic = (mic: { readonly allowed: boolean; readonly hot?: boolean }) =>
  openLab(studioRoutes, { hash: '#1', mic });

/** Wait until `#T` holds `t` film seconds. */
const shownAt = (page: Tab, t: number) =>
  evaluates(page, "Number.parseFloat(location.hash.slice(1).split('&')[0])", t);

const scoped = <A, E>(self: Effect.Effect<A, E, Scope.Scope | FileSystem.FileSystem | Path.Path>) =>
  self.pipe(Effect.scoped, Effect.provide(BunServices.layer));

describe('the studio', () => {
  it.live(
    'lists the beats, reads the selected one, and lists its attempts',
    () =>
      scoped(
        Effect.gen(function* () {
          const { page, errors } = yield* withMic({ allowed: true });
          yield* page.waitFor('[data-beat="thesis"]');
          yield* textIs(page, '.studio-counts', '1 recorded · 1 staging · 1 stale');
          yield* textsAre(page, '[data-role="badge"]', [
            'recorded',
            'staging',
            'stale: text changed',
          ]);
          yield* textIs(page, '[data-role="prompter"]', 'In the beginning.');
          yield* page.click('[data-beat="thesis"]');
          yield* page.waitFor('.studio-quotation cite');
          yield* textIs(page, '.studio-line', 'The law is holy.');
          yield* textIs(page, '.studio-quotation p', 'The law of the Lord is perfect.');
          yield* textIs(page, '.studio-quotation cite', 'David, Ps 19:7');
          const files = ['thesis.new.flac', 'thesis.kept.flac', 'thesis.old.flac'];
          yield* attributesAre(page, '.studio-attempt', 'data-file', files);
          yield* textsAre(
            page,
            '.studio-attempt .studio-attempt-line',
            files.map(() => '“the law is holy” · 0.0% · 2.5 s'),
          );
          // Only an attempt that is not the take can be kept.
          yield* countIs(page, '.studio-attempt [data-act="keep"]:not([disabled])', 1);
          yield* attached(page, '[data-file="thesis.new.flac"] [data-act="keep"]:not([disabled])');
          yield* attributesAre(
            page,
            '.studio-attempt audio',
            'src',
            files.map((file) => `/lab/${PROBE}/studio/takes/thesis/attempts/${file}`),
          );
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
          const { page, asked, errors } = yield* withMic({ allowed: true });
          yield* page.waitFor('[data-beat="thesis"]');
          yield* page.click('[data-beat="thesis"]');
          yield* focusStudio(page);
          yield* press(page, 'r');
          yield* countedIn(page);
          // The meter reads its floor until the tone's chunks arrive: wait for the tone's level.
          yield* textIs(page, '[data-role="peak"]', /^peak −[5-7]\.\d dBFS$/);
          yield* recorded(page, 1.2);
          yield* press(page, ' ');
          yield* statusIs(page, /^review \d+\.\d s: hear it, then submit$/);
          yield* attributeIs(page, '[data-role="review"]', 'src', /^blob:/);
          // The browser reads the recording back as audio it can play, over a second long.
          yield* page.until('document.querySelector(\'[data-role="review"]\').duration > 1');
          yield* countIs(page, '.studio-meter-fill', 0);

          yield* press(page, 'k');
          yield* statusIs(page, /^take thesis says something else \(wer 40\.0%\)/);
          const [take] = posted(asked, /^\/studio\/takes\/thesis$/);
          const body = Option.getOrElse(
            Option.fromUndefinedOr(take).pipe(Option.flatMap((t) => t.body)),
            () => ({}),
          ) as { audio: string; type: string };
          expect(body.type).toBe('audio/wav');
          const format = Result.getOrUndefined(wavFormat(body.audio));
          expect(format).toEqual({
            riff: 'RIFF',
            format: 1,
            channels: 1,
            rate: expect.any(Number),
            bits: 24,
          });
          // Recorded at the page's own audio rate.
          yield* evaluates(page, 'new AudioContext().sampleRate', Number(format?.rate));
          yield* attributeIs(page, '[data-role="status"]', 'data-tone', 'refused');
          yield* textIs(page, '[data-act="acceptAnyway"]', 'Accept anyway (K)');

          // The take kept and mixed: the page loads again, at the same T, on the same beat.
          const beatsBefore = asked.filter((a) => a.path === '/studio/beats').length;
          const loaded = yield* page.nextLoad;
          yield* press(page, 'k');
          yield* loaded;
          const [keep] = posted(asked, /^\/studio\/takes\/thesis\/keep$/);
          expect(
            Option.getOrUndefined(Option.fromUndefinedOr(keep).pipe(Option.flatMap((k) => k.body))),
          ).toEqual({
            file: 'thesis.abcd.flac',
            acceptMismatch: true,
          });
          yield* page.waitFor('[data-beat="thesis"].selected');
          yield* shownAt(page, 1);
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
          const { page, asked } = yield* withMic({ allowed: true });
          yield* page.waitFor('[data-beat="thesis"]');
          yield* page.click('[data-beat="thesis"]');
          yield* page.click('[data-file="thesis.new.flac"] [data-act="keep"]');
          yield* statusIs(
            page,
            /^kept thesis\.new\.flac: heard “the law is holy” · 0\.0% words differ · the mix failed; the lab log says why$/,
          );
          // The attempts are read again after the keep.
          expect(yield* askedMoreThan(asked, '/studio/takes/thesis/attempts', 1)).toBeGreaterThan(
            1,
          );
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
            mic: { allowed: true },
          });
          yield* page.waitFor('[data-beat="thesis"]');
          yield* focusStudio(page);
          yield* press(page, 'ArrowRight');
          yield* page.waitFor('[data-beat="thesis"].selected');
          yield* press(page, 'ArrowRight');
          yield* page.waitFor('[data-beat="close"].selected');
          // At the last beat → and Space (nothing to stop) are still the studio's: the film holds.
          yield* press(page, 'ArrowRight');
          yield* press(page, ' ');
          yield* runClock(page, 300);
          yield* shownAt(page, 1);
          yield* textIs(page, '[data-act="play"]', PAUSED);
          yield* countIs(page, '[data-beat="close"].selected', 1);
          // Out of the studio the lab's keys are the lab's again: → steps the film, not the beat.
          yield* page.evaluate('document.activeElement.blur()');
          yield* press(page, 'Shift+ArrowRight');
          yield* page.until(
            "Number.parseFloat(location.hash.replace(/^#/, '').split('&')[0] ?? '') === 2",
          );
          yield* shownAt(page, 2);
          yield* countIs(page, '[data-beat="close"].selected', 1);
        }),
      ),
    60_000,
  );

  it.live(
    'keeps its keys when the button clicked goes: Record clicked, Space stops the take, not the film',
    () =>
      scoped(
        Effect.gen(function* () {
          const { page, errors } = yield* withMic({ allowed: true });
          yield* page.waitFor('[data-beat="thesis"]');
          yield* page.click('[data-beat="thesis"]');
          yield* page.click('[data-act="arm"]');
          yield* countedIn(page);
          yield* recorded(page, 0.6);
          yield* press(page, ' ');
          yield* statusIs(page, /^review \d+\.\d s: hear it, then submit$/);
          yield* shownAt(page, 1);
          yield* textIs(page, '[data-act="play"]', PAUSED);
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
          const { page } = yield* withMic({ allowed: true });
          yield* page.waitFor('[data-beat="thesis"]');
          yield* page.click('[data-beat="thesis"]');
          yield* page.waitFor('[data-file="thesis.new.flac"] audio');
          // Mark the row's player; a row built again would lose the mark.
          yield* page.evaluate(
            `document.querySelector('[data-file="thesis.new.flac"] audio').filmMark = true`,
          );
          yield* focusStudio(page);
          yield* press(page, 'r');
          yield* statusIs(page, /^recording in [123]…$/);
          yield* press(page, 'Escape');
          yield* statusIs(page, /^ready/);
          // The row kept: its player still carries the mark.
          yield* until(
            page,
            `document.querySelector('[data-file="thesis.new.flac"] audio')?.filmMark === true`,
          );
        }),
      ),
    60_000,
  );

  it.live(
    'shows a remembered microphone that is gone as gone, and Default picks the default again',
    () =>
      scoped(
        Effect.gen(function* () {
          const { page } = yield* withMic({ allowed: true });
          yield* page.waitFor('[data-beat="thesis"]');
          yield* page.evaluate("window.localStorage.setItem('film-lab-mic', 'film-probe-gone')");
          yield* page.reload;
          yield* page.attached('[data-field="mic"] option[value="film-probe-gone"]');
          yield* textIs(
            page,
            '[data-field="mic"] option:checked',
            'the microphone picked before (not connected)',
          );
          yield* page.select('[data-field="mic"]', '');
          yield* evaluates(page, "window.localStorage.getItem('film-lab-mic')", '');
        }),
      ),
    60_000,
  );

  it.live(
    'warns of clipping when the microphone runs too hot',
    () =>
      scoped(
        Effect.gen(function* () {
          const { page } = yield* withMic({ allowed: true, hot: true });
          yield* page.waitFor('[data-beat="thesis"]');
          yield* focusStudio(page);
          yield* press(page, 'r');
          yield* page.waitFor('[data-role="clip"]');
          yield* textIs(page, '[data-role="clip"]', 'clipping: turn the input down');
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
          const { page } = yield* withMic({ allowed: false });
          yield* page.waitFor('[data-beat="thesis"]');
          yield* focusStudio(page);
          yield* press(page, 'r');
          yield* statusIs(page, /^no microphone: /);
          yield* textIs(
            page,
            '[data-role="status"]',
            'no microphone: the browser was not allowed to use it; allow the microphone for this page',
          );
        }),
      ),
    60_000,
  );
});
