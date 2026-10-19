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
 * (`data-logo`), which AA exempts. At the desktop board the page is measured
 * again with the pointer on each link and button drawn on it, since a hover may
 * change any colour (phones have no hover); one the pointer cannot reach fails
 * the run. A hover is drawn again only where it changed something: each
 * element's paint (its colours, its pseudo-elements', its box) is read at rest
 * and under the pointer, and the runs inside the changed elements' boxes are
 * measured against a shot of that region alone (a changed pseudo-element, or
 * a page that grew or shrank, is measured whole). The pages are measured seven
 * at a time. Build first (`bun run build`); the run fails when any text falls
 * short. The gate runs it after the build.
 */
import { BunHttpServer, BunRuntime, BunServices } from '@effect/platform-bun';
import { chromium, type Browser, type Page } from '@playwright/test';
import { Array as Arr, Data, Effect, Layer, Option, Order } from 'effect';
import { HttpServer, HttpServerRequest } from 'effect/http';

import { PAGES } from '../src/pages.ts';
import { layerDirectory } from '../src/worker/assets.ts';
import { respond } from '../src/worker/respond.ts';

const WIDTHS = [1440, 390] as const;
/** The board measured under the pointer. */
const HOVER_WIDTH = 1440;
const HIDE = 'contrast-hide';
const TARGET = 'data-contrast-target';
/** How long a hover, or the transitions it starts, may take. */
const STEP_TIMEOUT = 5000;
/** Pages measured at once, each in its own browser context. */
const CONCURRENCY = 7;
/** What an element paints with: a hover that changes none of these draws nothing new. */
const PAINT = [
  'color',
  'background-color',
  'background-image',
  'border-top-color',
  'border-right-color',
  'border-bottom-color',
  'border-left-color',
  'outline-color',
  'outline-style',
  'outline-width',
  'box-shadow',
  'text-shadow',
  'text-decoration-line',
  'text-decoration-color',
  '-webkit-text-fill-color',
  'opacity',
  'visibility',
  'filter',
  'backdrop-filter',
  'mix-blend-mode',
  'clip-path',
  'transform',
  'translate',
  'rotate',
  'scale',
  'fill',
  'stroke',
  'font-weight',
  'font-style',
  'content',
  'display',
] as const;

/** A box in page pixels: left, top, width, height. */
type Box = readonly [number, number, number, number];

/** An element's paint as one page reads it. */
interface Paint {
  readonly own: string;
  readonly pseudo: string;
  readonly box: Box;
}

interface PaintState {
  readonly width: number;
  readonly height: number;
  readonly elements: ReadonlyArray<Paint>;
}

/** A run of text as the page lays it out: its boxes, in page pixels. */
interface Run {
  readonly text: string;
  readonly px: number;
  readonly weight: number;
  readonly color: string;
  readonly rects: ReadonlyArray<Box>;
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
}> {
  override get message() {
    return `the browser failed at ${this.step}: ${String(this.cause)}`;
  }
}

class PointerBlocked extends Data.TaggedError('PointerBlocked')<{
  readonly page: string;
  readonly link: string;
}> {
  override get message() {
    return `the pointer cannot reach "${this.link}" on ${this.page}: another element covers it`;
  }
}

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

/** In the page: each visible run of text and its boxes; then all text is hidden. */
const collectRuns = (hideId: string): ReadonlyArray<Run> => {
  const found: Array<Run> = [];
  const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
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
  hide.id = hideId;
  hide.textContent =
    '*{color:transparent!important;text-shadow:none!important;-webkit-text-fill-color:transparent!important;text-decoration-color:transparent!important}';
  document.head.append(hide);
  return found;
};

/** In the page: every transition has finished (an endless animation never does, so it is not waited on). */
const still = () =>
  document
    .getAnimations()
    .every(
      (animation) => !(animation instanceof CSSTransition) || animation.playState !== 'running',
    );

/** In the page: every element's paint, its pseudo-elements' and its box, in document order. */
const paintState = (props: ReadonlyArray<string>): PaintState => {
  const read = (style: CSSStyleDeclaration) =>
    props.map((prop) => style.getPropertyValue(prop)).join(';');
  const elements = [document.body, ...document.body.querySelectorAll('*')].map((element) => {
    const box = element.getBoundingClientRect();
    return {
      own: read(getComputedStyle(element)),
      pseudo: `${read(getComputedStyle(element, '::before'))}|${read(getComputedStyle(element, '::after'))}`,
      box: [box.left + scrollX, box.top + scrollY, box.width, box.height] as const,
    };
  });
  return {
    width: document.documentElement.scrollWidth,
    height: document.documentElement.scrollHeight,
    elements,
  };
};

/**
 * In the page: the link scrolled to the middle of the screen, the middle of
 * its first box, and whether the pointer there lands on the link.
 */
