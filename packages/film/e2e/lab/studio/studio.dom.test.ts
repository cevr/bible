// The studio's recorder over the real studio page (the Voice section's
// Record opens it: a Dialog on a laptop, a Sheet on a phone), in Chromium
// with a fake microphone playing a tone, against fake studio routes. The
// beats list with their counts and badges; the teleprompter reads the
// selected beat's lines and its quotation with who said it; the attempts
// list with Keep only on one that can be kept. The whole take by the
// recorder's keys: R counts in and records (the meter moves), Space stops,
// the recording plays back, K submits a lossless WAV at the context's rate;
// the server's TakeMismatch shows in its own words; K accepts it anyway; the
// take kept and mixed reloads the studio at the same time on the same beat.
// Keep on an attempt keeps it, and a take whose mix failed stays to say so.
// The recorder's beat is the studio's selection, followed only at rest;
// ←/→ move between beats without moving the film. A mic too hot warns of
// clipping; a mic refused says so.

import { BunServices } from '@effect/platform-bun';
import { Effect, type FileSystem, Option, type Path, Result, Schedule, type Scope } from 'effect';
import { Base64 } from 'effect/encoding';
import { TakeMismatch } from '../../../src/core/refusals.ts';
import { describe, expect, it } from 'effect-bun-test';
import type { Tab } from '../../../src/lab/fixtures/tab.ts';
import {
  type Asked,
  DESK,
  type FakeRoute,
  type Json,
  PHONE,
  type Viewport,
  json,
  openPlayer,
  refused,
  route,
} from '../../../src/lab/fixtures/harness.ts';
import { pageHref } from '../../../src/core/api.ts';
import { CLOCK } from '../../../src/lab/fixtures/clock.ts';
import { menuEntry, openCommandMenu } from '../../../src/lab/fixtures/gestures.ts';
import { PROBE, probeFilm } from '../../../src/lab/fixtures/probe-film.ts';
import {
  attached,
  attributeIs,
  attributesAre,
  countIs,
  evaluates,
  inkIs,
  textHas,
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
    beat('one', 'recorded', [{ kind: 'line', text: 'In the beginning.' }]),
    beat('two', 'staging', [
      { kind: 'line', text: 'The law is holy.' },
      { kind: 'quotation', text: 'The law of the Lord is perfect.', by: 'David, Ps 19:7' },
    ]),
    beat('three', 'stale', [{ kind: 'line', text: 'Amen.' }], { staleReason: 'text changed' }),
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
  beat: 'two',
  attempts: [
    attempt('two.new.flac', false, true),
    attempt('two.kept.flac', true, true),
    attempt('two.old.flac', false, false),
  ],
};

const MISMATCH = TakeMismatch.make({
  id: 'two',
  script: 'the law is holy',
  heard: 'the lord is light',
  wer: 0.4,
  attempt: 'two.abcd.flac',
});

const took = (file: string): Json => ({
  beat: 'two',
  take: { hash: 'h', file, duration: 2.5, words: [], source: 'recorded' },
  transcript: 'the law is holy',
  wer: 0,
  timings: { voice: 'v', scenes: {} },
  // The newest attempt's mix fails: its keep stays on the page to say so.
  mixed: file !== 'two.new.flac',
});

const studioRoutes: ReadonlyArray<FakeRoute> = [
  route('GET', /^\/studio\/beats$/, () => json(BEATS)),
  route('GET', /^\/studio\/takes\/\w+\/attempts$/, () => json(ATTEMPTS)),
  route('POST', /^\/studio\/takes\/two$/, () => refused(MISMATCH)),
  route('POST', /^\/studio\/takes\/two\/keep$/, (asked) =>
    json(took(String(Reflect.get(Option.getOrElse(asked.body, () => ({})) as object, 'file')))),
  ),
];

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
const statusIs = (page: Tab, pattern: RegExp) =>
  textIs(page, '[data-role="record"] [data-role="status"]', pattern);

/** The status line of a recorder at rest with nothing to report: empty (the Record button names its key). */
const AT_REST = /^$/;

