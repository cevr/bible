// Checker with fakes: every sampled frame is probed once on the page pool, the
// boxes it reports become findings, and a broken page fails the check with
// every page, the browser and the server closed. No Chromium.

import { describe, expect, it } from 'effect-bun-test';
import { Array as Arr, Effect, Exit, Layer, Option, Result } from 'effect';
import { layout } from '../core/layout.ts';
import type { Short, Timed } from '../core/schema.ts';
import { holdGrid, holdTicks, layoutSamples } from './check.ts';
import { Checker } from './checker.ts';
import type { LumaArea } from './browser.ts';
import { PageError } from './errors.ts';
import type { LoadedFilm } from './film-repo.ts';
import {
  type FakeRenderHost,
  type RenderLedger,
  emptyLedger,
  fakeRenderHost,
  holdScenes,
  holdTimings,
  inkMark,
  longHoldScenes,
  longHoldTimings,
  testExportInfo,
  testFilm,
  textBox,
} from './testing.ts';

const scenes: ReadonlyArray<Timed> = [
  { id: 'a', min: 10, timeline: { hit: { scene: 'start', offset: 2, dur: 1 } } },
  { id: 'b', min: 10, enter: { kind: 'fade', dur: 0.5 } },
];
const film = testFilm(scenes, { voice: '', scenes: {} });
const samples = layoutSamples(Result.getOrThrow(layout(scenes, film.timings)), testExportInfo.fps);

const setup = (host: FakeRenderHost = {}, checked: LoadedFilm = film) => {
  const ledger = emptyLedger();
  const layer = Checker.layer.pipe(Layer.provide(fakeRenderHost(ledger, host)));
  const check = (only: Option.Option<ReadonlySet<string>> = Option.none()) =>
    Effect.gen(function* () {
      return yield* (yield* Checker).layout(checked, { workers: 2, scenes: only });
    }).pipe(Effect.provide(layer));
  return { ledger, check };
};

const expectAllClosed = (ledger: RenderLedger) => {
  expect(ledger.server).toEqual({ started: 1, stopped: 1 });
  expect(ledger.browser).toEqual({ launched: 1, closed: 1 });
  expect(ledger.pages.closed).toBe(ledger.pages.opened);
};

/** Frame of scene a's `hit` cue start, where the fake page draws a collision. */
const hitFrame = Math.round(2 * testExportInfo.fps);

