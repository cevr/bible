/**
 * `bun run computed`: what Chrome computes for the built home page, where
 * reading the sources as text cannot hold it. It serves `dist/` through the
 * Worker's policy (as `bun run preview` does) and holds two things.
 *
 * The healing leaf (`LEAF_HOLD`), on the Health and Cure card. What it
 * reads, and nothing more:
 *
 * - the home page, in the light scheme, at 1x, with script on;
 * - heights 900 (a fine pointer, less motion) and 844 (a coarse pointer);
 * - the narrowest and widest whole px of each band the width conditions
 *   (`min-width`, `max-width`, a range) of the media queries in the
 *   stylesheets under `dist/` make, as lightningcss reads them, from 320px
 *   to 1920px (wider when an edge is past either); a width condition it
 *   cannot place in px (a `calc()`, a `vw`, a `device-width`) is a problem;
 * - a fine pointer at rest, on the card's link, moved off it, and that link
 *   focused by Tab; less motion at rest, on the link and the link focused;
 *   a coarse pointer at rest, on the link, and a tap on it read after its
 *   release; each in a fresh page, read once every finite animation and
 *   transition in the card has finished;
 * - each part of the drawing (the blade's group and the stem's path): its
 *   computed `rotate`, `transform`, `translate`, `scale`, `transform-origin`,
 *   transition and `animation-name`, and its matrix on the page
 *   (`getScreenCTM`, scroll added);
 * - the `rotate`, `translate`, `scale`, `transform` and `animation-name` of
 *   each element from the drawing up to its card, and of each element inside
 *   a part.
 *
 * What it holds there: hovered and focused under a fine pointer, each part
 * turns 5deg in magnitude about the stem's foot (the first point of the
 * stem's path), both alike, on the page as in its own `rotate`, with no
 * other move and no growth from where it rested on the same page; in every
 * other state it reads, it rests where it was. Its transition is `rotate`,
 * with no delay, over the duration and with the easing the root's
 * `--motion-emblem` and `--motion-ease` compute to (less motion is not held
 * to them). Each element from the drawing up to its card, and each inside a
 * part, keeps in every state the values it had at rest; at rest, each of
 * them but the card has none, and each part stands on the page turned only
 * by its card's turn and the turns above it.
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
 * does not run it (owner, 2026-10-22: the gate is unit tests and lint): run
 * it by hand after a build, before a deploy.
 */
import { BunHttpServer, BunRuntime, BunServices } from '@effect/platform-bun';
import { chromium, type Browser, type BrowserContextOptions, type Page } from '@playwright/test';
import { Data, Effect, FileSystem, Layer, Path } from 'effect';
import { HttpServer, HttpServerRequest } from 'effect/http';
import { transform, type MediaCondition, type MediaFeatureValue } from 'lightningcss';
import sharp from 'sharp';

import { layerPreview } from '../src/mail/local.ts';
import { layerDirectory } from '../src/worker/assets.ts';
import { respond } from '../src/worker/respond.ts';

const LEAF_HOLD =
  'on the home page (light scheme, 1x, script on), at heights 900 and 844 and the narrowest and widest px of each band the built stylesheets’ width media queries make, the healing leaf turns 5deg about its stem’s foot on the page when the Health and Cure card’s link is hovered or focused by Tab under a fine pointer, with no other move and no growth, on the root’s motion tokens, and rests for less motion at rest, when pointed at and focused by Tab, and under a coarse pointer at rest, when pointed at and after a tap, by each part’s computed turn, pivot, transition and page matrix, with no element from its drawing to its card or inside its parts changing its rotate, translate, scale, transform or animation-name';
const IMAGE_HOLD =
  'a data URL in an img, a style and a stylesheet rule is refused by the content policy and paints nothing, where the same probe without the policy paints';

/** The built site, and its page the leaf is on, and the card's link a keyboard reaches. */
const DIST = 'dist';
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
/** How many widths are read at once, each in three pages. */
const WIDTHS_AT_ONCE = 4;

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

/** A 2D matrix as Chrome gives it, `[a, b, c, d, e, f]`: a point (x, y) goes to (ax + cy + e, bx + dy + f). */
type Matrix = readonly [number, number, number, number, number, number];

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
  /** The part's matrix from its drawing's units to the page's px, scroll included. */
  readonly page: Matrix;
}

/** One element from the drawing up to its card, by what can move it. */
interface Link {
  readonly name: string;
  readonly rotate: string;
  readonly translate: string;
  readonly scale: string;
  readonly transform: string;
  readonly animation: string;
}

