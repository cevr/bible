/**
 * `bun run contrast`: the built pages' text contrast as a browser draws it.
 * It serves `dist/` through the Worker's policy (as `bun run preview` does),
 * opens every page at the phone board (390 px) and the desktop board
 * (1440 px), and holds each run of text against what is drawn behind it.
 *
 * Each visible text node's boxes are found, the page is drawn again with all
 * text transparent, and each box's pixels are compared with the text's own
 * colour. A run passes when 95% of its pixels meet WCAG 2.2 AA: 4.5:1, or
 * 3:1 for large text (24 px, or 18.66 px bold). The wordmark is a logo
 * (`data-logo`), which AA exempts. At the desktop board each link and button
 * is also measured under the pointer, since a hover may change its colours
 * (phones have no hover). Build first (`bun run build`); the run fails when
 * any text falls short.
 */
import { BunHttpServer, BunRuntime, BunServices } from '@effect/platform-bun';
import { chromium, type Browser, type Page } from '@playwright/test';
import { Array as Arr, Data, Effect, Layer, Option, Order } from 'effect';
import { HttpServer, HttpServerRequest } from 'effect/http';

import { PAGES } from '../src/pages.ts';
import { layerDirectory } from '../src/worker/assets.ts';
import { respond } from '../src/worker/respond.ts';

const PORT = 8479;
const BASE = `http://localhost:${PORT}`;
const WIDTHS = [1440, 390] as const;
/** The board measured under the pointer. */
const HOVER_WIDTH = 1440;
const HIDE = 'contrast-hide';
const TARGET = 'data-contrast-target';

/** A run of text as the page lays it out: its boxes, in page pixels. */
interface Run {
  readonly text: string;
  readonly px: number;
  readonly weight: number;
  readonly color: string;
  readonly rects: ReadonlyArray<readonly [number, number, number, number]>;
}

interface Measured {
  readonly text: string;
  readonly px: number;
  /** The ratio 95% of the run's pixels meet. */
  readonly p95: number;
  /** AA's bar for the run's size. */
  readonly bar: number;
}

class BrowserError extends Data.TaggedError('BrowserError')<{
  readonly step: string;
  readonly cause: unknown;
}> {}

class ContrastShort extends Data.TaggedError('ContrastShort')<{ readonly under: number }> {}

const step = <A>(name: string, run: () => PromiseLike<A>) =>
  Effect.tryPromise({
    try: () => run(),
    catch: (cause) => new BrowserError({ step: name, cause }),
  });

/** In the page: every image loads now. */
const eager = () => {
  for (const image of document.images) image.loading = 'eager';
};

/** In the page: every face and every image is in. */
const settled = () =>
  document.fonts.status === 'loaded' && [...document.images].every((image) => image.complete);

/** In the page: each visible run of text under `root` and its boxes; then all text is hidden. */
const collectRuns = (input: {
  readonly root: string;
  readonly hide: string;
}): ReadonlyArray<Run> => {
  const found: Array<Run> = [];
  const root = document.querySelector(input.root) || document.body;
  const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  while (walk.nextNode()) {
    const node = walk.currentNode;
    const text = (node.nodeValue || '').trim();
    const element = node.parentElement;
    if (!text || !element || element.closest('[data-logo]')) continue;
    const style = getComputedStyle(element);
    if (style.visibility === 'hidden' || Number(style.opacity) === 0) continue;
    const range = document.createRange();
    range.selectNodeContents(node);
    const rects = [...range.getClientRects()]
      .filter((rect) => rect.width > 2 && rect.height > 2 && rect.bottom + scrollY > 0)
      .map((rect) => [rect.left + scrollX, rect.top + scrollY, rect.width, rect.height] as const);
    if (rects.length > 0) {
      found.push({
        text: text.slice(0, 48),
        px: parseFloat(style.fontSize),
        weight: Number(style.fontWeight),
        color: style.color,
        rects,
      });
    }
  }
  const hide = document.createElement('style');
  hide.id = input.hide;
  hide.textContent =
    '*{color:transparent!important;text-shadow:none!important;-webkit-text-fill-color:transparent!important;text-decoration-color:transparent!important}';
  document.head.append(hide);
  return found;
};

/** In the page: every transition and animation has finished. */
const still = () =>
  document.getAnimations().every((animation) => animation.playState !== 'running');

/** In the page: the text drawn again. */
const reveal = (hide: string) => {
  const style = document.getElementById(hide);
  if (style) style.remove();
};

/** In the page: each link and button drawn on the page, named by an index; answers how many. */
const markTargets = (attribute: string) => {
  const onPage = (element: Element) => {
    const box = element.getBoundingClientRect();
    return box.width > 2 && box.left + scrollX >= 0 && box.top + scrollY >= 0;
  };
  const targets = [...document.querySelectorAll('a, button')].filter(
    (element) =>
      element.checkVisibility() && onPage(element) && (element.textContent || '').trim() !== '',
  );
  targets.forEach((element, index) => element.setAttribute(attribute, String(index)));
  return targets.length;
};

