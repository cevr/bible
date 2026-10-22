/**
 * `bun run computed`: what Chrome computes for the built home page, where
 * reading the sources as text cannot hold it. It serves `dist/` through the
 * Worker's policy (as `bun run preview` does) and holds two things.
 *
 * The healing leaf (`LEAF_HOLD`). On the Health and Cure card, each part of
 * the leaf's drawing (the blade's group and the stem's path) is read with
 * `getComputedStyle` and its matrix in the drawing (`getCTM`), each running
 * transition finished first so the value read is the one it settles at:
 * at rest, under a fine pointer's hover, under keyboard focus, for a reader
 * who asks for less motion, and under a coarse pointer (a hover and a tap).
 * Stirred, each part turns 5deg about the stem's foot (the first point of
 * the stem's path), by `rotate` alone, the foot held still; at rest it turns
 * 0deg. Its transition is `rotate`, over the duration and with the easing
 * the root's `--motion-emblem` and `--motion-ease` compute to, with no delay
 * and no animation. Less motion and a coarse pointer leave both parts at
 * rest in every state (a tap leaves no card stirred). A token set off the
 * root, a stir past 1, a reset by `all` or any other way a rule moves the
 * leaf changes what Chrome computes, so it fails here, however it is written.
 *
 * The content policy (`IMAGE_HOLD`). A data-URL picture is put on the page
 * three ways: an `<img>`, an element's `background-image` set on its style,
 * and a rule inserted into the site's stylesheet. Under the policy every
 * response carries, each is refused (a `securitypolicyviolation` for
 * `img-src`), the `<img>` has no size, and no pixel of the picture's red is
 * drawn; one of the site's own pictures loads beside them. The same probe in
 * a context that ignores the policy draws the red, so the probe can see a
 * picture that paints.
 *
 * Build first (`bun run build`); the run fails naming each problem. The gate
 * runs it after the build (`gate:timed`).
 */
import { BunHttpServer, BunRuntime, BunServices } from '@effect/platform-bun';
import { chromium, type Browser, type BrowserContextOptions, type Page } from '@playwright/test';
import { Data, Effect, Layer } from 'effect';
import { HttpServer, HttpServerRequest } from 'effect/http';
import sharp from 'sharp';

import { layerPreview } from '../src/mail/local.ts';
import { layerDirectory } from '../src/worker/assets.ts';
import { respond } from '../src/worker/respond.ts';

const LEAF_HOLD =
  'the healing leaf, as Chrome computes it, rests at 0deg and turns 5deg about its stem’s foot on hover and on keyboard focus, on the root’s motion tokens, and stays at rest for less motion and under a coarse pointer';
const IMAGE_HOLD =
  'a data URL in an img, a style and a stylesheet rule is refused by the content policy and paints nothing, where the same probe without the policy paints';

/** The page the leaf is on, and the card's link a keyboard reaches. */
const HOME = '/';
const CARD_LINK = '.card:has(.emblem-remedies) h3 a';
const LEAF = '.emblem-remedies svg';
/** How far, in degrees, a stirred part turns. */
const SWAY = 5;
/** How close a measured number must come to what is held. */
const EPSILON = 0.01;
/** How long one step in the browser may take. */
const STEP_TIMEOUT = 5000;
/** At most this many presses of Tab to reach the card's link. */
const TABS = 80;

class BrowserError extends Data.TaggedError('BrowserError')<{
  readonly step: string;
  readonly cause: unknown;
}> {
  override get message() {
    return `the browser failed at ${this.step}: ${String(this.cause)}`;
  }
}

class ComputedWrong extends Data.TaggedError('ComputedWrong')<{
  readonly problems: ReadonlyArray<string>;
}> {
  override get message() {
    return `${this.problems.length} problem(s):\n${this.problems.join('\n')}`;
  }
}

const step = <A>(name: string, run: () => PromiseLike<A>) =>
  Effect.tryPromise({
    try: () => run(),
    catch: (cause) => new BrowserError({ step: name, cause }),
  });