/** The leaf as Chrome computes it, with the root's motion tokens as a transition computes them. */
interface Leaf {
  readonly found: boolean;
  readonly foot: readonly [number, number];
  readonly duration: string;
  readonly easing: string;
  readonly parts: ReadonlyArray<Part>;
  /** The drawing, each element it sits in, and its card, in that order. */
  readonly chain: ReadonlyArray<Link>;
  /** Every element inside each part, in document order. */
  readonly inner: ReadonlyArray<Link>;
  /** The degrees the card and every element it sits in turn it by on the page. */
  readonly cardTurn: number;
}

/**
 * In the page: the leaf's parts, and each element from its drawing up to
 * its card, as computed once every finite animation and transition in the
 * card has finished.
 */
const readLeaf = (selector: string): Leaf => {
  const empty: Leaf = {
    found: false,
    foot: [0, 0],
    duration: '',
    easing: '',
    parts: [],
    chain: [],
    inner: [],
    cardTurn: 0,
  };
  const svg = document.querySelector(selector);
  if (!(svg instanceof SVGSVGElement)) return empty;
  const stem = svg.querySelector(':scope > path');
  const card = svg.closest('.card');
  if (!(stem instanceof SVGPathElement) || !card) return empty;
  for (const running of card.getAnimations({ subtree: true }))
    if (running.effect?.getComputedTiming().endTime !== Infinity) running.finish();
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
  const pageOf = (part: SVGGraphicsElement): Matrix => {
    const screen = part.getScreenCTM() || new DOMMatrix([0, 0, 0, 0, 0, 0]);
    const { a, b, c, d, e, f } = new DOMMatrix().translate(scrollX, scrollY).multiply(screen);
    return [a, b, c, d, e, f];
  };
  const linkOf = (at: Element, name: string) => {
    const style = getComputedStyle(at);
    return {
      name,
      rotate: style.rotate,
      translate: style.translate,
      scale: style.scale,
      transform: style.transform,
      animation: style.animationName,
    };
  };
  const parts = [...svg.children].flatMap((part) => {
    if (!(part instanceof SVGGraphicsElement)) return [];
    const style = getComputedStyle(part);
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
        page: pageOf(part),
      },
    ];
  });
  // The drawing and every element it sits in, nearest first.
  const above = [...document.querySelectorAll('*')]
    .filter((each) => each.contains(svg))
    .toReversed();
  const cardAt = above.indexOf(card);
  const chain = above
    .slice(0, cardAt + 1)
    .map((at) => linkOf(at, [at.tagName.toLowerCase(), ...at.classList].join('.')));
  const inner = [...svg.children].flatMap((part, p) =>
    [...part.querySelectorAll('*')].map((at, i) =>
      linkOf(at, `${part.tagName} ${p + 1}, its ${at.tagName} ${i + 1}`),
    ),
  );
  // The card's own turn and each turn above it: a 2D turn adds, whatever its origin.
  let cardTurn = 0;
  for (const at of above.slice(cardAt)) {
    const style = getComputedStyle(at);
    if (style.transform !== 'none') {
      const { a, b } = new DOMMatrix(style.transform);
      cardTurn += (Math.atan2(b, a) * 180) / Math.PI;
    }
    const turn = /^(-?[\d.]+(?:e-?\d+)?)deg$/u.exec(style.rotate.trim());
    if (turn) cardTurn += Number(turn[1]);
    else if (style.rotate !== 'none') cardTurn = Number.NaN;
  }
  return { found: true, foot: [start.x, start.y], duration, easing, parts, chain, inner, cardTurn };
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

/** `m` after `n`: the matrix that applies `n`, then `m`. */
const times = (m: Matrix, n: Matrix): Matrix => [
  m[0] * n[0] + m[2] * n[1],
  m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3],
  m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4],
  m[1] * n[4] + m[3] * n[5] + m[5],
];

const inverse = ([a, b, c, d, e, f]: Matrix): Matrix => {
  const det = a * d - b * c;
  return [d / det, -b / det, -c / det, a / det, (c * f - d * e) / det, (b * e - a * f) / det];
};

const applied = (m: Matrix, [x, y]: readonly [number, number]) =>
  [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]] as const;

/** The degrees a matrix turns by. */
const angleOf = (m: Matrix) => (Math.atan2(m[1], m[0]) * 180) / Math.PI;

/** What is wrong with a matrix that should be a turn alone (no stretch, no skew). */
const skewOf = (at: string, what: string, m: Matrix) => {
  const problems: Array<string> = [];
  if (
    !near(Math.hypot(m[0], m[1]), Math.hypot(m[2], m[3])) ||
    !near(m[0], m[3]) ||
    !near(m[1], -m[2])
  )
    problems.push(`${at}: ${what} stretches or skews (${m.map((n) => n.toFixed(4)).join(' ')})`);
  return problems;
};