const pointAt = (selector: string) => {
  const target = document.querySelector(selector);
  if (!target) return { x: 0, y: 0, reaches: false };
  target.scrollIntoView({ block: 'center', inline: 'center' });
  const [box = target.getBoundingClientRect()] = target.getClientRects();
  const x = box.left + box.width / 2;
  const y = box.top + box.height / 2;
  const hit = document.elementFromPoint(x, y);
  return { x, y, reaches: Boolean(hit) && target.contains(hit) };
};

/** In the page: the text drawn again. */
const reveal = (hide: string) => {
  const style = document.getElementById(hide);
  if (style) style.remove();
};

/**
 * In the page: each link and button drawn on the page, marked by an index,
 * and its name; and the names of those left out (off the page until focused,
 * hidden, or with no words to measure).
 */
const markTargets = (attribute: string) => {
  const nameOf = (element: Element) =>
    (element.textContent || '').trim().replace(/\s+/g, ' ') ||
    element.getAttribute('aria-label') ||
    '?';
  const onPage = (element: Element) => {
    const box = element.getBoundingClientRect();
    return box.width > 2 && box.left + scrollX >= 0 && box.top + scrollY >= 0;
  };
  const all = [...document.querySelectorAll('a, button')];
  const drawn = all.filter(
    (element) =>
      element.checkVisibility() && onPage(element) && (element.textContent || '').trim() !== '',
  );
  drawn.forEach((element, index) => element.setAttribute(attribute, String(index)));
  return {
    names: drawn.map(nameOf),
    skipped: all.filter((element) => !drawn.includes(element)).map(nameOf),
  };
};