/** Wait until the recording has kept at least `seconds` of the microphone, as its status counts. */
const recorded = (page: Tab, seconds: number) =>
  page.until(`(() => {
    const status = document.querySelector('[data-role="record"] [data-role="status"]')?.textContent ?? '';
    const tc = /^recording · (\\d\\d):(\\d\\d):(\\d\\d):(\\d\\d)/.exec(status);
    const kept = tc ? Number(tc[1]) * 3600 + Number(tc[2]) * 60 + Number(tc[3]) + Number(tc[4]) / 30 : -1;
    return kept >= ${seconds};
  })()`);

/**
 * Run the page's clock on by `ms`: its timers and frames run that much,
 * however slow the machine, so what a key would have started has started.
 */
const runClock = (page: Tab, ms: number) => page.clock.runFor(ms);

const press = (page: Tab, key: string) => page.press(key);

/** The status line's text, read in the page. */
const STATUS = `(document.querySelector('[data-role="record"] [data-role="status"]')?.textContent ?? '')`;

/**
 * Wait until `script`, read in the page, is true, while the held clock runs
 * what is due at the time it stands at, and no further: the page's work
 * after a key or a second (its fibers' hops are timers due at once) runs,
 * and no second of the count-in passes.
 */
const heldUntil = (page: Tab, script: string, wanted: string) =>
  page.until(`(globalThis[Symbol.for('${CLOCK}')].runFor(0), ${script})`, {
    now: STATUS,
    say: (now) => `the status line never read ${wanted}; it read ${now}`,
  });

/**
 * Arm the recorder with `arm` (its key, or the Record button) and count in,
 * each second of it moved on by the page's clock, until the take records.
 * The clock is held through the count-in, so each number stays until the
 * test moves the clock on: a clock that runs on with real time would let a
 * loaded machine count past a number before the test reads it. Once the
 * take records, the clock runs on again, as the recording's does.
 */
const countedIn = (page: Tab, arm: Effect.Effect<void>) =>
  Effect.gen(function* () {
    yield* page.clock.hold;
    yield* arm;
    for (let n = COUNT_IN; n > 0; n--) {
      yield* heldUntil(page, `${STATUS} === 'recording in ${n}…'`, `recording in ${n}…`);
      yield* page.clock.runFor(1000);
    }
    yield* heldUntil(page, `/^recording · /.test(${STATUS})`, 'recording · …');
    yield* page.clock.release;
  });

/** Focus the studio, as a click into it does. */
const focusStudio = (page: Tab) => page.focus('[data-role="record"] [data-role="studio"]');

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

/** The studio at rest: its timeline drawn. */
const READY = '.st-timeline .st-clip';

/** The recorder over the studio: its Dialog on a laptop, its Sheet on a phone. */
const RECORD = '[data-role="record"]';

/** The inspector's Voice section. */
const VOICE = '.st-pane .st-sec[data-section="Voice"]';

/** Open the Voice section (its summary pressed unless it stands open) and press its Record. */
const openRecorder = (page: Tab) =>
  Effect.gen(function* () {
    yield* page.waitFor(`${VOICE} > summary`);
    if (!(yield* page.evaluate<boolean>(`document.querySelector('${VOICE}').open`)))
      yield* page.click(`${VOICE} > summary`);
    yield* page.click(`${VOICE} [data-act="record"]`);
  });

/**
 * The studio on beat one, `viewport` wide, over `routes`, with the fake
 * microphone (`browsers.ts`): allowed or refused, and hot to clip; its
 * recorder opened from the Voice section's Record, as the owner opens it.
 */
const recorderOn = (
  routes: ReadonlyArray<FakeRoute>,
  mic: { readonly allowed: boolean; readonly hot?: boolean },
  {
    sel = 'beat:one',
    viewport = DESK,
  }: { readonly sel?: string; readonly viewport?: Viewport } = {},
) =>
  Effect.gen(function* () {
    const opened = yield* openPlayer(
      {
        href: pageHref.studio(PROBE, { sel }),
        viewport,
        microphone: mic.allowed,
        hot: mic.hot === true,
      },
      READY,
      routes,
    );
    yield* openRecorder(opened.page);
    yield* opened.page.waitFor(`${RECORD} [data-beat]`);
    return opened;
  });

/** The recorder over the studio's routes at a desk. */
const withMic = (mic: { readonly allowed: boolean; readonly hot?: boolean }) =>
  recorderOn(studioRoutes, mic);