/** One part of the leaf as Chrome computes it. */
interface Part {
  readonly tag: string;
  readonly origin: string;
  readonly rotate: string;
  readonly transform: string;
  readonly translate: string;
  readonly scale: string;
  readonly property: string;
  readonly duration: string;
  readonly easing: string;
  readonly delay: string;
  readonly animation: string;
  /** Where the part's matrix puts the stem's foot, and the angle it turns by, in degrees. */
  readonly foot: readonly [number, number];
  readonly angle: number;
}

/** The leaf as Chrome computes it, with the root's motion tokens as a transition computes them. */
interface Leaf {
  readonly found: boolean;
  readonly foot: readonly [number, number];
  readonly duration: string;
  readonly easing: string;
  readonly parts: ReadonlyArray<Part>;
}

/** In the page: the leaf's parts as computed once every transition on them has finished. */
const readLeaf = (selector: string): Leaf => {
  const svg = document.querySelector(selector);
  const empty: Leaf = { found: false, foot: [0, 0], duration: '', easing: '', parts: [] };
  if (!(svg instanceof SVGSVGElement)) return empty;
  const stem = svg.querySelector(':scope > path');
  if (!(stem instanceof SVGPathElement)) return empty;
  const start = stem.getPointAtLength(0);
  const root = getComputedStyle(document.documentElement);
  const probe = document.createElement('i');
  probe.style.transitionDuration = root.getPropertyValue('--motion-emblem').trim();
  probe.style.transitionTimingFunction = root.getPropertyValue('--motion-ease').trim();
  document.documentElement.append(probe);
  const tokens = getComputedStyle(probe);
  const duration = tokens.transitionDuration;
  const easing = tokens.transitionTimingFunction;
  probe.remove();
  const parts = [...svg.children].flatMap((part) => {
    if (!(part instanceof SVGGraphicsElement)) return [];
    for (const running of part.getAnimations()) running.finish();
    const style = getComputedStyle(part);
    const matrix = (svg.getScreenCTM() || new DOMMatrix())
      .inverse()
      .multiply(part.getScreenCTM() || new DOMMatrix());
    const moved = new DOMPoint(start.x, start.y).matrixTransform(matrix);
    return [
      {
        tag: part.tagName,
        origin: style.transformOrigin,
        rotate: style.rotate,
        transform: style.transform,
        translate: style.translate,
        scale: style.scale,
        property: style.transitionProperty,
        duration: style.transitionDuration,
        easing: style.transitionTimingFunction,
        delay: style.transitionDelay,
        animation: style.animationName,
        foot: [moved.x, moved.y] as const,
        angle: (Math.atan2(matrix.b, matrix.a) * 180) / Math.PI,
      },
    ];
  });
  return { found: true, foot: [start.x, start.y], duration, easing, parts };
};

/** A computed `rotate` in degrees about the screen's axis: `none` is 0, a turn about another axis NaN. */
const degreesOf = (rotate: string) => {
  if (rotate === 'none') return 0;
  const turn = /^(-?[\d.]+(?:e-?\d+)?)deg$/u.exec(rotate.trim());
  if (!turn) return Number.NaN;
  return Number(turn[1]);
};

/** A computed `transform-origin` as its two lengths in px; NaN for any other. */
const originOf = (origin: string): readonly [number, number] => {
  const [x = '', y = ''] = origin.trim().split(/\s+/u);
  const px = (length: string) => {
    const found = /^(-?[\d.]+)px$/u.exec(length);
    if (!found) return Number.NaN;
    return Number(found[1]);
  };
  return [px(x), px(y)];
};

const near = (a: number, b: number) => Math.abs(a - b) <= EPSILON;

/**
 * What is wrong with one part of the leaf in one state (`at`): `turned` is
 * how far it is held to turn there, `timed` whether its transition is held
 * to the root's tokens.
 */
