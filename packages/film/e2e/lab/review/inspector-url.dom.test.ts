// Every review inspector's open state is the URL's (`useInspectorPlace`), on
// Choices (`?inspect=<variant>`, beside `?point=`, the card in focus) and a
// Set (`?inspect=<version>`) as on Project (`?point=`): a tap on a thing's
// name names it, a step of its own, so Back closes its sheet and Forward
// opens it again; Close, Escape and a swipe (a finger down on a phone, the
// sheet's own scroll sideways on a laptop) drop it, going Back over the entry
// the tap pushed, so they leave none of their own;
// a link naming it opens it, and closing that makes no entry either. A link
// written before the key keeps landing, the sheet shut. The page owns its
// sheets, not the cards it shows: a sheet the URL names opens though a
// filter (`?only=`) or a pair leaves its card out.

import { Effect } from 'effect';
import { describe, expect, it, test } from 'effect-bun-test';
import { pageHref } from '../../../src/core/api.ts';
import { PHONE, openReview } from '../../../src/lab/fixtures/harness.ts';
import {
  STUDIO_FILM,
  STUDIO_FOLDER,
  STUDIO_SET,
  studioRoutes,
  studioRoutesOfThree,
} from '../../../src/lab/fixtures/studio-film.ts';
import {
  countIs,
  evaluates,
  sheetsStand,
  textHas,
  until,
  waitFor,
} from '../../../src/lab/fixtures/settled.ts';
import type { Tab } from '../../../src/lab/fixtures/tab.ts';

const SLOW = 30_000;
const LAPTOP = { width: 1440, height: 900 };
const INSPECTOR = '[data-role="inspector"]';
const CLOSE = `${INSPECTOR} [data-act="close-inspector"]`;

/** A page whose things' sheets the URL keeps: where it opens, the name a tap opens a sheet on, and what the URL then says. */
interface Page {
  readonly name: string;
  readonly href: string;
  readonly ready: string;
  readonly thing: string;
  /** The query the URL has once the thing's sheet is open, past what `href` has. */
  readonly named: Readonly<Record<string, string>>;
  /** The row marked while its sheet is open. */
  readonly row: string;
  /**
   * Where a Close leaves the page, from where it rested: Back over the tap when that lands
   * exactly there, else the tap's entry rewritten to it (Choices keeps the card in focus).
   */
  readonly closed: (rest: string) => string;
}

/** The rows marked as the open sheet's, as a script reads them. */
const MARKED = `document.querySelectorAll('.rv-main [data-selected="true"]').length`;

const PAGES: ReadonlyArray<Page> = [
  {
    name: 'Choices',
    href: pageHref.choices(STUDIO_FILM),
    ready: '[data-point="score"] [data-variant="piano"] .lab-inspect',
    thing: '[data-point="score"] [data-variant="piano"] .lab-inspect',
    // The card in focus moves to the variant's point with it, in the same step.
    named: { point: 'score', inspect: 'piano' },
    row: '[data-point="score"] [data-variant="piano"]',
    closed: () => pageHref.choices(STUDIO_FILM, 'score'),
  },
  {
    name: 'a Set',
    href: pageHref.set(STUDIO_FOLDER, STUDIO_SET),
    ready: '.rv-main [data-act="inspect"]',
    thing: '.rv-main [data-act="inspect"]',
    // The set's first version.
    named: { inspect: 'main' },
    row: '.rv-card[data-id="main"]',
    closed: (rest) => rest,
  },
];

/**
 * The focused sheet's ring, against the window it stands in (its overlay's
 * box: the window less a classic scrollbar's gutter, cut by any clip of the
 * overlay's), as three answers: whether the sheet has focus from the keyboard,
 * whether it draws a ring, and whether the ring's box (its own box, grown by
 * its widest outer shadow) lies inside the window; the sheet stands at its
 * edge.
 */
const RING = `(() => {
  const el = document.activeElement;
  const shadows = getComputedStyle(el).boxShadow.split(/,(?![^(]*\\))/).filter((s) => s.trim() !== 'none');
  const out = Math.max(0, ...shadows.filter((s) => !/\\binset\\b/.test(s)).map((s) => parseFloat(s.replace(/rgba?\\([^)]*\\)/, '').trim().split(/\\s+/)[3] ?? '0')));
  const r = el.getBoundingClientRect();
  const overlay = el.closest('.lab-inspector-overlay');
  const o = overlay.getBoundingClientRect();
  const [top, right, bottom, left] = (/^inset\\(([^)]*)\\)$/.exec(getComputedStyle(overlay).clipPath)?.[1] ?? '0px').split(' ').map(parseFloat);
  const clip = { top: o.top + top, right: o.left + overlay.clientWidth - (right ?? top), bottom: o.top + overlay.clientHeight - (bottom ?? top), left: o.left + (left ?? right ?? top) };
  return [
    el.matches('${INSPECTOR}') && el.matches(':focus-visible'),
    shadows.length > 0,
    r.top - out >= clip.top - 0.5 && r.right + out <= clip.right + 0.5 && r.bottom + out <= clip.bottom + 0.5 && r.left - out >= clip.left - 0.5,
  ];
})()`;