/**
 * What is wrong with one part of the leaf in one state (`at`), against the
 * same part at rest on the same page (`rest`): `turned` is how far it is
 * held to turn there, `timed` whether its transition is held to the root's
 * tokens.
 */
const partProblems = (
  at: string,
  leaf: Leaf,
  part: Part,
  rest: Part,
  turned: number,
  timed: boolean,
) => {
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
  // On the page: what moved the part from where it rests is a turn about the stem's foot alone.
  const moved = times(inverse(rest.page), part.page);
  const [movedX, movedY] = applied(moved, leaf.foot);
  if (!near(movedX, footX) || !near(movedY, footY))
    problems.push(
      `${at}: on the page the stem's foot moved to ${movedX.toFixed(3)} ${movedY.toFixed(3)} in the drawing's units, not held still`,
    );
  if (!near(Math.abs(angleOf(moved)), turned))
    problems.push(
      `${at}: on the page it turns ${angleOf(moved).toFixed(3)}deg from its rest, not ${turned}deg in magnitude`,
    );
  problems.push(...skewOf(at, 'its move on the page', moved));
  const grown = Math.hypot(moved[0], moved[1]);
  if (!near(grown, 1))
    problems.push(`${at}: on the page it grows ${grown.toFixed(3)}x from its rest, not 1x`);
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
 * What is wrong with the leaf at rest as a page first shows it: each
 * element from the drawing up to the card, the card left out, and each
 * element inside a part, moves it by nothing of its own, and each part
 * stands on the page turned only as its card turns it.
 */
const restProblems = (state: string, leaf: Leaf) => {
  const problems: Array<string> = [];
  for (const link of [...leaf.chain.slice(0, -1), ...leaf.inner])
    for (const [name, value] of Object.entries(link))
      if (name !== 'name' && value !== 'none')
        problems.push(`${state}: ${link.name} has ${name} ${value} of its own, not none`);
  for (const part of leaf.parts) {
    if (!near(angleOf(part.page), leaf.cardTurn))
      problems.push(
        `${state}: ${part.tag} stands turned ${angleOf(part.page).toFixed(3)}deg on the page, not its card's ${leaf.cardTurn.toFixed(3)}deg`,
      );
    problems.push(...skewOf(`${state}: ${part.tag}`, 'its matrix on the page', part.page));
  }
  return problems;
};

/**
 * What is wrong with the leaf in one state, against the leaf at rest on the
 * same page: `turned` is how far it is held to turn there (0 at rest, `SWAY`
 * in magnitude stirred). `timed` holds the transition to the root's tokens
 * (less motion shortens every transition, so it is not held there). Each
 * element from the drawing up to the card, and each inside a part, holds
 * what it had at rest.
 */
const leafProblems = (state: string, rest: Leaf, leaf: Leaf, turned: number, timed: boolean) => {
  if (!leaf.found || !rest.found)
    return [`${state}: no leaf at ${LEAF} with a stem path in a card`];
  const problems: Array<string> = [];
  const tags = leaf.parts.map(({ tag }) => tag).join(' ');
  if (tags !== 'g path') problems.push(`${state}: the leaf's parts are "${tags}", not "g path"`);
  for (const [i, part] of leaf.parts.entries()) {
    const resting = rest.parts[i];
    if (resting)
      problems.push(...partProblems(`${state}: ${part.tag}`, leaf, part, resting, turned, timed));
  }
  const turns = leaf.parts.map(({ rotate }) => degreesOf(rotate));
  if (new Set(turns).size > 1)
    problems.push(`${state}: the parts turn apart (${turns.join(', ')})`);
  if (leaf.inner.length !== rest.inner.length)
    problems.push(
      `${state}: the parts hold ${leaf.inner.length} elements, not the ${rest.inner.length} at rest`,
    );
  const restLinks = [...rest.chain, ...rest.inner];
  for (const [i, link] of [...leaf.chain, ...leaf.inner].entries()) {
    const resting = restLinks[i];
    for (const [name, value] of Object.entries(link)) {
      const was = Reflect.get(resting ?? {}, name);
      if (value !== was)
        problems.push(`${state}: ${link.name} has ${name} ${value}, not ${String(was)} as at rest`);
    }
  }
  return problems;
};

/** The px a media query's length is: an em or rem in a media query is the initial 16px. */
const PX = new Map([
  ['px', 1],
  ['em', 16],
  ['rem', 16],
]);

/** The edges, in px, the width conditions of a built stylesheet's media queries put, and each condition the check cannot place. */
const widthEdgesOf = (file: string, code: string) => {
  const edges: Array<number> = [];
  const unread: Array<string> = [];
  const placed = (value: MediaFeatureValue, written: string) => {
    if (value.type === 'length' && value.value.type === 'value') {
      const { unit, value: length } = value.value.value;
      const per = PX.get(unit);
      if (per) {
        edges.push(length * per);
        return;
      }
      unread.push(`${file}: a ${written} query in ${unit}, which the check cannot place in px`);
      return;
    }
    unread.push(
      `${file}: a ${written} query on a ${value.type} value, which the check cannot place in px`,
    );
  };
  const walk = (condition: MediaCondition): void => {
    if (condition.type === 'operation') {
      for (const each of condition.conditions) walk(each);
      return;
    }
    if (condition.type === 'not') {
      walk(condition.value);
      return;
    }
    if (condition.type === 'unknown') {
      unread.push(
        `${file}: a media condition lightningcss cannot read (${condition.value.length} tokens)`,
      );
      return;
    }
    const feature = condition.value;
    const name = String(feature.name);
    if (name !== 'width') {
      if (/width/u.test(name))
        unread.push(`${file}: a ${name} query, which the check does not lay out`);
      return;
    }
    if (feature.type === 'plain' || feature.type === 'range') placed(feature.value, name);
    if (feature.type === 'interval') {
      placed(feature.start, name);
      placed(feature.end, name);
    }
  };
  transform({
    filename: file,
    code: new TextEncoder().encode(code),
    visitor: {
      MediaQuery(query) {
        if (query.condition) walk(query.condition);
        return query;
      },
    },
  });
  return { edges, unread };
};

/** The narrowest phone a page is laid out for, and a wide screen: the ends of the widths read. */
const NARROWEST = 320;
const WIDE = 1920;

/**
 * One width at each edge of every band the edges make: the widths on each
 * side of an edge and at it, in whole px as a viewport has them, grouped
 * into bands by which side of each edge they fall on, each band read at its
 * narrowest and its widest.
 */
const bandWidths = (edges: ReadonlyArray<number>) => {
  const narrowest = Math.max(1, Math.min(NARROWEST, ...edges.map((edge) => Math.floor(edge) - 1)));
  const widest = Math.max(WIDE, ...edges.map((edge) => Math.ceil(edge) + 1));
  const candidates = [
    ...new Set([
      narrowest,
      widest,
      ...edges.flatMap((edge) => [
        Math.floor(edge) - 1,
        Math.floor(edge),
        Math.ceil(edge),
        Math.ceil(edge) + 1,
      ]),
    ]),
  ]
    .filter((width) => width >= narrowest && width <= widest)
    .toSorted((a, b) => a - b);
  const sides = candidates.map((width) => edges.map((edge) => Math.sign(width - edge)).join(','));
  return candidates.filter(
    (_, i) =>
      i === 0 ||
      i === candidates.length - 1 ||
      sides[i - 1] !== sides[i] ||
      sides[i + 1] !== sides[i],
  );
};

/** The widths to read the leaf at, from every stylesheet the build emits, and each width query the check cannot place. */
const widthsOfBuild = Effect.fn('computed.widths')(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const sheets = (yield* fs.readDirectory(DIST, { recursive: true })).filter((file) =>
    file.endsWith('.css'),
  );
  const edges: Array<number> = [];
  const unread: Array<string> = [];
  for (const sheet of sheets) {
    const read = widthEdgesOf(sheet, yield* fs.readFileString(path.join(DIST, sheet)));
    edges.push(...read.edges);
    unread.push(...read.unread);
  }
  if (sheets.length === 0) unread.push(`no stylesheet under ${DIST}: build first`);
  return { widths: bandWidths(edges), edges, unread };
});

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

