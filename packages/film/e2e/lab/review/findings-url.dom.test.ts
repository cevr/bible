// The Findings sheet is the page's URL's (`?findings=1`), as every other sheet
// is: raising it is a step of its own, so Back closes it and stays on the
// page; Close and Escape go Back over that step; a link naming it opens it.
// Choices raises it from Show findings.

import { Effect } from 'effect';
import { describe, expect, it } from 'effect-bun-test';
import { pageHref } from '../../../src/core/api.ts';
import { menuEntry, openCommandMenu } from '../../../src/lab/fixtures/gestures.ts';
import { countIs, evaluates, waitFor } from '../../../src/lab/fixtures/settled.ts';
import { onChoices } from '../toy-choices.ts';

const SLOW = 30_000;
const SHEET = '[data-role="findings"]';
const PLACE = 'location.pathname + location.search';
const FLAG = `new URL(location.href).searchParams.get('findings') ?? ''`;

describe("Choices' Findings sheet, kept in the URL", () => {
  it.live(
    'raising it is a step Back closes; Close goes Back over it; a link naming it opens it',
    () =>
      Effect.gen(function* () {
        const { page, errors } = yield* onChoices();
        /** Show findings, run from ⌘K. */
        const raise = Effect.gen(function* () {
          yield* openCommandMenu(page, 'findings');
          yield* page.click(menuEntry('review.findings'));
          yield* waitFor(page, SHEET);
        });
        const rest = yield* page.evaluate<string>(PLACE);
        yield* raise;
        yield* evaluates(page, FLAG, '1');
        // Back closes the sheet and stays on Choices.
        yield* page.back;
        yield* countIs(page, SHEET, 0);
        yield* evaluates(page, PLACE, rest);
        // Raised again, Close goes Back over the step it was raised by.
        yield* raise;
        yield* page.click(`${SHEET} [data-act="close-inspector"]`);
        yield* countIs(page, SHEET, 0);
        yield* evaluates(page, PLACE, rest);
        // A link naming it opens it.
        yield* page.goto(`${pageHref.choices('toy')}?findings=1`);
        yield* waitFor(page, SHEET);
        expect(errors).toEqual([]);
      }).pipe(Effect.scoped),
    SLOW,
  );
});
