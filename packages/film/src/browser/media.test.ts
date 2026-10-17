// What a page hears: `hear` plays one playable and pauses the one heard
// before it, telling that one's hearer it was hushed; `hush` pauses the one
// heard; `play` plays beside whatever is heard, as the review's synced
// players play many at once.

import { Effect } from 'effect';
import { describe, expect, it } from 'effect-bun-test';
import { fakeMedia } from './fixtures/media.ts';
import { Media, Played } from './media.ts';

const media = Media.layerOver(() => fakeMedia().media);

/** A hearer's hushed effect, and how often it was told. */
const hearer = () => {
  const told: Array<string> = [];
  return { told, hushed: (who: string) => Effect.sync(() => told.push(who)) };
};

describe('what a page hears', () => {
  it.effect('pauses the one heard before as another is heard, and tells its hearer', () =>
    Effect.gen(function* () {
      const m = yield* Media;
      const take = fakeMedia();
      const reader = fakeMedia();
      const { told, hushed } = hearer();
      expect(yield* m.hear(take.media, hushed('take'))).toEqual(Played.Playing());
      expect(yield* m.hear(reader.media, hushed('reader'))).toEqual(Played.Playing());
      expect(take.asked).toEqual(['play', 'pause']);
      expect(take.media.playing()).toBe(false);
      expect(reader.media.playing()).toBe(true);
      expect(told).toEqual(['take']);
    }).pipe(Effect.provide(media)),
  );

  it.effect('hears one heard again without pausing it', () =>
    Effect.gen(function* () {
      const m = yield* Media;
      const take = fakeMedia();
      const { told, hushed } = hearer();
      yield* m.hear(take.media, hushed('take'));
      yield* m.hear(take.media, hushed('take'));
      expect(take.asked).toEqual(['play', 'play']);
      expect(told).toEqual([]);
    }).pipe(Effect.provide(media)),
  );

  it.effect('hushes the one heard, once', () =>
    Effect.gen(function* () {
      const m = yield* Media;
      const take = fakeMedia();
      const { told, hushed } = hearer();
      yield* m.hush;
      yield* m.hear(take.media, hushed('take'));
      yield* m.hush;
      yield* m.hush;
      expect(take.asked).toEqual(['play', 'pause']);
      expect(told).toEqual(['take']);
    }).pipe(Effect.provide(media)),
  );

  it.effect('keeps nothing heard from a play the browser refused', () =>
    Effect.gen(function* () {
      const m = yield* Media;
      const refused = fakeMedia('NotSupportedError');
      const { told, hushed } = hearer();
      expect(yield* m.hear(refused.media, hushed('refused'))).toEqual(
        Played.Failed({ name: 'NotSupportedError' }),
      );
      yield* m.hush;
      expect(refused.asked).toEqual(['play']);
      expect(told).toEqual([]);
    }).pipe(Effect.provide(media)),
  );

  it.effect('plays beside the one heard: play hushes nothing', () =>
    Effect.gen(function* () {
      const m = yield* Media;
      const take = fakeMedia();
      const panes = [fakeMedia(), fakeMedia()];
      const { told, hushed } = hearer();
      yield* m.hear(take.media, hushed('take'));
      for (const pane of panes) yield* m.play(pane.media);
      expect(take.media.playing()).toBe(true);
      expect(panes.every((p) => p.media.playing())).toBe(true);
      expect(told).toEqual([]);
    }).pipe(Effect.provide(media)),
  );
});
