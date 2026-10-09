// A Set's hear button is the kit's one hear button: it says it is pressed while
// its version is the one heard, and has a name for a reader, as Choices' does.

import { Effect } from 'effect';
import { describe, expect, it } from 'effect-bun-test';
import { pageHref } from '../../../src/core/api.ts';
import { openReview } from '../../../src/lab/fixtures/harness.ts';
import { STUDIO_FOLDER, STUDIO_SET, studioRoutes } from '../../../src/lab/fixtures/studio-film.ts';
import { attributeIs, waitFor } from '../../../src/lab/fixtures/settled.ts';

const SLOW = 30_000;
const HEAR = (id: string) => `.rv-card[data-id="${id}"] [data-act="hear"]`;

describe("a Set's hear button", () => {
  it.live(
    'reports pressed for the version heard, and is named',
    () =>
      Effect.gen(function* () {
        const { page, errors } = yield* openReview(studioRoutes, {
          href: pageHref.set(STUDIO_FOLDER, STUDIO_SET),
        });
        yield* waitFor(page, HEAR('warm'));
        // The first version is heard first.
        yield* attributeIs(page, HEAR('main'), 'aria-pressed', 'true');
        yield* attributeIs(page, HEAR('warm'), 'aria-pressed', 'false');
        yield* attributeIs(page, HEAR('warm'), 'aria-label', 'Hear this one');
        yield* page.click(HEAR('warm'));
        yield* attributeIs(page, HEAR('warm'), 'aria-pressed', 'true');
        yield* attributeIs(page, HEAR('main'), 'aria-pressed', 'false');
        expect(errors).toEqual([]);
      }).pipe(Effect.scoped),
    SLOW,
  );
});