/** The URL's query keys a sheet is named by, as a script reads them. */
const QUERY = `(() => { const q = new URL(location.href).searchParams; return [q.get('point') ?? '', q.get('inspect') ?? '']; })()`;

/** Wait until the URL is `href`, path and query. */
const at = (page: Tab, href: string) =>
  until(page, `location.pathname + location.search === '${href}'`);

for (const p of PAGES) {
  describe(`${p.name}'s sheet, kept in the URL`, () => {
    it.live(
      'a tap names it (Back closes it, Forward opens it); Close and Escape go Back over the tap; a link opens it, and its Close makes no entry',
      () =>
        Effect.gen(function* () {
          const { page, errors } = yield* openReview(studioRoutes, {
            href: p.href,
            viewport: LAPTOP,
          });
          yield* waitFor(page, p.ready);
          const rest = yield* page.evaluate<string>('location.pathname + location.search');
          yield* page.click(p.thing);
          yield* waitFor(page, CLOSE);
          // The thing is named, by its own key; Choices' point names the card it is on.
          for (const [key, value] of Object.entries(p.named))
            yield* evaluates(page, `new URL(location.href).searchParams.get('${key}')`, value);
          const named = yield* page.evaluate<string>('location.pathname + location.search');
          // Its row is marked, and only it; none once the sheet is shut.
          yield* waitFor(page, `${p.row}[data-selected="true"]`);
          yield* evaluates(page, MARKED, 1);
          yield* page.back;
          yield* countIs(page, INSPECTOR, 0);
          yield* at(page, rest);
          yield* evaluates(page, MARKED, 0);
          yield* page.forward;
          yield* waitFor(page, CLOSE);
          yield* at(page, named);
          // Close, then Escape: each goes Back over the tap's entry when that lands where the
          // Close would write, else rewrites it there; the page is where it closes either way.
          for (const dismiss of [page.click(CLOSE), page.press('Escape')]) {
            yield* dismiss;
            yield* countIs(page, INSPECTOR, 0);
            yield* at(page, p.closed(rest));
            yield* page.click(p.thing);
            yield* waitFor(page, CLOSE);
            yield* at(page, named);
          }
          // A link naming it opens it; its Close names none on the same entry.
          yield* page.goto(named);
          yield* waitFor(page, CLOSE);
          yield* page.evaluate('void (window.__entries = history.length)');
          yield* page.click(CLOSE);
          yield* countIs(page, INSPECTOR, 0);
          yield* evaluates(page, `new URL(location.href).searchParams.get('inspect') ?? ''`, '');
          yield* evaluates(page, 'history.length === window.__entries', true);
          expect(errors).toEqual([]);
        }).pipe(Effect.scoped),
      SLOW,
    );

    // Serial: a finger's touches (`film/touches-serial`).
    test.serial(
      'on a phone a swipe down dismisses it as Close does, going Back over the tap',
      () =>
        Effect.gen(function* () {
          const { page, errors } = yield* openReview(studioRoutes, {
            href: p.href,
            viewport: PHONE,
          });
          yield* waitFor(page, p.ready);
          const rest = yield* page.evaluate<string>('location.pathname + location.search');
          yield* page.click(p.thing);
          yield* waitFor(page, CLOSE);
          yield* until(page, `(new URL(location.href).searchParams.get('inspect') ?? '') !== ''`);
          // The finger finds the sheet where it rests, not on its way in.
          yield* sheetsStand(page);
          const sheet = yield* page.box(`${INSPECTOR} .lab-inspector-head`);
          const x = sheet.x + sheet.width / 2;
          const y = sheet.y + sheet.height / 2;
          yield* page.finger.drag({ x, y }, { x, y: y + 400 });
          yield* countIs(page, INSPECTOR, 0);
          yield* at(page, p.closed(rest));
          yield* evaluates(page, QUERY, [
            new URL(`http://x${p.closed(rest)}`).searchParams.get('point') ?? '',
            '',
          ]);
          expect(errors).toEqual([]);
        }).pipe(Effect.scoped, Effect.runPromise),
      SLOW,
    );

    it.live(
      "on a laptop a sideways scroll (a trackpad's swipe) carries it off and dismisses it as Close does, going Back over the tap",
      () =>
        Effect.gen(function* () {
          const { page, errors } = yield* openReview(studioRoutes, {
            href: p.href,
            viewport: LAPTOP,
          });
          yield* waitFor(page, p.ready);
          const rest = yield* page.evaluate<string>('location.pathname + location.search');
          yield* page.click(p.thing);
          yield* waitFor(page, CLOSE);
          yield* sheetsStand(page);
          yield* page.evaluate('void (window.__entries = history.length)');
          // The swipe is the user's: a trackpad's wheel sideways over the panel, a viewport's width
          // toward the right edge, which the browser turns into the sheet's own scroll.
          const [x, y] = yield* page.evaluate<[number, number]>(
            `(({ left, top, width, height }) => [left + width / 2, top + height / 2])(document.querySelector('.lab-inspector-panel').getBoundingClientRect())`,
          );
          yield* page.mouse.move(x, y);
          yield* page.mouse.wheel(-LAPTOP.width, 0);
          yield* countIs(page, INSPECTOR, 0);
          yield* at(page, p.closed(rest));
          yield* evaluates(page, QUERY, [
            new URL(`http://x${p.closed(rest)}`).searchParams.get('point') ?? '',
            '',
          ]);
          // Back over the tap, or the tap's entry rewritten: no entry of the swipe's own.
          yield* evaluates(page, 'history.length === window.__entries', true);
          expect(errors).toEqual([]);
        }).pipe(Effect.scoped),
      SLOW,
    );

    it.live(
      'opened from the keyboard, the sheet shows its whole focus ring, drawn inside the window it stands at the edge of',
      () =>
        Effect.gen(function* () {
          const { page, errors } = yield* openReview(studioRoutes, {
            href: p.href,
            viewport: LAPTOP,
          });
          yield* waitFor(page, p.ready);
          yield* page.pressIn(p.thing, 'Enter');
          yield* waitFor(page, CLOSE);
          yield* sheetsStand(page);
          // Focused from the keyboard, ringed, the ring inside the window.
          yield* evaluates(page, RING, [true, true, true]);
          expect(errors).toEqual([]);
        }).pipe(Effect.scoped),
      SLOW,
    );
  });
}