const partProblems = (at: string, leaf: Leaf, part: Part, turned: number, timed: boolean) => {
  const problems: Array<string> = [];
  const [footX, footY] = leaf.foot;
  const [x, y] = originOf(part.origin);
  if (!near(x, footX) || !near(y, footY))
    problems.push(`${at}: turns about ${part.origin}, not the stem's foot ${footX}px ${footY}px`);
  if (!near(Math.abs(degreesOf(part.rotate)), turned))
    problems.push(`${at}: rotate ${part.rotate}, not ${turned}deg in magnitude`);
  for (const [name, value] of [
    ['transform', part.transform],
    ['translate', part.translate],
    ['scale', part.scale],
    ['animation', part.animation],
  ] as const)
    if (value !== 'none') problems.push(`${at}: ${name} ${value}, not none`);
  const [movedX, movedY] = part.foot;
  if (!near(movedX, footX) || !near(movedY, footY))
    problems.push(`${at}: the stem's foot is drawn at ${movedX} ${movedY}, not held still`);
  if (!near(Math.abs(part.angle), turned))
    problems.push(`${at}: its matrix turns ${part.angle}deg, not ${turned}deg in magnitude`);
  if (part.property !== 'rotate')
    problems.push(`${at}: its transition moves ${part.property}, not rotate`);
  if (part.delay !== '0s') problems.push(`${at}: its transition waits ${part.delay}`);
  if (timed && part.duration !== leaf.duration)
    problems.push(`${at}: its transition takes ${part.duration}, not the root's ${leaf.duration}`);
  if (timed && part.easing !== leaf.easing)
    problems.push(`${at}: its transition eases ${part.easing}, not the root's ${leaf.easing}`);
  return problems;
};

/**
 * What is wrong with the leaf in one state: `turned` is how far it is held
 * to turn there (0 at rest, `SWAY` in magnitude stirred). `timed` holds the
 * transition to the root's tokens (less motion shortens every transition,
 * so it is not held there).
 */
const leafProblems = (state: string, leaf: Leaf, turned: number, timed: boolean) => {
  if (!leaf.found) return [`${state}: no leaf at ${LEAF} with a stem path`];
  const problems: Array<string> = [];
  const tags = leaf.parts.map(({ tag }) => tag).join(' ');
  if (tags !== 'g path') problems.push(`${state}: the leaf's parts are "${tags}", not "g path"`);
  for (const part of leaf.parts)
    problems.push(...partProblems(`${state}: ${part.tag}`, leaf, part, turned, timed));
  const turns = leaf.parts.map(({ rotate }) => degreesOf(rotate));
  if (new Set(turns).size > 1)
    problems.push(`${state}: the parts turn apart (${turns.join(', ')})`);
  return problems;
};

/** In the page: whether a media query holds. */
const matches = (query: string) => matchMedia(query).matches;

/** In the page: whether the focused element is the one `selector` names, focused as a keyboard focuses. */
const focusedOn = (selector: string) => {
  const target = document.querySelector(selector);
  return (
    document.activeElement === target &&
    target instanceof Element &&
    target.matches(':focus-visible')
  );
};

/** In the page: a click on the link `selector` names stays on the page, so a tap can be read where it landed. */
const stay = (selector: string) => {
  document.querySelector(selector)?.addEventListener('click', (event) => event.preventDefault());
};

/**
 * In the page: the card of the link `selector` names is no longer pressed.
 * Chrome holds a tapped element `:active` a moment past the tap's end, as a
 * press the eye can see; a card stirs while pressed, so its rest is read
 * once the press is over.
 */
const released = (selector: string) =>
  !document.querySelector(selector)?.closest('.card')?.matches(':active');

/** A page of `context` at the home page, its pictures in. */
const opened = Effect.fn('computed.open')(function* (
  browser: Browser,
  base: string,
  options: BrowserContextOptions,
) {
  const context = yield* Effect.acquireRelease(
    step('context', () => browser.newContext(options)),
    (made) => Effect.promise(() => made.close()),
  );
  const page = yield* step('page', () => context.newPage());
  page.setDefaultTimeout(STEP_TIMEOUT);
  yield* step('goto', () => page.goto(base + HOME, { waitUntil: 'load' }));
  return page;
});

const leafOf = (page: Page) => step('read leaf', () => page.evaluate(readLeaf, LEAF));

/** Presses Tab until the card's link holds a keyboard's focus. */
const tabToCard = Effect.fn('computed.tab')(function* (page: Page) {
  for (let press = 0; press < TABS; press += 1) {
    if (yield* step('focused', () => page.evaluate(focusedOn, CARD_LINK))) return true;
    yield* step('tab', () => page.keyboard.press('Tab'));
  }
  return yield* step('focused', () => page.evaluate(focusedOn, CARD_LINK));
});

