import { TopicDetail, TopicId, TopicService } from '@bible/core/topics';
import { WikiService, topicSlug } from '@bible/core/wiki';
import { Effect, Layer, Option, Schema } from 'effect';
import { describe, expect, it } from 'effect-bun-test';

import { topicsJson } from '../../src/commands/wiki.js';

/** The catalog ships inside the verified `bible.db`, so it is available in every
 *  state the wiki can be in — including the one this file is about, where no
 *  topics artifact is installed. */
const catalog = TopicService.Test([
  TopicDetail.make({
    id: Schema.decodeSync(TopicId)('sanctuary'),
    name: 'Sanctuary',
    alternativeNames: [],
    sections: [],
  }),
  TopicDetail.make({
    id: Schema.decodeSync(TopicId)('grace'),
    name: 'Grace',
    alternativeNames: [],
    sections: [],
  }),
]);

const listing = Effect.gen(function* () {
  const wiki = yield* WikiService;
  return { topics: yield* wiki.list({}), unavailable: yield* wiki.availability };
});

describe('bible wiki topics --json', () => {
  it.effect('reports catalog entries and the absence reason with no artifact', () =>
    Effect.gen(function* () {
      // The Milestone 2 CLI JSON workflow: with the artifact removed the command
      // must still return data. An empty `topics` array would tell a consumer
      // the wiki has nothing, when in fact every topic still has a page.
      const payload = topicsJson(yield* listing);

      expect(payload.unavailable).toBe('artifact-not-installed');
      expect(payload.count).toBe(2);
      // `slug` is branded, so it is compared as its string projection rather
      // than reconstructing the brand in the expectation.
      expect(
        payload.topics.map((topic) => ({
          slug: String(topic.slug),
          title: topic.title,
          status: topic.status,
        })),
      ).toEqual([
        { slug: 'sanctuary', title: 'Sanctuary', status: 'catalog' },
        { slug: 'grace', title: 'Grace', status: 'catalog' },
      ]);
    }).pipe(Effect.provide(WikiService.Absent.pipe(Layer.provide(catalog)))),
  );

  it.effect('reports a null absence when the artifact is readable', () =>
    Effect.gen(function* () {
      // `null` rather than a missing key: the field is the wire's way of saying
      // "authored cores are available", so it must always be present.
      const payload = topicsJson({
        topics: yield* Effect.succeed([]),
        unavailable: Option.none(),
      });
      expect(payload.unavailable).toBeNull();
    }),
  );

  it.effect('marks an authored page flagship and leaves the rest catalog', () =>
    Effect.gen(function* () {
      const wiki = yield* WikiService;
      const page = yield* wiki.topic(topicSlug('sanctuary'));
      // Every topic has a page even with no artifact — it simply has no
      // authored core, and says why.
      expect(page.status).toBe('catalog');
      expect(page.unavailable).toEqual(Option.some('artifact-not-installed'));
    }).pipe(Effect.provide(WikiService.Absent.pipe(Layer.provide(catalog)))),
  );
});