/**
 * Where the open sheet stands, as a script reads it: how many sheets there are, its panel's
 * box, and whether it stands whole: drawn whole (no clip of its overlay's cuts into it), a press
 * 3 px inside each of its edges lands on it, and one 3 px past each (inside the window) misses
 * the sheet and reaches the page.
 */
const STANDS = `(() => {
  const sheets = document.querySelectorAll('${INSPECTOR}').length;
  const panel = document.querySelector('.lab-inspector-panel');
  const overlay = document.querySelector('.lab-inspector-overlay');
  if (!panel || !overlay) return { sheets, box: null, whole: false };
  const r = panel.getBoundingClientRect();
  const o = overlay.getBoundingClientRect();
  const [top = 0, right = top, bottom = top, left = right] = (/^inset\\(([^)]*)\\)$/.exec(getComputedStyle(overlay).clipPath)?.[1] ?? '0px').split(/\\s+/).map(parseFloat);
  const drawn = r.left >= o.left + left - 0.5 && r.top >= o.top + top - 0.5 && r.right <= o.left + overlay.clientWidth - right + 0.5 && r.bottom <= o.top + overlay.clientHeight - bottom + 0.5;
  const hits = (x, y, selector) => document.elementFromPoint(x, y)?.closest(selector) != null;
  const midX = r.left + r.width / 2;
  const midY = r.top + r.height / 2;
  const inside = [[r.left + 3, midY], [r.right - 3, midY], [midX, r.top + 3], [midX, r.bottom - 3]].every(([x, y]) => hits(x, y, '.lab-inspector-panel'));
  const outside = [[r.left - 3, midY], [r.right + 3, midY], [midX, r.top - 3], [midX, r.bottom + 3]].filter(([x, y]) => x >= 0 && y >= 0 && x < innerWidth && y < innerHeight).every(([x, y]) => !hits(x, y, '.lab-inspector-overlay'));
  return { sheets, box: [r.left, r.top, r.right, r.bottom].map(Math.round), whole: drawn && inside && outside };
})()`;

/** Resolves after the page's next two frames. */
const FRAMES = `new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)))`;