/** Media a context must hold, each as a query and whether it should match. */
const mediaProblems = Effect.fn('computed.media')(function* (
  page: Page,
  state: string,
  queries: ReadonlyArray<readonly [string, boolean]>,
) {
  const problems: Array<string> = [];
  for (const [query, expected] of queries) {
    const held = yield* step('media', () => page.evaluate(matches, query));
    if (held !== expected)
      problems.push(`${state}: ${query} is ${held}, the check needs ${expected}`);
  }
  return problems;
});

/** The leaf at rest, hovered and focused, with a fine pointer that hovers. */
const finePointer = Effect.fn('computed.fine')(function* (browser: Browser, base: string) {
  const page = yield* opened(browser, base, { viewport: { width: 1440, height: 900 } });
  const problems = [
    ...(yield* mediaProblems(page, 'fine pointer', [
      ['(hover: hover) and (pointer: fine)', true],
      ['(prefers-reduced-motion: reduce)', false],
    ])),
    ...leafProblems('at rest', yield* leafOf(page), 0, true),
  ];
  yield* step('hover', () => page.hover(CARD_LINK));
  problems.push(...leafProblems('hovered', yield* leafOf(page), SWAY, true));
  yield* step('leave', () => page.mouse.move(0, 0));
  problems.push(...leafProblems('left', yield* leafOf(page), 0, true));
  if (!(yield* tabToCard(page))) problems.push(`focused: Tab never reached ${CARD_LINK}`);
  problems.push(...leafProblems('focused', yield* leafOf(page), SWAY, true));
  return problems;
});

/** The leaf for a reader who asks for less motion: at rest, hovered and focused. */
const lessMotion = Effect.fn('computed.less')(function* (browser: Browser, base: string) {
  const page = yield* opened(browser, base, {
    viewport: { width: 1440, height: 900 },
    reducedMotion: 'reduce',
  });
  const problems = [
    ...(yield* mediaProblems(page, 'less motion', [['(prefers-reduced-motion: reduce)', true]])),
    ...leafProblems('less motion, at rest', yield* leafOf(page), 0, false),
  ];
  yield* step('hover', () => page.hover(CARD_LINK));
  problems.push(...leafProblems('less motion, hovered', yield* leafOf(page), 0, false));
  if (!(yield* tabToCard(page))) problems.push(`less motion: Tab never reached ${CARD_LINK}`);
  problems.push(...leafProblems('less motion, focused', yield* leafOf(page), 0, false));
  return problems;
});

/** The leaf under a coarse pointer that cannot hover: pointed at, then tapped. */
const coarsePointer = Effect.fn('computed.coarse')(function* (browser: Browser, base: string) {
  const page = yield* opened(browser, base, {
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });
  const problems = [
    ...(yield* mediaProblems(page, 'coarse pointer', [
      ['(pointer: coarse)', true],
      ['(hover: none)', true],
    ])),
  ];
  yield* step('hover', () => page.hover(CARD_LINK));
  problems.push(...leafProblems('coarse pointer, pointed', yield* leafOf(page), 0, true));
  yield* step('stay', () => page.evaluate(stay, CARD_LINK));
  yield* step('tap', () => page.tap(CARD_LINK));
  yield* step('released', () => page.waitForFunction(released, CARD_LINK));
  problems.push(...leafProblems('coarse pointer, tapped', yield* leafOf(page), 0, true));
  return problems;
});

/** What the image probe saw. */
interface Probed {
  readonly violations: ReadonlyArray<string>;
  readonly dataWidth: number;
  readonly ownWidth: number;
  readonly boxes: ReadonlyArray<readonly [number, number, number, number]>;
}

/**
 * In the page: puts a data-URL picture on the page as an `<img>`, as a
 * style's `background-image` and through a rule inserted into the site's
 * stylesheet, with one of the site's own pictures beside them, each in a
 * box of its own at the top of the view; records each content policy
 * refusal.
 */