/** The studio's timecode, read in the page: where the film stands. */
const TC = `document.querySelector('.st-tc')?.textContent ?? ''`;

/** The studio's play key: pressed while the film plays. */
const PLAY = '.st-key[data-act="play.toggle"]';

/** The beat the studio selects (`?sel=beat:<id>`), or '' for none. */
const SEL_IN_URL = "new URLSearchParams(location.search).get('sel') ?? ''";

/** The probe film's beats, one a scene as a film's are, each with one line to record. */
const SCENE_BEATS: Json = {
  film: PROBE,
  beats: probeFilm().placed.map((p) =>
    beat(p.spec.id, 'staging', [{ kind: 'line', text: `In ${p.spec.id}.` }]),
  ),
};

const scoped = <A, E>(self: Effect.Effect<A, E, Scope.Scope | FileSystem.FileSystem | Path.Path>) =>
  self.pipe(Effect.scoped, Effect.provide(BunServices.layer));

describe('the studio', () => {
  it.live(
    "with its colours made one, each beat's dot still tells its state by its shape (WCAG 1.4.1)",
    () =>
      scoped(
        Effect.gen(function* () {
          const { page, errors } = yield* withMic({ allowed: true });
          yield* page.waitFor('[data-role="record"] [data-beat="three"] [data-role="badge"]');
          // Every state token one colour: whatever still tells the dots apart is their shape.
          yield* page.evaluate(
            `(() => { const s = document.createElement('style'); s.textContent = ':root { --state-scratch: #777 !important; --state-approved: #777 !important; --state-stale: #777 !important; }'; document.head.append(s); return 0; })()`,
          );
          // Each dot as it paints: its fill, its ring, its corners, anything drawn on it.
          const painted = `[...document.querySelectorAll('[data-role="record"] [data-role="badge"]')].map((d) => { const c = getComputedStyle(d); return [c.backgroundColor, c.backgroundImage, c.borderTopWidth, c.borderTopStyle, c.borderTopColor, c.borderRadius, c.boxShadow, getComputedStyle(d, '::before').content, getComputedStyle(d, '::after').content].join(' | '); })`;
          yield* evaluates(page, `${painted}.length`, 3);
          yield* evaluates(page, `new Set(${painted}).size`, 3);
          expect(errors).toEqual([]);
        }),
      ),
    60_000,
  );

  it.live(
    'lists the beats, reads the selected one, and lists its attempts',
    () =>
      scoped(
        Effect.gen(function* () {
          const { page, errors } = yield* withMic({ allowed: true });
          yield* page.waitFor('[data-role="record"] [data-beat="two"]');
          // Each beat is a dot in its take's state colour and shape, its word in its name and the
          // counts in the list's; the selected beat's word is shown under the list.
          yield* attributesAre(page, '[data-role="record"] [data-role="badge"]', 'data-state', [
            'recorded',
            'staging',
            'stale',
          ]);
          yield* attributesAre(page, '[data-role="record"] [data-beat]', 'aria-label', [
            'one: recorded',
            'two: scratch',
            'three: stale: text changed',
          ]);
          yield* attributeIs(
            page,
            '[data-role="record"] [data-role="beats"]',
            'aria-label',
            'Beats: 1 recorded · 1 scratch · 1 stale',
          );
          yield* textIs(page, '[data-role="record"] [data-role="beat-state"]', 'recorded');
          yield* textIs(page, '[data-role="record"] [data-role="status"]', '');
          yield* textIs(page, '[data-role="record"] [data-role="prompter"]', 'In the beginning.');
          yield* page.click('[data-role="record"] [data-beat="two"]');
          yield* textIs(page, '[data-role="record"] [data-role="beat-state"]', 'scratch');
          yield* page.waitFor('[data-role="record"] .studio-quotation cite');
          yield* textIs(page, '[data-role="record"] .studio-line', 'The law is holy.');
          yield* textIs(
            page,
            '[data-role="record"] .studio-quotation p',
            'The law of the Lord is perfect.',
          );
          yield* textIs(page, '[data-role="record"] .studio-quotation cite', 'David, Ps 19:7');
          const files = ['two.new.flac', 'two.kept.flac', 'two.old.flac'];
          yield* attributesAre(page, '[data-role="record"] .studio-attempt', 'data-file', files);
          yield* textsAre(
            page,
            '[data-role="record"] .studio-attempt .studio-attempt-line',
            files.map(() => '“the law is holy” · 0.0% · 00:00:02:15'),
          );
          // The take says kept, an attempt at the line before it changed says so: the kit's
          // badges, each in its state's colour.
          const kept = '[data-role="record"] [data-file="two.kept.flac"] .sh-badge';
          const earlier = '[data-role="record"] [data-file="two.old.flac"] .sh-badge';
          yield* textIs(page, `${kept}[data-state="approved"]`, 'kept');
          yield* evaluates(page, inkIs(kept, '--state-approved'), true);
          yield* textIs(page, `${earlier}[data-state="stale"]`, 'earlier line');
          yield* evaluates(page, inkIs(earlier, '--state-stale'), true);
          // Only an attempt that is not the take can be kept.
          yield* countIs(
            page,
            '[data-role="record"] .studio-attempt [data-act="keep"]:not([disabled])',
            1,
          );
          yield* attached(
            page,
            '[data-role="record"] [data-file="two.new.flac"] [data-act="keep"]:not([disabled])',
          );
          yield* attributesAre(
            page,
            '[data-role="record"] .studio-attempt audio',
            'src',
            files.map((file) => `/api/films/${PROBE}/studio/takes/two/attempts/${file}`),
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
          yield* page.waitFor('[data-role="record"] [data-beat="two"]');
          yield* page.click('[data-role="record"] [data-beat="two"]');
          yield* focusStudio(page);
          yield* countedIn(page, press(page, 'r'));
          // The meter reads its floor until the tone's chunks arrive: wait for the tone's level.
          yield* textIs(page, '[data-role="record"] [data-role="peak"]', /^peak −[5-7]\.\d dBFS$/);
          yield* recorded(page, 1.2);
          yield* press(page, ' ');
          yield* statusIs(page, /^review \d\d:\d\d:\d\d:\d\d: hear it, then submit$/);
          yield* attributeIs(page, '[data-role="record"] [data-role="review"]', 'src', /^blob:/);
          // The browser reads the recording back as audio it can play, over a second long.
          yield* page.until(
            'document.querySelector(\'[data-role="record"] [data-role="review"]\').duration > 1',
          );
          yield* countIs(page, '[data-role="record"] .studio-meter-fill', 0);

          yield* press(page, 'k');
          yield* statusIs(page, /^take two says something else \(wer 40\.0%\)/);
          const [take] = posted(asked, /^\/studio\/takes\/two$/);
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
          // Recorded at the microphone's own rate (the fake device's 44.1 kHz),
          // never resampled to the output device's.
          expect(format?.rate).toBe(44100);
          yield* attributeIs(
            page,
            '[data-role="record"] [data-role="status"]',
            'data-tone',
            'refused',
          );
          yield* textIs(
            page,
            '[data-role="record"] [data-act="acceptAnyway"]',
            'Accept anyway (K)',
          );

          // The take kept and mixed: the page loads again, at the same time, on the same beat.
          const beatsBefore = asked.filter((a) => a.path === '/studio/beats').length;
          const before = yield* page.evaluate<string>(`location.hash`);
          const loaded = yield* page.nextLoad;
          yield* press(page, 'k');
          yield* loaded;
          const [keep] = posted(asked, /^\/studio\/takes\/two\/keep$/);
          expect(
            Option.getOrUndefined(Option.fromUndefinedOr(keep).pipe(Option.flatMap((k) => k.body))),
          ).toEqual({
            file: 'two.abcd.flac',
            acceptMismatch: true,
          });
          yield* page.waitFor(READY);
          yield* evaluates(page, SEL_IN_URL, 'beat:two');
          yield* evaluates(page, 'location.hash', before);
          // The studio opens with its recorder shut: Record opens it again, on the beat.
          yield* countIs(page, RECORD, 0);
          yield* openRecorder(page);
          yield* page.waitFor('[data-role="record"] [data-beat="two"].selected');
          expect(asked.filter((a) => a.path === '/studio/beats').length).toBeGreaterThan(
            beatsBefore,
          );
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
          yield* page.waitFor('[data-role="record"] [data-beat="two"]');
          yield* page.click('[data-role="record"] [data-beat="two"]');
          yield* page.click('[data-role="record"] [data-file="two.new.flac"] [data-act="keep"]');
          yield* statusIs(
            page,
            /^kept two\.new\.flac: heard “the law is holy” · 0\.0% words differ · the mix failed; the lab log says why$/,
          );
          // The attempts are read again after the keep.
          expect(yield* askedMoreThan(asked, '/studio/takes/two/attempts', 1)).toBeGreaterThan(1);
          const [keep] = posted(asked, /^\/studio\/takes\/two\/keep$/);
          expect(
            Option.getOrUndefined(Option.fromUndefinedOr(keep).pipe(Option.flatMap((k) => k.body))),
          ).toEqual({
            file: 'two.new.flac',
            acceptMismatch: false,
          });
        }),
      ),
    60_000,
  );

  it.live(
    'chooses the microphone from ⌘K: the one picked is remembered and named, Default names none (UR2-4)',
    () =>
      scoped(
        Effect.gen(function* () {
          const { page } = yield* withMic({ allowed: true });
          yield* page.waitFor('[data-role="record"] [data-beat="two"]');
          // At rest on the default, no picker and no name: the choice is ⌘K's.
          yield* countIs(page, '[data-role="record"] [data-field="mic"]', 0);
          yield* countIs(page, '[data-role="record"] [data-role="mic"]', 0);
          yield* openCommandMenu(page, 'microphone');
          yield* countIs(page, menuEntry('studio.mic.default'), 0);
          const listed = `[data-role="command-menu"] [data-command^="studio.mic."]`;
          yield* page.waitFor(listed);
          yield* page.click(listed);
          yield* until(page, "(window.localStorage.getItem('film-lab-mic') ?? '') !== ''");
          yield* page.waitFor('[data-role="record"] [data-role="mic"]');
          yield* openCommandMenu(page, 'microphone');
          yield* page.click(menuEntry('studio.mic.default'));
          yield* evaluates(page, "window.localStorage.getItem('film-lab-mic')", '');
          yield* countIs(page, '[data-role="record"] [data-role="mic"]', 0);
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
          yield* page.waitFor('[data-role="record"] [data-beat="two"]');
          yield* page.click('[data-role="record"] [data-beat="two"]');
          const at = yield* page.evaluate<string>(TC);
          yield* countedIn(page, page.click('[data-role="record"] [data-act="arm"]'));
          yield* recorded(page, 0.6);
          yield* press(page, ' ');
          yield* statusIs(page, /^review \d\d:\d\d:\d\d:\d\d: hear it, then submit$/);
          yield* evaluates(page, TC, at);
          yield* attributeIs(page, PLAY, 'aria-pressed', 'false');
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
          yield* page.waitFor('[data-role="record"] [data-beat="two"]');
          yield* page.click('[data-role="record"] [data-beat="two"]');
          yield* page.waitFor('[data-role="record"] [data-file="two.new.flac"] audio');
          // Mark the row's player; a row built again would lose the mark.
          yield* page.evaluate(
            `document.querySelector('[data-role="record"] [data-file="two.new.flac"] audio').filmMark = true`,
          );
          yield* focusStudio(page);
          yield* press(page, 'r');
          yield* statusIs(page, /^recording in [123]…$/);
          yield* page.click(`${RECORD} [data-act="cancel"]`);
          yield* statusIs(page, AT_REST);
          // The row kept: its player still carries the mark.
          yield* until(
            page,
            `document.querySelector('[data-role="record"] [data-file="two.new.flac"] audio')?.filmMark === true`,
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
          yield* page.waitFor('[data-role="record"] [data-beat="two"]');
          yield* page.evaluate("window.localStorage.setItem('film-lab-mic', 'film-probe-gone')");
          yield* page.reload;
          // The studio opens with its recorder shut: Record opens it again.
          yield* openRecorder(page);
          yield* textIs(
            page,
            '[data-role="record"] [data-role="mic"]',
            'the microphone picked before (not connected)',
          );
          yield* openCommandMenu(page, 'microphone');
          yield* page.click(menuEntry('studio.mic.default'));
          yield* evaluates(page, "window.localStorage.getItem('film-lab-mic')", '');
          yield* countIs(page, '[data-role="record"] [data-role="mic"]', 0);
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
          yield* page.waitFor('[data-role="record"] [data-beat="two"]');
          yield* focusStudio(page);
          yield* press(page, 'r');
          yield* page.waitFor('[data-role="record"] [data-role="clip"]');
          yield* textIs(
            page,
            '[data-role="record"] [data-role="clip"]',
            'clipping: turn the input down',
          );
          yield* page.click(`${RECORD} [data-act="cancel"]`);
          yield* statusIs(page, AT_REST);
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
          yield* page.waitFor('[data-role="record"] [data-beat="two"]');
          yield* focusStudio(page);
          yield* press(page, 'r');
          yield* statusIs(page, /^no microphone: /);
          yield* textIs(
            page,
            '[data-role="record"] [data-role="status"]',
            'no microphone: the browser was not allowed to use it; allow the microphone for this page',
          );
        }),
      ),
    60_000,
  );

  it.live(
    'opens on the beat the studio selects; a beat picked selects it in the studio, and Back walks it',
    () =>
      scoped(
        Effect.gen(function* () {
          const routes = [
            route('GET', /^\/studio\/beats$/, () => json(SCENE_BEATS)),
            ...studioRoutes,
          ];
          const { page } = yield* recorderOn(routes, { allowed: true }, { sel: 'beat:two' });
          yield* page.waitFor(`${RECORD} [data-beat="two"].selected`);
          yield* textIs(page, `${RECORD} [data-role="prompter"]`, 'In two.');
          // A beat picked in the recorder is the studio's selection, in the link.
          yield* page.click(`${RECORD} [data-beat="three"]`);
          yield* evaluates(page, SEL_IN_URL, 'beat:three');
          yield* page.waitFor(`${RECORD} [data-beat="three"].selected`);
          yield* textIs(page, `${RECORD} [data-role="prompter"]`, 'In three.');
          // Back returns the studio to two, and the recorder at rest with it; Forward to three.
          yield* page.back;
          yield* evaluates(page, SEL_IN_URL, 'beat:two');
          yield* page.waitFor(`${RECORD} [data-beat="two"].selected`);
          yield* page.forward;
          yield* page.waitFor(`${RECORD} [data-beat="three"].selected`);
        }),
      ),
    60_000,
  );

  it.live(
    "the studio's selection moves the recorder only at rest: a take it holds stays on its beat, said so, and a recorder back at rest follows",
    () =>
      scoped(
        Effect.gen(function* () {
          const routes = [
            route('GET', /^\/studio\/beats$/, () => json(SCENE_BEATS)),
            route('POST', /^\/studio\/takes\/one$/, () =>
              refused(TakeMismatch.make({ ...MISMATCH, id: 'one', attempt: 'one.abcd.flac' })),
            ),
            ...studioRoutes,
          ];
          const { page } = yield* recorderOn(routes, { allowed: true });
          yield* page.waitFor(`${RECORD} [data-beat="one"].selected`);
          // Two picked, then one again: the link's Back has a beat to walk to.
          yield* page.click(`${RECORD} [data-beat="two"]`);
          yield* evaluates(page, SEL_IN_URL, 'beat:two');
          yield* page.click(`${RECORD} [data-beat="one"]`);
          yield* evaluates(page, SEL_IN_URL, 'beat:one');
          // Counting in on one, the studio goes Back to two; cancelled, the recorder follows.
          yield* focusStudio(page);
          yield* press(page, 'r');
          yield* statusIs(page, /^recording in [123]…$/);
          // The count-in ticks on its line, unsaid: the polite region holds nothing.
          yield* attributeIs(page, `${RECORD} [data-role="said"]`, 'role', 'status');
          yield* textIs(page, `${RECORD} [data-role="said"]`, '');
          yield* page.back;
          yield* evaluates(page, SEL_IN_URL, 'beat:two');
          yield* countIs(page, `${RECORD} [data-beat="one"].selected`, 1);
          yield* page.click(`${RECORD} [data-act="cancel"]`);
          yield* page.waitFor(`${RECORD} [data-beat="two"].selected`);
          // A take refused on one holds its WAV: the studio moving on leaves it on one, and says so.
          yield* page.forward;
          yield* evaluates(page, SEL_IN_URL, 'beat:one');
          yield* page.waitFor(`${RECORD} [data-beat="one"].selected`);
          yield* focusStudio(page);
          yield* countedIn(page, press(page, 'r'));
          yield* recorded(page, 0.5);
          yield* press(page, ' ');
          yield* statusIs(page, /^review /);
          yield* press(page, 'k');
          yield* statusIs(page, /^take one says something else/);
          // The refusal is said, once, in the polite region.
          yield* textIs(page, `${RECORD} [data-role="said"]`, /^take one says something else/);
          yield* page.back;
          yield* evaluates(page, SEL_IN_URL, 'beat:two');
          yield* textHas(page, '[data-role="receipt"]', 'Record stays on one');
          yield* countIs(page, `${RECORD} [data-beat="one"].selected`, 1);
          yield* textIs(page, `${RECORD} [data-act="acceptAnyway"]`, 'Accept anyway (K)');
          // Back to the take under review it still holds it, on one; discarded, the recorder is
          // at rest and goes where the studio is.
          yield* page.click(`${RECORD} [data-act="retry"]`);
          yield* statusIs(page, /^review /);
          yield* countIs(page, `${RECORD} [data-beat="one"].selected`, 1);
          yield* page.click(`${RECORD} [data-act="discard"]`);
          yield* page.waitFor(`${RECORD} [data-beat="two"].selected`);
          // What it said is replaced at once, in its slot: no receipt still says it stayed on one.
          yield* evaluates(
            page,
            `[...document.querySelectorAll('[data-role="receipt"]')].map((r) => r.textContent).filter((t) => t.startsWith('Record '))`,
            ['Record follows the link to two×'],
          );
        }),
      ),
    60_000,
  );

  it.live(
    'takes its keys while it has focus: ←/→ move between beats, and the film holds',
    () =>
      scoped(
        Effect.gen(function* () {
          const { page } = yield* withMic({ allowed: true });
          yield* page.waitFor(`${RECORD} [data-beat="two"]`);
          yield* focusStudio(page);
          yield* press(page, 'ArrowRight');
          yield* page.waitFor(`${RECORD} [data-beat="two"].selected`);
          yield* press(page, 'ArrowRight');
          yield* page.waitFor(`${RECORD} [data-beat="three"].selected`);
          // At the last beat → and Space (nothing to stop) are still the recorder's: the film holds.
          const at = yield* page.evaluate<string>(TC);
          yield* press(page, 'ArrowRight');
          yield* press(page, ' ');
          yield* runClock(page, 300);
          yield* evaluates(page, TC, at);
          yield* attributeIs(page, PLAY, 'aria-pressed', 'false');
          yield* countIs(page, `${RECORD} [data-beat="three"].selected`, 1);
          // ← steps back a beat.
          yield* press(page, 'ArrowLeft');
          yield* page.waitFor(`${RECORD} [data-beat="two"].selected`);
        }),
      ),
    60_000,
  );

  it.live(
    "on a phone, the recorder's sheet shows Record (R) and every beat's dot on its first screen (SU-4, UR2-4)",
    () =>
      scoped(
        Effect.gen(function* () {
          // A film's worth of beats (18, as the film the sweep measured), the first a long read.
          const long = Array.from({ length: 8 }, () => ({
            kind: 'line',
            text: 'The law of the Lord is perfect, converting the soul; the testimony of the Lord is sure.',
          }));
          const many: Json = {
            film: PROBE,
            beats: [
              beat('one', 'staging', long),
              ...Array.from({ length: 17 }, (_, i) =>
                beat(`beat${i + 1}`, 'staging', [{ kind: 'line', text: 'Amen.' }]),
              ),
            ],
          };
          const { page } = yield* recorderOn(
            [route('GET', /^\/studio\/beats$/, () => json(many)), ...studioRoutes.slice(1)],
            { allowed: true },
            { viewport: PHONE },
          );
          yield* page.waitFor(`${RECORD} [data-act="arm"]`);
          yield* evaluates(
            page,
            `[...document.querySelectorAll('${RECORD} [data-act="arm"], ${RECORD} [data-beat]')]
              .filter((el) => el.getBoundingClientRect().bottom > innerHeight)
              .map((el) => el.outerHTML.slice(0, 60))`,
            [],
          );
        }),
      ),
    60_000,
  );
});