describe('an open sheet as the window crosses the phone width in one step (a tablet turned)', () => {
  it.live(
    'turns from a bottom sheet to a right one and back, staying open, at rest and drawn whole',
    () =>
      Effect.gen(function* () {
        const { page, errors } = yield* openReview(studioRoutes, {
          href: pageHref.set(STUDIO_FOLDER, STUDIO_SET),
          viewport: { width: 820, height: 1180 },
        });
        yield* waitFor(page, '.rv-main [data-act="inspect"]');
        yield* page.click('.rv-main [data-act="inspect"]');
        yield* waitFor(page, CLOSE);
        yield* sheetsStand(page);
        const named = yield* page.evaluate<string>('location.pathname + location.search');
        const turns = [
          // Landscape: a right sheet, its panel's right edge the page's (short of its scrollbar).
          {
            width: 1180,
            height: 820,
            rests: 'box[2] === document.documentElement.clientWidth && box[1] === 0',
          },
          // Portrait: a bottom sheet, its panel's left edge the window's, above its bottom.
          { width: 820, height: 1180, rests: 'box[0] === 0 && box[3] <= 1180 && box[1] > 0' },
        ];
        for (const turn of turns) {
          const stands = `(({ sheets, box, whole }) => sheets === 1 && whole && ${turn.rests})(${STANDS})`;
          yield* page.resize(turn.width, turn.height);
          yield* until(page, stands);
          // Still so a moment later: nothing read the turn as a swipe.
          yield* page.evaluate(FRAMES);
          yield* page.evaluate(FRAMES);
          yield* evaluates(page, stands, true);
          yield* at(page, named);
        }
        expect(errors).toEqual([]);
      }).pipe(Effect.scoped),
    SLOW,
  );

  // The page reads the window as it renders the sheet and follows it from a moment later: a turn
  // between the two is the window's answer too (`Viewport.changes` starts with it).
  for (const turn of [
    { from: { width: 1180, height: 820 }, to: { width: 820, height: 1180 }, position: 'bottom' },
    { from: { width: 820, height: 1180 }, to: { width: 1180, height: 820 }, position: 'right' },
  ]) {
    it.live(
      `turned as it starts to scroll in (${turn.from.width} to ${turn.to.width} wide): it rests as a ${turn.position} sheet, drawn whole`,
      () =>
        Effect.gen(function* () {
          const { page, errors } = yield* openReview(studioRoutes, {
            href: pageHref.set(STUDIO_FOLDER, STUDIO_SET),
            viewport: turn.from,
          });
          yield* waitFor(page, '.rv-main [data-act="inspect"]');
          yield* page.click('.rv-main [data-act="inspect"]');
          yield* until(page, `document.querySelector('.lab-inspector-panel') !== null`);
          yield* page.resize(turn.to.width, turn.to.height);
          yield* waitFor(page, CLOSE);
          yield* sheetsStand(page);
          const stands = `(({ sheets, whole }) => sheets === 1 && whole && document.querySelector('.lab-inspector-panel').getAttribute('data-position') === '${turn.position}')(${STANDS})`;
          yield* until(page, stands);
          yield* page.evaluate(FRAMES);
          yield* evaluates(page, stands, true);
          expect(errors).toEqual([]);
        }).pipe(Effect.scoped),
      SLOW,
    );
  }
});

describe('an open phone sheet as what it stands on moves under it', () => {
  it.live(
    "a Set's sheet as its view turns to the moments and back (the dock goes and comes again): it moves with its floor, open and standing whole",
    () =>
      Effect.gen(function* () {
        const { page, errors } = yield* openReview(studioRoutes, {
          href: pageHref.set(STUDIO_FOLDER, STUDIO_SET),
          viewport: PHONE,
        });
        yield* waitFor(page, '.rv-main [data-act="inspect"]');
        yield* page.click('.rv-main [data-act="inspect"]');
        yield* waitFor(page, CLOSE);
        yield* sheetsStand(page);
        const floor = `getComputedStyle(document.querySelector('.lab-inspector-panel')).bottom`;
        const before = yield* page.evaluate<string>(floor);
        yield* evaluates(page, `${STANDS}.whole`, true);
        // The page stays live round a sheet: the view's toggles are pressed as a user would.
        // All plays in the dock; the moments have none, so the sheet's floor drops by the dock's
        // height, with nothing resized.
        for (const { view, docked } of [
          { view: 'moments', docked: false },
          { view: 'all', docked: true },
        ]) {
          yield* page.click(`.rv-views button[data-view="${view}"]`);
          yield* until(page, `(document.querySelector('.sh-dock') !== null) === ${docked}`);
          yield* until(page, `(({ sheets, whole }) => sheets === 1 && whole)(${STANDS})`);
          // Still so a moment later: nothing read the move as a swipe.
          yield* page.evaluate(FRAMES);
          yield* page.evaluate(FRAMES);
          yield* evaluates(page, `(({ sheets, whole }) => sheets === 1 && whole)(${STANDS})`, true);
          yield* evaluates(page, `new URLSearchParams(location.search).get('inspect')`, 'main');
          // It stands on the floor it stood on with the dock, and on another without.
          yield* evaluates(page, `(${floor} === '${before}') === ${docked}`, true);
        }
        expect(errors).toEqual([]);
      }).pipe(Effect.scoped),
    SLOW,
  );
});