const injectProbe = (input: { readonly picture: string; readonly own: string }) => {
  const seen: Array<string> = [];
  Object.assign(window, { probeViolations: seen });
  document.addEventListener('securitypolicyviolation', (event) => {
    seen.push(`${event.effectiveDirective} ${event.blockedURI.slice(0, 8)}`);
  });
  const placed = (element: HTMLElement, left: number) => {
    Object.assign(element.style, {
      position: 'fixed',
      top: '0px',
      left: `${left}px`,
      width: '64px',
      height: '64px',
      zIndex: '2147483647',
      margin: '0',
      padding: '0',
      border: '0',
      backgroundColor: 'rgb(255, 255, 255)',
    });
    element.dataset['probe'] = String(left);
    document.body.append(element);
  };
  const image = document.createElement('img');
  image.alt = '';
  image.src = `data:image/png;base64,${input.picture}`;
  placed(image, 0);
  const styled = document.createElement('div');
  styled.style.backgroundImage = `url("data:image/png;base64,${input.picture}")`;
  styled.style.backgroundSize = 'cover';
  placed(styled, 80);
  const ruled = document.createElement('div');
  ruled.className = 'probe-ruled';
  const sheet = [...document.styleSheets].find((each) => Boolean(each.href));
  sheet?.insertRule(
    `.probe-ruled{background-image:url("data:image/png;base64,${input.picture}");background-size:cover}`,
    sheet.cssRules.length,
  );
  placed(ruled, 160);
  const own = document.createElement('img');
  own.alt = '';
  own.src = input.own;
  placed(own, 240);
};

/** In the page: the probe's pictures have each loaded or failed, and each refusal it waits on is in. */
const probeSettled = (refusals: number) => {
  const images = [...document.querySelectorAll('img[data-probe]')];
  const seen: unknown = Reflect.get(window, 'probeViolations');
  return (
    images.every((image) => image instanceof HTMLImageElement && image.complete) &&
    Array.isArray(seen) &&
    seen.length >= refusals
  );
};

/** In the page: what the probe saw. */
const readProbe = (): Probed => {
  const sized = (selector: string) => {
    const image = document.querySelector(selector);
    if (image instanceof HTMLImageElement) return image.naturalWidth;
    return -1;
  };
  const seen: unknown = Reflect.get(window, 'probeViolations');
  const boxes = [...document.querySelectorAll('[data-probe]')].map((element) => {
    const box = element.getBoundingClientRect();
    return [box.left, box.top, box.width, box.height] as const;
  });
  const violations: Array<string> = [];
  if (Array.isArray(seen)) violations.push(...seen.map(String));
  return {
    violations,
    dataWidth: sized('img[data-probe="0"]'),
    ownWidth: sized('img[data-probe="240"]'),
    boxes,
  };
};

/** The pixels of a shot box that are the probe picture's red. */
const redPixels = Effect.fn('computed.red')(function* (page: Page, box: readonly number[]) {
  const [x = 0, y = 0, width = 0, height = 0] = box;
  const shot = yield* step('shot', () =>
    page.screenshot({ type: 'png', clip: { x, y, width, height } }),
  );
  const { data, info } = yield* step('pixels', () =>
    sharp(shot).removeAlpha().raw().toBuffer({ resolveWithObject: true }),
  );
  let red = 0;
  for (let at = 0; at < info.width * info.height * 3; at += 3)
    if ((data[at] ?? 0) > 200 && (data[at + 1] ?? 255) < 60 && (data[at + 2] ?? 255) < 60) red += 1;
  return red;
});

/** The probe on a page that keeps the content policy (`policy`) or ignores it. */
const probe = Effect.fn('computed.probe')(function* (
  browser: Browser,
  base: string,
  picture: string,
  policy: boolean,
) {
  const page = yield* opened(browser, base, {
    viewport: { width: 1440, height: 900 },
    bypassCSP: !policy,
  });
  yield* step('inject', () => page.evaluate(injectProbe, { picture, own: '/icon-192.png' }));
  let refusals = 0;
  if (policy) refusals = 3;
  // A policy that lets the picture in sends fewer refusals than waited on:
  // the wait ends at its timeout, and the reads below name what was seen.
  yield* step('settle', () => page.waitForFunction(probeSettled, refusals)).pipe(
    Effect.catchTag('BrowserError', (error) =>
      Effect.logWarning('computed.unsettled').pipe(
        Effect.annotateLogs({ cause: String(error.cause) }),
      ),
    ),
  );
  const seen = yield* step('read probe', () => page.evaluate(readProbe));
  const [image, styled, ruled] = seen.boxes;
  const reds = [];
  for (const box of [image, styled, ruled]) reds.push(yield* redPixels(page, box ?? [0, 0, 1, 1]));
  return { seen, reds };
});

