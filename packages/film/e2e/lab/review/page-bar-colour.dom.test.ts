// The shell's page bar draws one way on every page: a tab that is not current
// is in the dim text colour, the current one in the bright. The review's own
// element rules never outweigh the shell's parts.

import { Effect } from 'effect';
import { describe, expect, it } from 'effect-bun-test';
import { pageHref } from '../../../src/core/api.ts';
import { openReview } from '../../../src/lab/fixtures/harness.ts';
import {
  STUDIO_FILM,
  STUDIO_FOLDER,
  STUDIO_SET,
  studioRoutes,
} from '../../../src/lab/fixtures/studio-film.ts';
import { evaluates, waitFor } from '../../../src/lab/fixtures/settled.ts';

const SLOW = 30_000;

/** The colour of the first tab that is not current, against the token it should be. */
const DIM = `(() => {
  const tab = document.querySelector('.sh-tab[data-active="false"]:not([data-disabled])');
  const probe = document.createElement('i');
  probe.style.color = 'var(--text-2)';
  document.body.append(probe);
  const same = getComputedStyle(tab).color === getComputedStyle(probe).color;
  probe.remove();
  return same;
})()`;

const PAGES = [
  ['Project', pageHref.project(STUDIO_FILM)],
  ['Choices', pageHref.choices(STUDIO_FILM)],
  ['a Set', pageHref.set(STUDIO_FOLDER, STUDIO_SET)],
] as const;

describe('the page bar on the review pages', () => {
  for (const [name, href] of PAGES) {
    it.live(
      `${name}: a tab that is not current is in the dim colour`,
      () =>
        Effect.gen(function* () {
          const { page, errors } = yield* openReview(studioRoutes, { href });
          yield* waitFor(page, '.sh-tab[data-active="false"]');
          yield* evaluates(page, DIM, true);
          expect(errors).toEqual([]);
        }).pipe(Effect.scoped),
      SLOW,
    );
  }
});
