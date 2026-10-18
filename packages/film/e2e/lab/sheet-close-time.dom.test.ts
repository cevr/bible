// Closing a sheet leaves the playhead where it was: Close goes Back over the
// tap that opened the sheet only when that entry is exactly where the Close
// would write. Time moved while the sheet was open lives in the entry the
// sheet is on, so Back would rewind it; the Close then follows (a replace) and
// keeps the time. Checked on a Set's inspector by the `#t=` after the Close.

import { Effect } from 'effect';
import { describe, expect, it } from 'effect-bun-test';
import { pageHref } from '../../src/core/api.ts';
import { openReview, route } from '../../src/lab/fixtures/harness.ts';
import { STUDIO_FOLDER, STUDIO_SET, studioRoutes } from '../../src/lab/fixtures/studio-film.ts';
import { countIs, evaluates, until, waitFor } from '../../src/lab/fixtures/settled.ts';
import { tone } from '../../src/lab/fixtures/tone.ts';
import type { Tab } from '../../src/lab/fixtures/tab.ts';

const SLOW = 30_000;
const HASH = 'location.hash';

/** Wait until the hash is something other than `was`, and give it. */
const movedFrom = (page: Tab, was: string) =>
  Effect.gen(function* () {
    yield* until(page, `location.hash !== '${was}'`);
    return yield* page.evaluate<string>(HASH);
  });

describe('a sheet closed after the time moved keeps the time', () => {
  it.live(
    "a Set's inspector",
    () =>
      Effect.gen(function* () {
        // Media that plays, so the clock moves and its time is kept in the hash.
        const media = route('GET', /^\/api\/review\/(files|phone)\/[^?]*\.mp4/, () => ({
          _tag: 'Wav',
          bytes: tone(30, 0.1),
        }));
        const { page, errors } = yield* openReview([media, ...studioRoutes], {
          href: pageHref.set(STUDIO_FOLDER, STUDIO_SET),
        });
        yield* waitFor(page, '.rv-transport');
        yield* waitFor(page, '.rv-main [data-act="inspect"]');
        yield* page.click('.rv-card[data-id="main"] [data-act="inspect"]');
        yield* waitFor(page, '[data-role="inspector"] [data-act="close-inspector"]');
        const tapped = yield* page.evaluate<string>(HASH);
        // Played a moment, then paused: the page's time has moved on from the tap's.
        yield* page.click('.rv-transport [data-act="play"]');
        yield* until(
          page,
          `!document.querySelector('.rv-time').textContent.startsWith('00:00:00:00')`,
        );
        yield* page.click('.rv-transport [data-act="play"]');
        const moved = yield* movedFrom(page, tapped);
        yield* page.click('[data-role="inspector"] [data-act="close-inspector"]');
        yield* countIs(page, '[data-role="inspector"]', 0);
        yield* evaluates(page, HASH, moved);
        expect(errors).toEqual([]);
      }).pipe(Effect.scoped),
    SLOW,
  );
});