/** In the page: each run's contrast against the text-free drawing behind it. */
const contrastOf = (input: {
  readonly data: string;
  readonly origin: readonly [number, number];
  readonly runs: ReadonlyArray<Run>;
}) => {
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
        const X = Math.max(0, Math.round(x - input.origin[0]));
        const Y = Math.max(0, Math.round(y - input.origin[1]));
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

/** What a hover changed: nothing, or the region of the page it drew anew. */
type Change = { readonly _tag: 'Same' } | { readonly _tag: 'Region'; readonly box: Box };

const sameBox = (a: Box, b: Box) =>
  a.every((value, index) => Math.abs(value - Number(b[index])) < 0.5);

const visible = (box: Box) => box[2] > 0 && box[3] > 0;

/** The region a hover changed, from the page's paint at rest and under the pointer. */
const changeOf = (rest: PaintState, now: PaintState): Change => {
  const whole: Change = { _tag: 'Region', box: [0, 0, now.width, now.height] };
  if (
    rest.elements.length !== now.elements.length ||
    rest.width !== now.width ||
    rest.height !== now.height
  ) {
    return whole;
  }
  const boxes: Array<Box> = [];
  for (const [index, after] of now.elements.entries()) {
    const before = rest.elements[index];
    if (!before) return whole;
    if (before.pseudo !== after.pseudo) return whole;
    if (before.own !== after.own || !sameBox(before.box, after.box)) {
      if (visible(before.box)) boxes.push(before.box);
      if (visible(after.box)) boxes.push(after.box);
    }
  }
  if (boxes.length === 0) return { _tag: 'Same' };
  const left = Math.max(0, Math.floor(Math.min(...boxes.map((box) => box[0])) - 2));
  const top = Math.max(0, Math.floor(Math.min(...boxes.map((box) => box[1])) - 2));
  const right = Math.min(
    now.width,
    Math.ceil(Math.max(...boxes.map((box) => box[0] + box[2])) + 2),
  );
  const bottom = Math.min(
    now.height,
    Math.ceil(Math.max(...boxes.map((box) => box[1] + box[3])) + 2),
  );
  if (right <= left || bottom <= top) return { _tag: 'Same' };
  return { _tag: 'Region', box: [left, top, right - left, bottom - top] };
};

const meets = (a: Box, b: Box) =>
  a[0] < b[0] + b[2] && b[0] < a[0] + a[2] && a[1] < b[1] + b[3] && b[1] < a[1] + a[3];

const measure = Effect.fn('Contrast.measure')(function* (
  browser: Browser,
  base: string,
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
  yield* step('goto', () => page.goto(base + path, { waitUntil: 'load' }));
  yield* step('eager', () => page.evaluate(eager));
  yield* step('settle', () => page.waitForFunction(settled));
  const rest = yield* measureRuns(page);
  if (width !== HOVER_WIDTH) return { rest, hover: [], hovered: 0, drawn: 0 };
  const targets = yield* step('targets', () => page.evaluate(markTargets, TARGET));
  const atRest = yield* step('paint at rest', () => page.evaluate(paintState, PAINT));
  if (targets.skipped.length > 0) {
    yield* Effect.logInfo('contrast.skipped').pipe(
      Effect.annotateLogs({ page: path, links: targets.skipped.join(' | ') }),
    );
  }
  const hover: Array<Measured> = [];
  let drawn = 0;
  for (const [index, name] of targets.names.entries()) {
    // The pointer must land on the link itself: one under another element
    // fails here, named, rather than measuring as at rest.
    const point = yield* step(`aim "${name}"`, () =>
      page.evaluate(pointAt, `[${TARGET}="${index}"]`),
    );
    if (!point.reaches) return yield* new PointerBlocked({ page: path, link: name });
    yield* step(`hover "${name}"`, () => page.mouse.move(point.x, point.y));
    yield* step(`still "${name}"`, () =>
      page.waitForFunction(still, [], { timeout: STEP_TIMEOUT }),
    );
    const underPointer = yield* step(`paint "${name}"`, () => page.evaluate(paintState, PAINT));
    const change = changeOf(atRest, underPointer);
    if (change._tag === 'Same') continue;
    drawn += 1;
    const runs = yield* measureRegion(page, change.box);
    hover.push(...runs.map((run) => ({ ...run, text: `hover "${name}": ${run.text}` })));
  }
  return { rest, hover, hovered: targets.names.length, drawn };
}, Effect.scoped);

/** Every run on the page, measured against the page as drawn without its text. */
const measureRuns = Effect.fn('Contrast.measureRuns')(function* (page: Page) {
  const runs = yield* step('runs', () => page.evaluate(collectRuns, HIDE));
  const shot = yield* step('shot', () => page.screenshot({ fullPage: true, type: 'png' }));
  const measured = yield* step('contrast', () =>
    page.evaluate(contrastOf, { data: shot.toString('base64'), origin: [0, 0] as const, runs }),
  );
  yield* step('reveal', () => page.evaluate(reveal, HIDE));
  return measured;
});

/** The runs that meet `box`, measured against a shot of that region drawn without its text. */
const measureRegion = Effect.fn('Contrast.measureRegion')(function* (page: Page, box: Box) {
  const all = yield* step('runs', () => page.evaluate(collectRuns, HIDE));
  const runs = all.filter((run) => run.rects.some((rect) => meets(rect, box)));
  if (runs.length === 0) {
    yield* step('reveal', () => page.evaluate(reveal, HIDE));
    return [];
  }
  const [x, y, width, height] = box;
  const shot = yield* step('shot', () =>
    page.screenshot({ fullPage: true, type: 'png', clip: { x, y, width, height } }),
  );
  const measured = yield* step('contrast', () =>
    page.evaluate(contrastOf, { data: shot.toString('base64'), origin: [x, y] as const, runs }),
  );
  yield* step('reveal', () => page.evaluate(reveal, HIDE));
  return measured;
});

const byMargin = Order.mapInput(Order.Number, (run: Measured) => run.p95 / run.bar);

const contrast = HttpServer.addressFormattedWith((base) =>
  Effect.gen(function* () {
    const browser = yield* Effect.acquireRelease(
      step('launch', () => chromium.launch({ channel: 'chrome' })),
      (opened) => Effect.promise(() => opened.close()),
    );
    const boards = WIDTHS.flatMap((width) => PAGES.map(({ path }) => ({ path, width })));
    const results = yield* Effect.forEach(
      boards,
      (board) =>
        Effect.map(measure(browser, base, board.path, board.width), (measured) => ({
          ...board,
          measured,
        })),
      { concurrency: CONCURRENCY },
    );
    let under = 0;
    for (const { path, width, measured } of results) {
      const runs = [...measured.rest, ...measured.hover];
      const failing = runs.filter((run) => run.p95 < run.bar);
      under += failing.length;
      const lowest = Arr.head(Arr.sort(runs, byMargin));
      yield* Effect.logInfo('contrast.page').pipe(
        Effect.annotateLogs({
          page: path,
          width,
          runs: measured.rest.length,
          hovered: measured.hovered,
          drawn: measured.drawn,
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
    if (under > 0) return yield* new ContrastShort({ under });
    yield* Effect.logInfo('contrast.done').pipe(Effect.annotateLogs({ under }));
  }).pipe(Effect.scoped),
);

/**
 * `dist/` through the Worker's policy, for as long as the measure runs, on a
 * port the system picks, so two workspaces can measure at once.
 */
const app = Effect.gen(function* () {
  const request = yield* HttpServerRequest.HttpServerRequest;
  return yield* respond(request);
});

const Preview = HttpServer.serve(app).pipe(
  Layer.provide(layerDirectory('dist')),
  Layer.provideMerge(BunHttpServer.layer({ port: 0, hostname: '127.0.0.1' })),
  Layer.provide(BunServices.layer),
);

contrast.pipe(Effect.provide(Preview), BunRuntime.runMain);
