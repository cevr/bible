// A production's timeline (`/productions/<production>`), over the toy's
// ledger (`productionLedgerWith`): the front door's card opens it and counts
// the open question; its current version is open with its decision, the
// question that waits, and its Move forward, the one before shut to its
// head, a set filed there that no root holds said Missing; a link's `?v=`
// opens a past version; Move forward starts from the newest decision, posts
// the version the page saw, and the answer's new version is current in
// place, or the ledger's refusal is said in the receipt.

import { Effect, Option } from 'effect';
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
import { attached, evaluates, textHas, waitFor } from '../../../src/lab/fixtures/settled.ts';
import {
  STUDIO_PRODUCTION,
  productionLedgerWith,
  studioRoutes,
} from '../../../src/lab/fixtures/studio-film.ts';
import { PRODUCTION_READY, SLOW } from '../studio-states.ts';

const CURRENT = '.pd-v[data-current="true"]';
const RECEIPT = '[data-receipt="production"]';
const FORWARD = new RegExp(`^/api/productions/${STUDIO_PRODUCTION}/versions$`);

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
        yield* page.click('.pd-card');
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
          `document.querySelector('[data-act="move-form"] input[name="because"]').value`,
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
