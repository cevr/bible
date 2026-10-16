// A production's timeline (`/productions/<production>`), over the toy's
// ledger (`productionLedgerWith`): the front door's card opens it and counts
// the open question; its current version is open with its decision, the
// question that waits, and its Move forward, the one before shut to its
// head, a set filed there that no root holds said Missing; a link's `?v=`
// opens a past version; a production that makes a film is that film's only
// card on the front door, and its current version leads with the film's
// board; Move forward chooses the newest decision (his own words one more
// choice, the title his to leave out: `v<n>`), posts the version the page saw, and the answer's new version is current in
// place, or the ledger's refusal is said in the receipt.

import { Effect, Option, type Schema } from 'effect';
import { describe, expect, it } from 'effect-bun-test';
import { pageHref } from '../../../src/core/api.ts';
import { VersionMoved } from '../../../src/core/refusals.ts';
import {
  type Asked,
  type FakeRoute,
  json,
  openReview,
  refused,
  route,
} from '../../../src/lab/fixtures/harness.ts';
import {
  attached,
  countIs,
  evaluates,
  textHas,
  waitFor,
} from '../../../src/lab/fixtures/settled.ts';
import {
  STUDIO_FILM,
  STUDIO_PRODUCTION,
  productionLedgerWith,
  studioRoutes,
} from '../../../src/lab/fixtures/studio-film.ts';
import { PRODUCTION_READY, SLOW } from '../studio-states.ts';

const CURRENT = '.pd-v[data-current="true"]';
const RECEIPT = '[data-receipt="production"]';
const FORWARD = new RegExp(`^/api/productions/${STUDIO_PRODUCTION}/versions$`);

/** The toy's board: one beat of two picture panels, one keeping a try, not approved. */
const toyTry = {
  n: 1,
  file: 'open.start.1.png',
  sha256: 'x',
  made: 'generate',
  refs: [],
  at: '2026-10-14T12:00:00Z',
};
const toyBoard: Schema.Json = {
  film: STUDIO_FILM,
  panels: [
    { id: 'open.start', beat: 'open', at: 'start', tries: [toyTry], kept: 1 },
    { id: 'open.turn', beat: 'open', at: 'turn', tries: [toyTry] },
  ],
  approvals: [],
};

/** The toy's ledger moved on to a third version. */
const third = productionLedgerWith([
  { at: 2000, title: 'Third cut', because: 'The second cut holds' },
]);