/** In the page: each run's contrast against the text-free drawing behind it. */
const contrastOf = (input: { readonly data: string; readonly runs: ReadonlyArray<Run> }) => {
  const image = new Image();
  image.src = `data:image/png;base64,${input.data}`;
  return image.decode().then((): ReadonlyArray<Measured> => {
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const g = canvas.getContext('2d');
    if (!g) return [];
    g.drawImage(image, 0, 0);
    const linear = (v: number) => {
      const c = v / 255;
      if (c <= 0.04045) return c / 12.92;
      return ((c + 0.055) / 1.055) ** 2.4;
    };
    const luminance = (r: number, gr: number, b: number) =>
      0.2126 * linear(r) + 0.7152 * linear(gr) + 0.0722 * linear(b);
    return input.runs.map((run) => {
      const [r = 0, gr = 0, b = 0] = (run.color.match(/[\d.]+/g) || []).map(Number);
      const fore = luminance(r, gr, b);
      const ratios: Array<number> = [];
      for (const [x, y, w, h] of run.rects) {
        const X = Math.max(0, Math.round(x));
        const Y = Math.max(0, Math.round(y));
        if (X >= canvas.width || Y >= canvas.height) continue;
        const W = Math.min(Math.max(1, Math.round(w)), canvas.width - X);
        const H = Math.min(Math.max(1, Math.round(h)), canvas.height - Y);
        const pixels = g.getImageData(X, Y, W, H).data;
        const stride = Math.max(1, Math.floor(pixels.length / 4 / 4000));
        for (let i = 0; i < pixels.length / 4; i += stride) {
          const back = luminance(
            Number(pixels[i * 4]),
            Number(pixels[i * 4 + 1]),
            Number(pixels[i * 4 + 2]),
          );
          ratios.push((Math.max(fore, back) + 0.05) / (Math.min(fore, back) + 0.05));
        }
      }
      if (ratios.length === 0) ratios.push(21);
      ratios.sort((a, z) => a - z);
      let bar = 4.5;
      if (run.px >= 24 || (run.px >= 18.66 && run.weight >= 700)) bar = 3;
      const p95 = Number(ratios[Math.floor(ratios.length * 0.05)]);
      return { text: run.text, px: run.px, p95, bar };
    });
  });
};

const measure = Effect.fn('Contrast.measure')(function* (
  browser: Browser,
  path: string,
  width: number,
) {
  // The measure lays its own style and image over the page, which the site's
  // content policy refuses; the page is drawn as served either way.
  const context = yield* Effect.acquireRelease(
    step('context', () =>
      browser.newContext({ viewport: { width, height: 900 }, bypassCSP: true }),
    ),
    (opened) => Effect.promise(() => opened.close()),
  );
  const page = yield* step('page', () => context.newPage());
  yield* step('goto', () => page.goto(BASE + path, { waitUntil: 'networkidle' }));
  yield* step('eager', () => page.evaluate(eager));
  yield* step('settle', () => page.waitForFunction(settled));
  const rest = yield* measureRuns(page, 'body');
  if (width !== HOVER_WIDTH) return { rest, hover: [] };
  const hover: Array<Measured> = [];
  const targets = yield* step('targets', () => page.evaluate(markTargets, TARGET));
  for (let index = 0; index < targets; index += 1) {
    const target = `[${TARGET}="${index}"]`;
    yield* step('hover', () => page.hover(target, { force: true }));
    yield* step('still', () => page.waitForFunction(still));
    const runs = yield* measureRuns(page, target);
    hover.push(...runs.map((run) => ({ ...run, text: `hover: ${run.text}` })));
  }
  return { rest, hover };
}, Effect.scoped);

/** The runs under `root`, measured against the page as drawn without its text. */
const measureRuns = Effect.fn('Contrast.measureRuns')(function* (page: Page, root: string) {
  const runs = yield* step('runs', () => page.evaluate(collectRuns, { root, hide: HIDE }));
  const shot = yield* step('shot', () => page.screenshot({ fullPage: true, type: 'png' }));
  const measured = yield* step('contrast', () =>
    page.evaluate(contrastOf, { data: shot.toString('base64'), runs }),
  );
  yield* step('reveal', () => page.evaluate(reveal, HIDE));
  return measured;
});

const byMargin = Order.mapInput(Order.Number, (run: Measured) => run.p95 / run.bar);

const contrast = Effect.gen(function* () {
  const browser = yield* Effect.acquireRelease(
    step('launch', () => chromium.launch({ channel: 'chrome' })),
    (opened) => Effect.promise(() => opened.close()),
  );
  let under = 0;
  for (const width of WIDTHS) {
    for (const { path } of PAGES) {
      const measured = yield* measure(browser, path, width);
      const runs = [...measured.rest, ...measured.hover];
      const failing = runs.filter((run) => run.p95 < run.bar);
      under += failing.length;
      const lowest = Arr.head(Arr.sort(runs, byMargin));
      yield* Effect.logInfo('contrast.page').pipe(
        Effect.annotateLogs({
          page: path,
          width,
          runs: measured.rest.length,
          hovered: measured.hover.length,
          under: failing.length,
          lowest: Option.match(lowest, {
            onNone: () => 'none',
            onSome: (run) => `${run.p95.toFixed(2)}:1 bar=${run.bar} "${run.text}"`,
          }),
        }),
      );
      for (const run of failing) {
        yield* Effect.logError('contrast.under').pipe(
          Effect.annotateLogs({
            page: path,
            width,
            p95: run.p95.toFixed(2),
            bar: run.bar,
            px: run.px,
            text: run.text,
          }),
        );
      }
    }
  }
  if (under > 0) return yield* new ContrastShort({ under });
  yield* Effect.logInfo('contrast.done').pipe(Effect.annotateLogs({ under }));
}).pipe(Effect.scoped);

/** `dist/` through the Worker's policy, for as long as the measure runs. */
const app = Effect.gen(function* () {
  const request = yield* HttpServerRequest.HttpServerRequest;
  return yield* respond(request);
});

const Preview = HttpServer.serve(app).pipe(
  Layer.provide(layerDirectory('dist')),
  Layer.provide(BunHttpServer.layer({ port: PORT })),
  Layer.provide(BunServices.layer),
);

contrast.pipe(Effect.provide(Preview), BunRuntime.runMain);
