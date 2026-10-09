// The Findings sheet is the page's URL's (`?findings=1`), as every other sheet
// is: raising it is a step of its own, so Back closes it and stays on the
// page; Close and Escape go Back over that step; a link naming it opens it.

import { Effect } from 'effect';
import { describe, expect, it } from 'effect-bun-test';
import { pageHref } from '../../../src/core/api.ts';
import { PHONE, openReview } from '../../../src/lab/fixtures/harness.ts';
import { STUDIO_FILM, studioRoutes } from '../../../src/lab/fixtures/studio-film.ts';
import { countIs, evaluates, waitFor } from '../../../src/lab/fixtures/settled.ts';

const SLOW = 30_000;
const CHIP = '.pj-film [data-act="findings"][data-check="check"]';
const SHEET = '[data-role="findings"]';
const PLACE = 'location.pathname + location.search';
const FLAG = `new URL(location.href).searchParams.get('findings') ?? ''`;

describe("Project's Findings sheet, kept in the URL", () => {
  it.live(
    'raising it is a step Back closes; Close goes Back over it; a link naming it opens it',
    () =>
      Effect.gen(function* () {
        const { page, errors } = yield* openReview(studioRoutes, {
          href: pageHref.project(STUDIO_FILM),
          viewport: PHONE,
        });
        yield* waitFor(page, CHIP);
        const rest = yield* page.evaluate<string>(PLACE);
        yield* page.click(CHIP);
        yield* waitFor(page, SHEET);
        yield* evaluates(page, FLAG, '1');
        // Back closes the sheet and stays on Project.
        yield* page.back;
        yield* countIs(page, SHEET, 0);
        yield* evaluates(page, PLACE, rest);
        // Raised again, Close goes Back over the step it was raised by.
        yield* page.click(CHIP);
        yield* waitFor(page, SHEET);
        yield* page.click(`${SHEET} [data-act="close-inspector"]`);
        yield* countIs(page, SHEET, 0);
        yield* evaluates(page, PLACE, rest);
        // A link naming it opens it.
        yield* page.goto(`${pageHref.project(STUDIO_FILM)}?findings=1`);
        yield* waitFor(page, SHEET);
        expect(errors).toEqual([]);
      }).pipe(Effect.scoped),
    SLOW,
  );
});