/** A page of a new context at the home page, its pictures in; the context closes with the scope. */
const opened = Effect.fn('computed.open')(function* (
  browser: Browser,
  base: string,
  options: BrowserContextOptions,
) {
  const context = yield* Effect.acquireRelease(
    step('context', () =>
      browser.newContext({
        colorScheme: 'light',
        deviceScaleFactor: 1,
        javaScriptEnabled: true,
        ...options,
      }),
    ),
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

/** The leaf at rest, hovered, left and focused, with a fine pointer that hovers, `width` px wide. */
const finePointer = Effect.fn('computed.fine')(function* (
  browser: Browser,
  base: string,
  width: number,
) {
  const page = yield* opened(browser, base, { viewport: { width, height: 900 } });
  const at = `${width}px fine pointer`;
  const rest = yield* leafOf(page);
  const problems = [
    ...(yield* mediaProblems(page, at, [
      ['(hover: hover) and (pointer: fine)', true],
      ['(prefers-reduced-motion: reduce)', false],
    ])),
    ...restProblems(`${at}, at rest`, rest),
    ...leafProblems(`${at}, at rest`, rest, rest, 0, true),
  ];
  yield* step('hover', () => page.hover(CARD_LINK));
  problems.push(...leafProblems(`${at}, hovered`, rest, yield* leafOf(page), SWAY, true));
  yield* step('leave', () => page.mouse.move(0, 0));
  problems.push(...leafProblems(`${at}, left`, rest, yield* leafOf(page), 0, true));
  if (!(yield* tabToCard(page))) problems.push(`${at}, focused: Tab never reached ${CARD_LINK}`);
  problems.push(...leafProblems(`${at}, focused`, rest, yield* leafOf(page), SWAY, true));
  return problems;
}, Effect.scoped);

/** The leaf for a reader who asks for less motion, `width` px wide: at rest, hovered and focused. */
const lessMotion = Effect.fn('computed.less')(function* (
  browser: Browser,
  base: string,
  width: number,
) {
  const page = yield* opened(browser, base, {
    viewport: { width, height: 900 },
    reducedMotion: 'reduce',
  });
  const at = `${width}px less motion`;
  const rest = yield* leafOf(page);
  const problems = [
    ...(yield* mediaProblems(page, at, [['(prefers-reduced-motion: reduce)', true]])),
    ...restProblems(`${at}, at rest`, rest),
    ...leafProblems(`${at}, at rest`, rest, rest, 0, false),
  ];
  yield* step('hover', () => page.hover(CARD_LINK));
  problems.push(...leafProblems(`${at}, hovered`, rest, yield* leafOf(page), 0, false));
  if (!(yield* tabToCard(page))) problems.push(`${at}: Tab never reached ${CARD_LINK}`);
  problems.push(...leafProblems(`${at}, focused`, rest, yield* leafOf(page), 0, false));
  return problems;
}, Effect.scoped);

/** The leaf under a coarse pointer that cannot hover, `width` px wide: at rest, pointed at, then tapped. */
const coarsePointer = Effect.fn('computed.coarse')(function* (
  browser: Browser,
  base: string,
  width: number,
) {
  const page = yield* opened(browser, base, {
    viewport: { width, height: 844 },
    hasTouch: true,
    isMobile: true,
  });
  const at = `${width}px coarse pointer`;
  const rest = yield* leafOf(page);
  const problems = [
    ...(yield* mediaProblems(page, at, [
      ['(pointer: coarse)', true],
      ['(hover: none)', true],
    ])),
    ...restProblems(`${at}, at rest`, rest),
    ...leafProblems(`${at}, at rest`, rest, rest, 0, true),
  ];
  yield* step('hover', () => page.hover(CARD_LINK));
  problems.push(...leafProblems(`${at}, pointed`, rest, yield* leafOf(page), 0, true));
  yield* step('stay', () => page.evaluate(stay, CARD_LINK));
  yield* step('tap', () => page.tap(CARD_LINK));
  yield* step('released', () => page.waitForFunction(released, CARD_LINK));
  problems.push(...leafProblems(`${at}, tapped`, rest, yield* leafOf(page), 0, true));
  return problems;
}, Effect.scoped);

/** Every state of the leaf at every width the build's stylesheets make a band at. */
const leafAtEveryWidth = Effect.fn('computed.leaf')(function* (browser: Browser, base: string) {
  const { widths, edges, unread } = yield* widthsOfBuild();
  yield* Effect.logInfo('computed.widths').pipe(
    Effect.annotateLogs({ edges: edges.join(','), widths: widths.join(',') }),
  );
  const read = yield* Effect.forEach(
    widths,
    (width) =>
      Effect.all(
        [
          finePointer(browser, base, width),
          lessMotion(browser, base, width),
          coarsePointer(browser, base, width),
        ],
        { concurrency: 'unbounded' },
      ),
    { concurrency: WIDTHS_AT_ONCE },
  );
  return [...unread, ...read.flat(2)];
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
    const [leaf, images] = yield* Effect.all(
      [leafAtEveryWidth(browser, base), imageProblems(browser, base)],
      { concurrency: 'unbounded' },
    );
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
  Layer.provide(layerDirectory(DIST)),
  Layer.provide(layerPreview('tmp/outbox')),
  Layer.provideMerge(BunHttpServer.layer({ port: 0, hostname: '127.0.0.1' })),
  Layer.provideMerge(BunServices.layer),
);

computed.pipe(Effect.provide(Preview), BunRuntime.runMain);
