// The decoder in the fixture pages (`bundles.ts`): a fixture is one classic
// script, so a page whose tests show no footage is bundled without the
// footage host's decoder (mediabunny), which the lab's own build keeps in a
// chunk a page with no talk never fetches; a page whose tests show a talk's
// footage keeps it. `EncodedPacketSink` is one of mediabunny's classes,
// kept by name in a minified bundle.

import { describe, expect, it } from 'effect-bun-test';
import { Effect } from 'effect';
import { compile } from '../../../src/lab/fixtures/bundles.ts';

/** Long enough to bundle two pages. */
const BUNDLING = 20_000;

describe("the fixture pages' decoder", () => {
  it.live(
    'is left out of a page whose tests show no footage, and kept in one whose tests show a talk',
    () =>
      Effect.gen(function* () {
        const [review, player] = yield* Effect.all(
          [compile('review-page.ts'), compile('player-page.ts')],
          {
            concurrency: 2,
          },
        );
        expect(review.includes('EncodedPacketSink')).toBe(false);
        expect(review).toContain('this fixture page decodes no footage');
        expect(player.includes('EncodedPacketSink')).toBe(true);
      }),
    BUNDLING,
  );
});
