// Every review inspector's open state is the URL's (`useInspectorPlace`), on
// Choices (`?inspect=<variant>`, beside `?point=`, the card in focus) and a
// Set (`?inspect=<version>`) as on Project (`?point=`): a tap on a thing's
// name names it, a step of its own, so Back closes its sheet and Forward
// opens it again; Close, Escape and, on a phone, a swipe down drop it,
// going Back over the entry the tap pushed, so they leave none of their own;
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
import { countIs, evaluates, textHas, until, waitFor } from '../../../src/lab/fixtures/settled.ts';
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
  });
}

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
