/* oxlint-disable effect/noNullish -- the controlled response intentionally
 * carries JSON nulls for absent links and ranks. */

import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { describe, expect, test } from 'bun:test';
import { Query as HostQuery } from 'effect-frame/actor';
import { QueryTest } from 'effect-frame/actor/testing';
import { Location, Route, mount } from 'effect-frame/router';
import type { LocationService, RouteProps } from 'effect-frame/router';
import { Dom, render } from 'effect-frame/view';
import { Deferred, Effect, Queue, Ref, Schema, Stream } from 'effect';
import { TestClock } from 'effect/testing';

import type { SearchResponse } from '../server/api.js';
import { Search, type SearchRequest } from './contract.js';
import { SearchPage } from './app.js';
import { Workspace as WorkspaceSchema } from './url-state.js';

if (!GlobalRegistrator.isRegistered) {
  GlobalRegistrator.register({ url: 'http://app.test/' });
}

interface FakeLocation {
  readonly service: LocationService;
  readonly pop: (href: string) => Effect.Effect<void>;
}

const makeLocation = (initial: string): Effect.Effect<FakeLocation> =>
  Effect.gen(function* () {
    const current = yield* Ref.make(new URL(initial));
    const pops = yield* Queue.unbounded<URL>();
    return {
      service: {
        current: Ref.get(current),
        push: (url) => Ref.set(current, url),
        replace: (url) => Ref.set(current, url),
        pops: Stream.fromQueue(pops),
      },
      pop: (href) =>
        Effect.gen(function* () {
          const url = new URL(href, initial);
          yield* Ref.set(current, url);
          yield* Queue.offer(pops, url);
        }),
    };
  });

const paragraph = (text: string) => ({
  refcode: null,
  text,
  url: null,
  isHeading: false,
});

const answerFor = (query: string): SearchResponse => ({
  hits: [
    {
      refcode: 'GC 1.1',
      bookCode: 'GC',
      bookTitle: 'The Great Controversy',
      author: 'Ellen White',
      text: query,
      isHeading: false,
      lexicalRank: 1,
      vectorRank: null,
      url: null,
      before: [paragraph(`${query} before one`), paragraph(`${query} before two`)],
      after: [paragraph(`${query} after one`), paragraph(`${query} after two`)],
    },
  ],
  scope: 'all',
  vector: 'lexical — absent',
  nonSelective: false,
});

type Workspace = Schema.Schema.Type<typeof WorkspaceSchema>;
type SearchPageProps = RouteProps<{}, Workspace>;

interface Started {
  readonly root: HTMLElement;
  readonly navigation: Pick<SearchPageProps, 'updateSearch' | 'replaceSearch'>;
  readonly batches: Queue.Queue<ReadonlyArray<SearchRequest>>;
}

const start = (initial: string) =>
  Effect.gen(function* () {
    const root = yield* Effect.sync(() => document.createElement('main'));
    const location = yield* makeLocation(initial);
    const batches = yield* Queue.unbounded<ReadonlyArray<SearchRequest>>();
    const captured = yield* Deferred.make<Started['navigation']>();

    const testLayer = QueryTest.layer({
      queries: [
        HostQuery.batched(Search, {
          resolve: (requests) =>
            Effect.andThen(
              Queue.offer(batches, requests),
              Effect.succeed((request: (typeof requests)[number]) =>
                Effect.succeed(answerFor(request.q)),
              ),
            ),
        }),
      ],
    });

    const search = Route.client('search-page-test', {
      path: '/',
      params: Schema.Struct({}),
      search: WorkspaceSchema,
      view: (props: SearchPageProps) =>
        Effect.gen(function* () {
          yield* Deferred.succeed(captured, {
            updateSearch: props.updateSearch,
            replaceSearch: props.replaceSearch,
          });
          return yield* SearchPage(props);
        }),
    });

    yield* mount({
      routes: [search],
      notFound: () => Effect.succeed(<p>not found</p>),
      host: Dom.host,
      root,
    }).pipe(
      Effect.provideService(Location, location.service),
      // oxlint-disable-next-line effect/noInlineProvide -- the mounted page needs its local query test layer.
      Effect.provide(testLayer),
    );

    return { root, navigation: yield* Deferred.await(captured), batches };
  });

const nextBatchFor = (
  batches: Queue.Queue<ReadonlyArray<SearchRequest>>,
  matches: (request: SearchRequest) => boolean,
) =>
  Effect.gen(function* () {
    while (true) {
      const requests = yield* Queue.take(batches);
      if (requests.some(matches)) return requests;
    }
  });

describe('SearchPage', () => {
  test('keeps expanded rows when another pane filter changes', () =>
    Effect.gen(function* () {
      const { root, navigation, batches } = yield* start('http://app.test/?q=first&q2=second');
      const initial = yield* Queue.take(batches);
      expect(initial.map((request) => request.q).toSorted()).toEqual(['first', 'second']);
      yield* render;

      const firstPane = root.querySelector('.pane') as HTMLElement;
      const expand = firstPane.querySelector('.expand');
      expect(expand).not.toBeNull();
      expand?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      yield* render;
      expect(firstPane.querySelectorAll('.context')).toHaveLength(4);

      yield* navigation.replaceSearch((current) =>
        current.map((pane, index) => {
          if (index === 1) return { ...pane, scope: 'egw' };
          return pane;
        }),
      );
      yield* Effect.yieldNow;
      yield* TestClock.adjust('100 millis');
      yield* nextBatchFor(batches, (request) => request.q === 'second' && request.scope === 'egw');
      yield* render;

      expect(firstPane.querySelectorAll('.context')).toHaveLength(4);

      yield* navigation.updateSearch((current) =>
        current.map((pane, index) => {
          if (index === 0) return { ...pane, q: 'fresh' };
          return pane;
        }),
      );
      yield* Effect.yieldNow;
      yield* TestClock.adjust('100 millis');
      yield* nextBatchFor(batches, (request) => request.q === 'fresh');
      yield* render;

      expect(firstPane.querySelectorAll('.context')).toHaveLength(2);
    }).pipe(
      // oxlint-disable-next-line effect/noInlineProvide -- the test clock must own debounce timers.
      Effect.provide(TestClock.layer()),
      Effect.scoped,
      Effect.runPromise,
    ));
});