describe('Checker', () => {
  it.live('probes every sampled frame once and reports what collides there', () =>
    Effect.gen(function* () {
      const { ledger, check } = setup({
        probe: (i) => {
          const one = textBox('one', 100, 100, 300, 60);
          if (i !== hitFrame) return Effect.succeed({ texts: [one], inks: [] });
          return Effect.succeed({ texts: [one, textBox('two', 150, 120, 300, 60)], inks: [] });
        },
      });
      const findings = yield* check();
      expect([...ledger.frames].sort((x, y) => x - y)).toEqual(samples.map((s) => s.frame));
      expect(findings).toMatchObject([
        { _tag: 'TextOverlap', scene: 'a', at: 'cue hit start', a: 'one', b: 'two', frames: 1 },
      ]);
      expect(ledger.pages.opened).toBe(2);
      expectAllClosed(ledger);
    }),
  );

  it.live('--scene probes only those scenes', () =>
    Effect.gen(function* () {
      const { ledger, check } = setup();
      yield* check(Option.some(new Set(['b'])));
      expect(ledger.frames).toEqual(samples.filter((s) => s.scene === 'b').map((s) => s.frame));
    }),
  );

  it.live(
    'warns StaticHold on 5 s of speech with nothing moving; 3 s, or ambient motion, is fine',
    () =>
      Effect.gen(function* () {
        const placed = Result.getOrThrow(layout(holdScenes, holdTimings));
        const ambient = Option.getOrThrow(Arr.findFirst(placed, (p) => p.spec.id === 'ambient'));
        const fps = testExportInfo.fps;
        const inAmbient = (i: number) =>
          i >= ambient.start * fps && i < (ambient.start + ambient.dur) * fps;
        const figure = inkMark('fill', [
          [900, 500],
          [1000, 500],
          [1000, 800],
        ]);
        // Still, but for `ambient`, where the figure drifts a pixel a frame (snow, a sway).
        const drawn = (i: number) => {
          if (inAmbient(i)) return { ...figure, x: figure.x + i };
          return figure;
        };
        const { ledger, check } = setup(
          {
            probe: (i) =>
              Effect.succeed({
                texts: [textBox('A MOST PRECIOUS MESSAGE', 600, 300, 700, 80)],
                inks: [drawn(i)],
              }),
          },
          testFilm(holdScenes, holdTimings),
        );
        const findings = yield* check();
        expect(findings).toMatchObject([{ _tag: 'StaticHold', scene: 'held', max: 4 }]);
        expect(findings[0]).toMatchObject({ from: expect.closeTo(1.4), to: expect.closeTo(6.4) });
        // Every tick across `held`, each once; across `ambient` its grid, which moves at every step.
        const probedHeld = holdTicks({ from: 1.4, to: 6.4 }, fps).length;
        const probedAmbient = holdGrid(
          holdTicks({ from: ambient.start + 1.4, to: ambient.start + 6.4 }, fps),
        ).length;
        expect(ledger.frames).toHaveLength(
          layoutSamples(placed, fps).length + probedHeld + probedAmbient,
        );
        expectAllClosed(ledger);
      }),
  );

  /** Check the 9 s `long` candidate on a page whose figure sits `dx(frame)` px off its place. */
  const checkLong = (dx: (i: number) => number) => {
    const figure = inkMark('fill', [
      [900, 500],
      [1000, 500],
      [1000, 800],
    ]);
    return setup(
      { probe: (i) => Effect.succeed({ texts: [], inks: [{ ...figure, x: figure.x + dx(i) }] }) },
      testFilm(longHoldScenes, longHoldTimings),
    ).check();
  };

  it.live('D2: an undeclared 0.5 s move, then 8.5 s still, reports the still run', () =>
    Effect.gen(function* () {
      const fps = testExportInfo.fps;
      // 5 px a frame from 1.4 s to 1.9 s (no cue declares it), then still to the end.
      const findings = yield* checkLong((i) => 5 * Math.min(Math.max(0, i - 1.4 * fps), 0.5 * fps));
      expect(findings).toMatchObject([{ _tag: 'StaticHold', scene: 'long', max: 4 }]);
      expect(findings[0]).toMatchObject({
        from: expect.closeTo(1.9, 1),
        to: expect.closeTo(10.4, 1),
      });
    }),
  );

  it.live('D3: a visible sway whose period divides the probe step is motion', () =>
    Effect.gen(function* () {
      const fps = testExportInfo.fps;
      // 12 px peak to peak with a 0.5 s period: a walk bob.
      const findings = yield* checkLong((i) => 6 * Math.sin((2 * Math.PI * i) / (0.5 * fps)));
      expect(findings).toEqual([]);
    }),
  );

  it.live('a page error fails the check and closes every page, the browser and the server', () =>
    Effect.gen(function* () {
      const { ledger, check } = setup({
        probe: () => Effect.fail(PageError.make({ reason: 'boom' })),
      });
      const exit = yield* Effect.exit(check());
      expect(Exit.findErrorOption(exit).pipe(Option.map((e) => e._tag))).toEqual(
        Option.some('PageError'),
      );
      expectAllClosed(ledger);
    }),
  );
});

