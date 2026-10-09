// A fresh sheet takes the focus without resting it on Close: Space, the page's
// play key, never closes a sheet that was just opened.

import { Effect } from 'effect';
import { describe, expect, it } from 'effect-bun-test';
import { pageHref } from '../../src/core/api.ts';
import { openReview } from '../../src/lab/fixtures/harness.ts';
import {
  STUDIO_FILM,
  STUDIO_FOLDER,
  STUDIO_SET,
  studioRoutes,
} from '../../src/lab/fixtures/studio-film.ts';
import { countIs, evaluates, until, waitFor } from '../../src/lab/fixtures/settled.ts';

const SLOW = 30_000;
const INSIDE = (role: string) =>
  `document.activeElement?.closest('[data-role="${role}"]') instanceof HTMLElement`;
const ON_CLOSE = `document.activeElement?.matches('[data-act="close-inspector"]') === true`;

describe('a fresh sheet', () => {
  it.live(
    "a Set's inspector holds the focus, not on Close, so Space leaves it open",
    () =>
      Effect.gen(function* () {
        const { page, errors } = yield* openReview(studioRoutes, {
          href: pageHref.set(STUDIO_FOLDER, STUDIO_SET),
        });
        yield* waitFor(page, '.rv-main [data-act="inspect"]');
        yield* page.click('.rv-card[data-id="main"] [data-act="inspect"]');
        yield* waitFor(page, '[data-role="inspector"]');
        yield* until(page, INSIDE('inspector'));
        yield* evaluates(page, ON_CLOSE, false);
        yield* page.press('Space');
        yield* countIs(page, '[data-role="inspector"]', 1);
        expect(errors).toEqual([]);
      }).pipe(Effect.scoped),
    SLOW,
  );

  it.live(
    "Project's Findings holds the focus, not on Close, so Space leaves it open",
    () =>
      Effect.gen(function* () {
        const { page, errors } = yield* openReview(studioRoutes, {
          href: pageHref.project(STUDIO_FILM),
        });
        const chip = '.pj-film [data-act="findings"][data-check="check"]';
        yield* waitFor(page, chip);
        yield* page.click(chip);
        yield* waitFor(page, '[data-role="findings"]');
        yield* until(page, INSIDE('findings'));
        yield* evaluates(page, ON_CLOSE, false);
        yield* page.press('Space');
        yield* countIs(page, '[data-role="findings"]', 1);
        expect(errors).toEqual([]);
      }).pipe(Effect.scoped),
    SLOW,
  );
});