/** What is wrong with the probe: refused and unpainted under the policy, painted without it. */
const imageProblems = Effect.fn('computed.images')(function* (browser: Browser, base: string) {
  const picture = (yield* step('picture', () =>
    sharp({ create: { width: 16, height: 16, channels: 3, background: '#ff0000' } })
      .png()
      .toBuffer(),
  )).toString('base64');
  const kept = yield* probe(browser, base, picture, true);
  const ignored = yield* probe(browser, base, picture, false);
  const problems: Array<string> = [];
  const refused = kept.seen.violations.filter((seen) => /^img-src data\b/u.test(seen));
  if (refused.length < 3)
    problems.push(
      `policy: ${refused.length} img-src refusals of 3 (${kept.seen.violations.join('; ')})`,
    );
  if (kept.seen.dataWidth !== 0)
    problems.push(`policy: the data-URL img has width ${kept.seen.dataWidth}, not 0`);
  if (kept.seen.ownWidth <= 0) problems.push(`policy: the site's own picture did not load`);
  for (const [i, red] of kept.reds.entries())
    if (red > 0) problems.push(`policy: probe ${i} painted ${red} red pixels`);
  if (ignored.seen.dataWidth <= 0)
    problems.push('no policy: the data-URL img did not load, so the probe cannot see a paint');
  for (const [i, red] of ignored.reds.entries())
    if (red === 0) problems.push(`no policy: probe ${i} painted no red, so it cannot see a paint`);
  yield* Effect.logInfo('computed.images').pipe(
    Effect.annotateLogs({
      refused: refused.length,
      dataWidth: kept.seen.dataWidth,
      ownWidth: kept.seen.ownWidth,
      red: kept.reds.join(','),
      redWithoutPolicy: ignored.reds.join(','),
    }),
  );
  return problems;
});

const computed = HttpServer.addressFormattedWith((base) =>
  Effect.gen(function* () {
    const browser = yield* Effect.acquireRelease(
      step('launch', () => chromium.launch({ channel: 'chrome' })),
      (launched) => Effect.promise(() => launched.close()),
    );
    const [fine, less, coarse, images] = yield* Effect.all(
      [
        finePointer(browser, base),
        lessMotion(browser, base),
        coarsePointer(browser, base),
        imageProblems(browser, base),
      ],
      { concurrency: 'unbounded' },
    );
    const leaf = [...fine, ...less, ...coarse];
    yield* Effect.logInfo('computed.leaf').pipe(Effect.annotateLogs({ problems: leaf.length }));
    const problems = [
      ...leaf.map((problem) => `leaf ${problem}`),
      ...images.map((problem) => `images ${problem}`),
    ];
    if (problems.length > 0) return yield* new ComputedWrong({ problems });
    yield* Effect.logInfo('computed.done').pipe(
      Effect.annotateLogs({ leaf: LEAF_HOLD, images: IMAGE_HOLD }),
    );
  }).pipe(Effect.scoped),
);

/**
 * `dist/` through the Worker's policy, for as long as the check runs, on a
 * port the system picks, so two workspaces can check at once.
 */
const app = Effect.gen(function* () {
  const request = yield* HttpServerRequest.HttpServerRequest;
  return yield* respond(request);
});

const Preview = HttpServer.serve(app).pipe(
  Layer.provide(layerDirectory('dist')),
  Layer.provide(layerPreview('tmp/outbox')),
  Layer.provideMerge(BunHttpServer.layer({ port: 0, hostname: '127.0.0.1' })),
  Layer.provide(BunServices.layer),
);

computed.pipe(Effect.provide(Preview), BunRuntime.runMain);