describe("a production's timeline", () => {
  it.live(
    'the front door lists the production first; its card opens the timeline at its current version',
    () =>
      Effect.gen(function* () {
        const { page, errors } = yield* openReview(studioRoutes);
        yield* textHas(page, '.rv-h', 'Productions');
        yield* textHas(page, '.pd-card', 'The toy, cut by cut');
        yield* textHas(page, '.pd-card', 'v2 · Second cut');
        yield* textHas(page, '.pd-card', '1 question waits on you');
        yield* page.click('.pd-card a');
        yield* waitFor(page, PRODUCTION_READY);
        yield* evaluates(page, 'location.pathname', pageHref.production(STUDIO_PRODUCTION));
        yield* textHas(page, `${CURRENT} .pd-v-head`, 'Second cut');
        yield* textHas(page, `${CURRENT} .pd-v-why`, 'The first cut holds');
        yield* textHas(page, `${CURRENT} .pd-said[data-kind="Decided"]`, 'ship it');
        yield* textHas(page, `${CURRENT} [data-role="waiting"]`, 'Which cut of the open?');
        // The first version is shut to its head; opened, its filed set no root holds is Missing.
        yield* evaluates(page, `document.querySelector('.pd-v[data-v="1"] details').open`, false);
        yield* page.click('.pd-v[data-v="1"] summary');
        yield* textHas(page, '.pd-v[data-v="1"] .pd-missing', 'gone-2026-10-01');
        expect(errors).toEqual([]);
      }).pipe(Effect.scoped),
    SLOW,
  );

  it.live(
    'a film a production makes shows once: its production card, with its state and the way into its studio',
    () =>
      Effect.gen(function* () {
        const routes: ReadonlyArray<FakeRoute> = [
          route('GET', /^\/api\/productions$/, () =>
            json({ productions: [productionLedgerWith([], [STUDIO_FILM])] }),
          ),
          route('GET', /^\/api\/films\/toy\/board$/, () => json(toyBoard)),
          ...studioRoutes,
        ];
        const { page, errors } = yield* openReview(routes);
        yield* textHas(page, '.pd-card', 'The toy, cut by cut');
        yield* waitFor(page, '.pd-card [data-role="length"]');
        yield* evaluates(
          page,
          `document.querySelector('.pd-card [data-act="studio"]').getAttribute('href')`,
          pageHref.studio(STUDIO_FILM),
        );
        yield* countIs(page, '.pd-card [data-act="board"]', 0);
        // No Films card for it, and no Films heading with nothing under it.
        yield* evaluates(page, `document.querySelectorAll('a.rv-film-card').length`, 0);
        yield* evaluates(
          page,
          `[...document.querySelectorAll('.rv-h')].some((h) => h.textContent === 'Films')`,
          false,
        );
        // Its timeline's current version leads with the film's board, linked to the Board.
        yield* page.click('.pd-card a');
        yield* waitFor(page, PRODUCTION_READY);
        yield* textHas(
          page,
          `${CURRENT} [data-stage="board"]`,
          '2 panels, 1 kept · 0 of 1 beat approved',
        );
        yield* evaluates(
          page,
          `document.querySelector('${CURRENT} [data-stage="board"] a').getAttribute('href')`,
          pageHref.studio(STUDIO_FILM),
        );
        expect(errors).toEqual([]);
      }).pipe(Effect.scoped),
    SLOW,
  );

  it.live(
    "a link's ?v= opens that past version",
    () =>
      Effect.gen(function* () {
        const { page } = yield* openReview(studioRoutes, {
          href: pageHref.production(STUDIO_PRODUCTION, 1),
        });
        yield* waitFor(page, PRODUCTION_READY);
        yield* textHas(page, '.pd-v[data-v="1"] .pd-missing', 'gone-2026-10-01');
      }).pipe(Effect.scoped),
    SLOW,
  );

  it.live(
    'Move forward posts the version the page saw; the new version is current in place',
    () =>
      Effect.gen(function* () {
        const posted: Array<Asked> = [];
        const routes: ReadonlyArray<FakeRoute> = [
          route('POST', FORWARD, (asked) => {
            posted.push(asked);
            return json(third);
          }),
          ...studioRoutes,
        ];
        const { page } = yield* openReview(routes, {
          href: pageHref.production(STUDIO_PRODUCTION),
        });
        yield* waitFor(page, PRODUCTION_READY);
        yield* page.click(PRODUCTION_READY);
        yield* waitFor(page, '[data-act="move-form"] input[name="title"]');
        // The decision is a choice first; his own words are one of them.
        yield* page.click('[data-act="move-form"] [data-value="own"]');
        yield* waitFor(page, '[data-act="move-form"] input[name="because"]');
        yield* page.fill('[data-act="move-form"] input[name="because"]', 'The second cut holds');
        yield* page.fill('[data-act="move-form"] input[name="title"]', 'Third cut');
        yield* page.click('[data-act="move-form"] button[type="submit"]');
        yield* textHas(page, `${CURRENT} .pd-v-head`, 'Third cut');
        yield* textHas(page, RECEIPT, 'v3');
        yield* attached(page, '.pd-v[data-v="2"]');
        expect(posted.map((p) => Option.getOrNull(p.body))).toEqual([
          { after: 2, title: 'Third cut', because: 'The second cut holds' },
        ]);
      }).pipe(Effect.scoped),
    SLOW,
  );

  it.live(
    'Move forward on the decision as chosen, the title left out, posts the newest as v3',
    () =>
      Effect.gen(function* () {
        const posted: Array<Asked> = [];
        const routes: ReadonlyArray<FakeRoute> = [
          route('POST', FORWARD, (asked) => {
            posted.push(asked);
            return json(third);
          }),
          ...studioRoutes,
        ];
        const { page } = yield* openReview(routes, {
          href: pageHref.production(STUDIO_PRODUCTION),
        });
        yield* waitFor(page, PRODUCTION_READY);
        yield* page.click(PRODUCTION_READY);
        yield* waitFor(page, '[data-act="move-form"] input[name="title"]');
        yield* page.click('[data-act="move-form"] button[type="submit"]');
        yield* textHas(page, RECEIPT, 'v3');
        expect(posted.map((p) => Option.getOrNull(p.body))).toEqual([
          { after: 2, title: 'v3', because: 'The first cut holds' },
        ]);
      }).pipe(Effect.scoped),
    SLOW,
  );

  it.live(
    'a production moved on since the page read it is refused in the receipt',
    () =>
      Effect.gen(function* () {
        const routes: ReadonlyArray<FakeRoute> = [
          route('POST', FORWARD, () =>
            refused(VersionMoved.make({ production: STUDIO_PRODUCTION, after: 2, current: 3 })),
          ),
          ...studioRoutes,
        ];
        const { page } = yield* openReview(routes, {
          href: pageHref.production(STUDIO_PRODUCTION),
        });
        yield* waitFor(page, PRODUCTION_READY);
        yield* page.click(PRODUCTION_READY);
        // The decision starts from the owner's newest, and the open question is said to stay open.
        yield* evaluates(
          page,
          `document.querySelector('[data-act="move-form"] [aria-pressed="true"]').textContent.trim()`,
          'The first cut holds',
        );
        yield* textHas(page, '[data-act="move-form"]', 'it stays open after the move');
        yield* page.fill('[data-act="move-form"] input[name="title"]', 'Third cut');
        yield* page.click('[data-act="move-form"] button[type="submit"]');
        yield* textHas(page, RECEIPT, 'is at v3 now');
        yield* textHas(page, `${CURRENT} .pd-v-head`, 'Second cut');
      }).pipe(Effect.scoped),
    SLOW,
  );
});