describe('Checker.short', () => {
  /** A 2 s short of scene a (to its cue), drawn 1080 px wide so page px are short px. */
  const short: Short = {
    id: 'cut',
    title: 'Cut',
    spans: [{ scene: 'a', from: { at: 'start' }, to: { cue: 'hit' } }],
  };
  const info = { width: 1080, height: 1920, fps: 30, duration: 2, frames: 60 };

  const setupShort = (host: FakeRenderHost, declared: Short = short, only = false) => {
    const ledger = emptyLedger();
    const layer = Checker.layer.pipe(Layer.provide(fakeRenderHost(ledger, host)));
    const check = Effect.gen(function* () {
      return yield* (yield* Checker).short(film, declared, {
        workers: 2,
        zone: 'default',
        static: only,
      });
    }).pipe(Effect.provide(layer));
    return { ledger, check };
  };

  it.live("resolves the short on its page's frame rate, as the renderer does", () =>
    Effect.gen(function* () {
      // Scene a whole, on a 24 fps page: 10 s is 240 frames, not 300.
      const whole: Short = {
        id: 'cut',
        title: 'Cut',
        spans: [{ scene: 'a', from: { at: 'start' }, to: { at: 'end' } }],
      };
      const page = { width: 1080, height: 1920, fps: 24, duration: 10, frames: 240 };
      const { ledger, check } = setupShort({ info: page }, whole);
      const findings = yield* check;
      expect(Math.max(...ledger.frames)).toBe(239);
      expect(findings).toContainEqual(expect.objectContaining({ _tag: 'ShortLength', length: 10 }));
      // --static probes no frame, but reads the page's rate all the same.
      const words = setupShort({ info: page }, whole, true);
      const only = yield* words.check;
      expect(words.ledger.frames).toEqual([]);
      expect(only.map((f) => f._tag)).toEqual(['ShortLength', 'ShortHook', 'ShortLoop']);
    }),
  );

  it.live("compares the loop on the film's own frame, however tall the film is drawn", () =>
    Effect.gen(function* () {
      // A 4:3 film: its band on the short's page is 810 px tall, not the 608 of a 16:9 one.
      const filmPage = { width: 1080, height: 810, fps: 30, duration: 20, frames: 600 };
      const areas: Array<LumaArea> = [];
      const { check } = setupShort({
        info,
        infoAt: (url) =>
          Option.liftPredicate(filmPage, () => url.includes(`film=${film.paths.name}&`)),
        luma: (_, area) => {
          areas.push(area);
          return 128;
        },
      });
      yield* check;
      // Every cell of the first and last frames reads the one band.
      const band = { x: 0, y: 620, w: 1080, h: 810, cols: 64, rows: 36 };
      expect(areas.length).toBe(2 * 64 * 36);
      for (const area of areas) expect(area).toEqual(band);
    }),
  );

  it.live(
    "probes the short's page for text past the zone, a still or titled open and a loop's seam",
    () =>
      Effect.gen(function* () {
        const { ledger, check } = setupShort({
          info,
          // The film's title, still, and a label under the right-hand buttons.
          probe: () =>
            Effect.succeed({
              texts: [
                textBox('Test film', 200, 700, 600, 100),
                textBox('Justify', 900, 900, 100, 60),
              ],
              inks: [],
            }),
          luma: (i) => Math.min(255, i * 8),
        });
        const findings = yield* check;
        // The silent two-second fixture's words first (too short, no word heard, no gap), then its frames.
        expect(findings.map((f) => f._tag).sort()).toEqual([
          'ShortHook',
          'ShortHook',
          'ShortHook',
          'ShortLength',
          'ShortLoop',
          'ShortLoop',
          'ShortUnsafeText',
        ]);
        expect(findings).toContainEqual(
          expect.objectContaining({ _tag: 'ShortUnsafeText', text: 'Justify', side: 'right' }),
        );
        expect(findings).toContainEqual(
          expect.objectContaining({ _tag: 'ShortHook', reason: 'title card' }),
        );
        expect(findings).toContainEqual(
          expect.objectContaining({ _tag: 'ShortHook', reason: 'still open' }),
        );
        expect(findings).toContainEqual(
          expect.objectContaining({ _tag: 'ShortLoop', reason: 'picture' }),
        );
        // The short's own page, and the film's for its title.
        expect(ledger.urls.some((u) => u.includes(encodeURIComponent('/shorts/cut')))).toBe(true);
        expect(ledger.urls.some((u) => u.includes(`film=${film.paths.name}&`))).toBe(true);
        expectAllClosed(ledger);
      }),
  );
});