describe('a link written before the sheet had a key', () => {
  it.live("keeps landing: Choices' point focuses its card, the sheet shut", () =>
    Effect.gen(function* () {
      const href = pageHref.choices(STUDIO_FILM, 'score');
      const { page, errors } = yield* openReview(studioRoutes, { href, viewport: LAPTOP });
      yield* waitFor(page, '[data-point="score"] [data-variant="piano"] .lab-inspect');
      yield* countIs(page, INSPECTOR, 0);
      yield* evaluates(page, QUERY, ['score', '']);
      expect(errors).toEqual([]);
    }).pipe(Effect.scoped),
  );
});

describe('a sheet the URL names opens whatever cards the page shows', () => {
  const CASES = [
    {
      name: "Choices, its variant's card left out by Show only (`?only=comments`)",
      routes: studioRoutes,
      href: `${pageHref.choices(STUDIO_FILM, 'look:ground', 'now')}&only=comments`,
      card: '.rv-main [data-point="look:ground"] [data-variant="now"]',
      title: 'now of',
    },
    {
      name: "a Set's pair, the version it names not one of the two (`?view=pair&other=warm&inspect=cool`)",
      routes: studioRoutesOfThree,
      href: `/sets/${encodeURIComponent(STUDIO_FOLDER)}/${STUDIO_SET}?view=pair&other=warm&inspect=cool`,
      card: '.rv-main .rv-card[data-id="cool"]',
      title: 'cool',
    },
  ];
  for (const c of CASES) {
    it.live(
      `${c.name}: its sheet opens, and its Close names none`,
      () =>
        Effect.gen(function* () {
          const { page, errors } = yield* openReview(c.routes, {
            href: c.href,
            viewport: LAPTOP,
          });
          yield* waitFor(page, CLOSE);
          yield* textHas(page, `${INSPECTOR} .lab-sheet-title`, c.title);
          // The page shows no card of it.
          yield* countIs(page, c.card, 0);
          yield* page.click(CLOSE);
          yield* countIs(page, INSPECTOR, 0);
          yield* evaluates(page, `new URL(location.href).searchParams.get('inspect') ?? ''`, '');
          expect(errors).toEqual([]);
        }).pipe(Effect.scoped),
      SLOW,
    );
  }
});

describe('a link whose sheet names a thing the page has none of', () => {
  const CASES = [
    {
      name: 'Choices',
      href: pageHref.choices(STUDIO_FILM, 'look:ground', 'removed'),
      focus: '[data-point="look:ground"] [data-variant="now"] .lab-inspect',
      title: 'now of',
      named: 'now',
    },
    {
      name: 'a Set',
      href: pageHref.set(STUDIO_FOLDER, STUDIO_SET, 'removed'),
      focus: '.rv-main .rv-card[data-id="main"] [data-act="inspect"]',
      title: 'main',
      named: 'main',
    },
  ];
  for (const c of CASES) {
    it.live(
      `${c.name}: no sheet opens, and \`i\` on a focused card opens that card's`,
      () =>
        Effect.gen(function* () {
          const { page, errors } = yield* openReview(studioRoutes, {
            href: c.href,
            viewport: LAPTOP,
          });
          yield* waitFor(page, c.focus);
          yield* countIs(page, INSPECTOR, 0);
          yield* page.focus(c.focus);
          yield* page.press('i');
          yield* waitFor(page, CLOSE);
          yield* textHas(page, `${INSPECTOR} .lab-sheet-title`, c.title);
          yield* evaluates(
            page,
            `new URL(location.href).searchParams.get('inspect') ?? ''`,
            c.named,
          );
          expect(errors).toEqual([]);
        }).pipe(Effect.scoped),
      SLOW,
    );
  }
});
