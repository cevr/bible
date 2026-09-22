/* oxlint-disable effect/noNullish -- the controlled response intentionally
 * carries JSON nulls for absent links and ranks. */

import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { describe, expect, test } from 'bun:test';
import { Query as HostQuery } from 'effect-frame/actor';
import { QueryTest } from 'effect-frame/actor/testing';
import * as Frame from 'effect-frame/frame';
import { Location, Route, mount } from 'effect-frame/router';
import type { LocationService } from 'effect-frame/router';
import { Dom, ViewTest } from 'effect-frame/view';
import {
  Cause,
  Context,
  Deferred,
  Effect,
  Exit,
  Inspectable,
  Layer,
  Option,
  Queue,
  Ref,
  Schema,
  Stream,
} from 'effect';
import { TestClock } from 'effect/testing';

import type { SearchResponse } from '../server/api.js';
import { Search, type SearchRequest } from './contract.js';
import { SearchPage } from './app.js';

if (!GlobalRegistrator.isRegistered) {
  GlobalRegistrator.register({ url: 'http://app.test/' });
}

const elementRoot = (root: Node): HTMLElement | undefined => {
  if (root instanceof HTMLElement) return root;
  return undefined;
};

interface FakeLocation {
  readonly service: LocationService;
  readonly writes: Queue.Queue<{ readonly kind: 'push' | 'replace'; readonly url: URL }>;
  readonly pop: (href: string) => Effect.Effect<void>;
}

const makeLocation = (initial: string): Effect.Effect<FakeLocation> =>
  Effect.gen(function* () {
    const current = yield* Ref.make(new URL(initial));
    const pops = yield* Queue.unbounded<URL>();
    const writes = yield* Queue.unbounded<{
      readonly kind: 'push' | 'replace';
      readonly url: URL;
    }>();
    return {
      service: {
        current: Ref.get(current),
        push: (url) =>
          Effect.andThen(Ref.set(current, url), Queue.offer(writes, { kind: 'push', url })),
        replace: (url) =>
          Effect.andThen(Ref.set(current, url), Queue.offer(writes, { kind: 'replace', url })),
        pops: Stream.fromQueue(pops),
      },
      writes,
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

const answerFor = (request: SearchRequest): SearchResponse => {
  let text = request.q;
  if (request.scope !== 'all') text = `${request.q} [${request.scope}]`;
  return {
    hits: [
      {
        refcode: 'GC 1.1',
        bookCode: 'GC',
        bookTitle: 'The Great Controversy',
        author: 'Ellen White',
        text,
        isHeading: false,
        lexicalRank: 1,
        vectorRank: null,
        url: null,
        before: [paragraph(`${request.q} before one`), paragraph(`${request.q} before two`)],
        after: [paragraph(`${request.q} after one`), paragraph(`${request.q} after two`)],
      },
    ],
    scope: 'all',
    vector: 'lexical — absent',
    nonSelective: false,
  };
};

const start = (initial: string) =>
  Effect.gen(function* () {
    const root = yield* Effect.sync(() => document.createElement('main'));
    const location = yield* makeLocation(initial);
    const batches = yield* Queue.unbounded<ReadonlyArray<SearchRequest>>();
    const holdStarted = yield* Deferred.make<void>();
    const releaseHold = yield* Deferred.make<void>();

    const testLayer = QueryTest.layer({
      queries: [
        HostQuery.batched(Search, {
          resolve: (requests) =>
            Effect.gen(function* () {
              yield* Queue.offer(batches, requests);
              if (requests.some((request) => request.q === 'diagnostic-hold')) {
                yield* Deferred.succeed(holdStarted, undefined);
                yield* Deferred.await(releaseHold);
              }
              return (request: (typeof requests)[number]) => Effect.succeed(answerFor(request));
            }),
        }),
      ],
    }).pipe(Layer.provideMerge(Frame.layer({ name: 'egw-search-test' })));

    const search = Route.client('search-page-test', {
      path: '/',
      params: Schema.Struct({}),
      search: Route.search(Schema.Struct({})),
      view: SearchPage,
    });

    // Build the query layer in the test's root scope. The mounted page owns a
    // child scope, but its cache and host remain alive until that page closes.
    const testContext = yield* Layer.build(testLayer);
    const frame = Context.get(testContext, Frame.Service);
    const page = yield* ViewTest.make({
      host: Dom.host,
      root,
      rootId: 'egw-search-page',
      summarizeRoot: (actualRoot) => elementRoot(actualRoot)?.innerHTML ?? '',
      setup: (host, mountRoot) =>
        mount({
          routes: [search],
          notFound: () => Effect.succeed(<p>not found</p>),
          host,
          root: mountRoot,
        }).pipe(
          Effect.provideService(Location, location.service),
          // oxlint-disable-next-line effect/noInlineProvide -- the mounted page needs its local query test layer.
          Effect.provide(testContext),
        ),
    }).pipe(
      // The mounted app owns this context. ViewTest also captures it for bounded diagnostics.
      // oxlint-disable-next-line effect/noInlineProvide -- diagnostics must use the app Frame.
      Effect.provide(testContext),
    );

    return { page, root, batches, location, frame, holdStarted, releaseHold };
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
  test('continues on the same Frame root and releases page records', () =>
    Effect.gen(function* () {
      const { page, batches, frame, holdStarted, releaseHold } = yield* start(
        'http://app.test/?q=diagnostic-hold',
      );
      const initial = yield* Queue.take(batches);
      expect(initial).toHaveLength(1);
      expect(initial[0]?.q).toBe('diagnostic-hold');
      yield* Deferred.await(holdStarted);
      yield* page.waitFor({
        label: 'held query renders Loading',
        timeout: '2 seconds',
        until: (actualRoot) =>
          (elementRoot(actualRoot)?.querySelector('.skeleton') ?? null) !== null,
      });

      const loadingInspection = yield* frame.inspect;
      const loadingMount = loadingInspection.mounts.find(({ phase }) => phase === 'mounted');
      const loadingRoute = loadingInspection.routes[0];
      const loadingQuery = loadingInspection.queries.find((query) =>
        query.key.includes('"q":"diagnostic-hold"'),
      );
      expect(loadingInspection.root.id).toBeDefined();
      expect(loadingInspection.mounts).toHaveLength(1);
      expect(loadingMount).toBeDefined();
      expect(loadingRoute?.routeName).toBe('search-page-test');
      expect(loadingRoute?.phase).toBe('mounted');
      expect(loadingMount?.ownerId).toBeDefined();
      expect(loadingRoute?.ownerId).toBeDefined();
      expect(loadingRoute?.parentOwnerId).toBeDefined();
      expect(loadingQuery?.state).toBe('Loading');
      expect(loadingQuery?.failure).toBeNull();

      const diagnosticExit = yield* Effect.exit(
        page.waitFor({
          label: 'held query never becomes ready',
          timeout: '100 millis',
          until: () => false,
        }),
      );
      expect(Exit.isFailure(diagnosticExit)).toBe(true);
      if (!Exit.isFailure(diagnosticExit)) {
        return yield* Effect.die('expected the held query condition to time out');
      }
      const diagnosticError = Cause.findErrorOption(diagnosticExit.cause);
      expect(Option.isSome(diagnosticError)).toBe(true);
      if (Option.isNone(diagnosticError)) {
        return yield* Effect.die('expected a typed condition receipt');
      }
      expect(Schema.is(ViewTest.ConditionNotObserved)(diagnosticError.value)).toBe(true);
      if (!Schema.is(ViewTest.ConditionNotObserved)(diagnosticError.value)) {
        return yield* Effect.die('expected a ConditionNotObserved receipt');
      }
      const conditionError = diagnosticError.value;
      expect(conditionError._tag).toBe('ConditionNotObserved');
      expect(conditionError.rootDisposed).toBe(false);
      expect(conditionError.inspection._tag).toBe('Available');
      if (conditionError.inspection._tag === 'Available') {
        const snapshot = conditionError.inspection.snapshot;
        const snapshotMount = snapshot.mounts.find(({ phase }) => phase === 'mounted');
        const snapshotRoute = snapshot.routes[0];
        expect(snapshot.root.id).toBe(loadingInspection.root.id);
        expect(snapshot.mounts).toHaveLength(1);
        expect(snapshotMount).toBeDefined();
        expect(snapshotRoute?.routeName).toBe('search-page-test');
        expect(snapshotRoute?.phase).toBe('mounted');
        expect(snapshotMount?.ownerId).toBeDefined();
        expect(snapshotRoute?.ownerId).toBeDefined();
        expect(snapshotRoute?.parentOwnerId).toBeDefined();
        expect(snapshot.actors.length).toBeGreaterThan(0);
        expect(snapshot.actors.every(({ kind }) => kind === 'local')).toBe(true);
        expect(
          snapshot.actors.every(({ parentOwnerId }) => parentOwnerId === snapshotMount?.ownerId),
        ).toBe(true);
        expect(
          snapshot.queries.some(
            (query) => query.state === 'Loading' && query.key.includes('"q":"diagnostic-hold"'),
          ),
        ).toBe(true);
        expect(snapshot.commands._tag).toBe('Unavailable');
      }

      yield* Deferred.succeed(releaseHold, undefined);
      yield* page.waitFor({
        label: 'held query continues to ready results',
        timeout: '2 seconds',
        until: (actualRoot) =>
          elementRoot(actualRoot)?.querySelector('.text')?.textContent === 'diagnostic-hold',
      });
      const continuedInspection = yield* frame.inspect;
      expect(continuedInspection.root.id).toBe(loadingInspection.root.id);
      expect(
        continuedInspection.queries.some(
          (query) => query.state === 'Ready' && query.key.includes('"q":"diagnostic-hold"'),
        ),
      ).toBe(true);

      // Closing the page releases its records. The Frame root stays alive for inspection.
      yield* page.close;
      const closedInspection = yield* frame.inspect;
      expect(closedInspection.root.id).toBe(loadingInspection.root.id);
      expect(closedInspection.mounts).toEqual([]);
      expect(closedInspection.routes).toEqual([]);
      expect(closedInspection.actors).toEqual([]);
      expect(closedInspection.queries).toEqual([]);
      expect(closedInspection.urlStates).toEqual([]);
    }).pipe(
      // oxlint-disable-next-line effect/noInlineProvide -- the test clock must own debounce timers.
      Effect.provide(TestClock.layer()),
      Effect.scoped,
      Effect.runPromise,
    ));

  test('keeps expanded rows when another pane filter changes', () =>
    Effect.gen(function* () {
      const { page, root, batches, location, frame } = yield* start(
        'http://app.test/?q=first&q2=second',
      );
      const initial = yield* Queue.take(batches);
      expect(initial.map((request) => request.q).toSorted()).toEqual(['first', 'second']);
      expect(initial).toHaveLength(2);
      yield* page.waitFor({
        label: 'initial two-pane results',
        timeout: '2 seconds',
        until: (actualRoot) =>
          elementRoot(actualRoot)?.querySelectorAll('.pane .hit:not(.skeleton)').length === 2,
      });
      const initialInspection = yield* frame.inspect;
      const initialMount = initialInspection.mounts.find(({ phase }) => phase === 'mounted');
      const initialRoute = initialInspection.routes[0];
      const initialUrlState = initialInspection.urlStates[0];
      const initialFirstQuery = initialInspection.queries.find((query) =>
        query.key.includes('"q":"first"'),
      );
      const initialActorIds = initialInspection.actors.map(({ id }) => id).toSorted();

      expect(initialInspection.mounts).toHaveLength(1);
      expect(initialRoute?.routeName).toBe('search-page-test');
      expect(initialRoute?.phase).toBe('mounted');
      expect(initialRoute?.canonicalUrl).toBe('http://app.test/?q=first&q2=second');
      expect(initialInspection.urlStates).toHaveLength(1);
      expect(initialUrlState?.routeInstanceId).toBe(initialRoute?.routeInstanceId);
      expect(initialUrlState?.keys).toContain('q');
      expect(initialUrlState?.keys).toContain('q2');
      const urlStateText = Inspectable.toStringUnknown(initialUrlState?.value, 0);
      expect(urlStateText).toContain('first');
      expect(urlStateText).toContain('second');
      expect(initialInspection.actors.length).toBeGreaterThanOrEqual(6);
      expect(initialInspection.actors.every(({ kind }) => kind === 'local')).toBe(true);
      expect(
        initialInspection.actors.every(
          ({ parentOwnerId }) => parentOwnerId === initialMount?.ownerId,
        ),
      ).toBe(true);
      expect(initialInspection.queries).toHaveLength(2);
      expect(initialInspection.queries.every(({ state }) => state === 'Ready')).toBe(true);
      expect(
        initialInspection.queries.map(({ key }) => key).some((key) => key.includes('"q":"first"')),
      ).toBe(true);
      expect(
        initialInspection.queries.map(({ key }) => key).some((key) => key.includes('"q":"second"')),
      ).toBe(true);
      expect(initialInspection.commands._tag).toBe('Unavailable');

      const firstPane = root.querySelector('.pane') as HTMLElement;
      const firstHit = firstPane.querySelector('.hit');
      const expand = firstPane.querySelector('.expand');
      expect(expand).not.toBeNull();
      yield* page.act(
        Effect.sync(() => {
          expand?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        }),
        {
          label: 'first pane expands its context',
          until: (actualRoot) =>
            elementRoot(actualRoot)?.querySelector('.pane')?.querySelectorAll('.context').length ===
            4,
        },
      );
      expect(firstPane.querySelectorAll('.context')).toHaveLength(4);

      const secondPane = root.querySelectorAll<HTMLElement>('.pane')[1];
      expect(secondPane).toBeDefined();
      const filterToggle = secondPane?.querySelector<HTMLButtonElement>('.ftoggle');
      expect(filterToggle).not.toBeNull();
      yield* page.act(
        Effect.sync(() => filterToggle?.click()),
        {
          label: 'second pane opens filters',
          until: (actualRoot) => {
            const pane = elementRoot(actualRoot)?.querySelectorAll<HTMLElement>('.pane')[1];
            return pane !== undefined && pane.querySelector('.fbody') !== null;
          },
        },
      );
      const scope = Array.from(
        secondPane?.querySelectorAll<HTMLButtonElement>('.fchips button') ?? [],
      ).find((button) => button.textContent === 'Ellen White');
      expect(scope).toBeDefined();
      const secondHit = secondPane?.querySelector('.hit');
      const replacement = yield* page.act(
        Effect.andThen(
          Effect.sync(() => scope?.click()),
          Queue.take(location.writes),
        ),
        {
          label: 'second pane filter replaces the URL',
          until: (actualRoot) => {
            const pane = elementRoot(actualRoot)?.querySelectorAll<HTMLElement>('.pane')[1];
            return pane !== undefined && pane.querySelector('.filtered') !== null;
          },
        },
      );
      expect(replacement.kind).toBe('replace');

      yield* page.act(
        Effect.gen(function* () {
          yield* TestClock.adjust('100 millis');
          const requests = yield* nextBatchFor(
            batches,
            (request) => request.q === 'second' && request.scope === 'egw',
          );
          expect(requests).toHaveLength(1);
        }),
        {
          label: 'second pane renders its filtered response',
          until: (actualRoot) =>
            elementRoot(actualRoot)
              ?.querySelectorAll<HTMLElement>('.pane')[1]
              ?.querySelector('.text')?.textContent === 'second [egw]',
        },
      );
      const filteredInspection = yield* frame.inspect;
      expect(filteredInspection.routes[0]?.routeInstanceId).toBe(initialRoute?.routeInstanceId);
      expect(filteredInspection.mounts[0]?.id).toBe(initialMount?.id);
      expect(filteredInspection.urlStates[0]?.id).toBe(initialUrlState?.id);
      expect(filteredInspection.actors.map(({ id }) => id).toSorted()).toEqual(initialActorIds);
      expect(filteredInspection.queries.some(({ id }) => id === initialFirstQuery?.id)).toBe(true);
      expect(
        filteredInspection.queries.some(
          ({ key }) => key.includes('"q":"second"') && key.includes('"scope":"egw"'),
        ),
      ).toBe(true);
      expect(
        filteredInspection.queries.some(
          ({ key }) => key.includes('"q":"second"') && key.includes('"scope":"all"'),
        ),
      ).toBe(false);

      expect(firstPane.querySelectorAll('.context')).toHaveLength(4);
      expect(firstPane.querySelector('.hit')).toBe(firstHit);

      const firstInput = root.querySelector<HTMLInputElement>('.pane input');
      expect(firstInput).not.toBeNull();
      if (firstInput !== null) {
        const submit = firstInput.form;
        expect(submit).not.toBeNull();
        const submitButton =
          firstInput.form?.querySelector<HTMLButtonElement>('button[type="submit"]');
        expect(submitButton).not.toBeNull();
        yield* page.act(
          Effect.sync(() => {
            firstInput.value = '';
            firstInput.dispatchEvent(new Event('input', { bubbles: true }));
          }),
          {
            label: 'first pane clears its draft',
            until: (actualRoot) =>
              elementRoot(actualRoot)
                ?.querySelector('.pane button[type="submit"]')
                ?.hasAttribute('disabled') === true,
          },
        );
        yield* page.act(
          Effect.sync(() => {
            firstInput.value = 'fresh';
            firstInput.dispatchEvent(new Event('input', { bubbles: true }));
          }),
          {
            label: 'first pane accepts its fresh draft',
            until: (actualRoot) => {
              const actual = elementRoot(actualRoot);
              return (
                actual?.querySelector('.pane input') === firstInput &&
                (actual?.querySelector('.pane input') as HTMLInputElement | null)?.value ===
                  'fresh' &&
                actual?.querySelector('.pane button[type="submit"]')?.hasAttribute('disabled') ===
                  false
              );
            },
          },
        );
        const pushed = yield* page.act(
          Effect.gen(function* () {
            submit?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
            const write = yield* Queue.take(location.writes);
            yield* TestClock.adjust('100 millis');
            const requests = yield* nextBatchFor(batches, (request) => request.q === 'fresh');
            expect(requests).toHaveLength(1);
            return write;
          }),
          {
            label: 'first pane submits a fresh query',
            until: (actualRoot) =>
              elementRoot(actualRoot)?.querySelector('.pane')?.querySelector('.text')
                ?.textContent === 'fresh',
          },
        );
        expect(pushed.kind).toBe('push');
      }

      expect(firstPane.querySelectorAll('.context')).toHaveLength(2);
      expect(secondPane?.querySelector('.hit')).toBe(secondHit);
      expect(secondPane?.querySelector('.text')?.textContent).toBe('second [egw]');

      yield* page.close;
      const closedInspection = yield* frame.inspect;
      expect(closedInspection.mounts).toEqual([]);
      expect(closedInspection.routes).toEqual([]);
      expect(closedInspection.actors).toEqual([]);
      expect(closedInspection.queries).toEqual([]);
      expect(closedInspection.urlStates).toEqual([]);
      expect(closedInspection.commands._tag).toBe('Unavailable');
    }).pipe(
      // oxlint-disable-next-line effect/noInlineProvide -- the test clock must own debounce timers.
      Effect.provide(TestClock.layer()),
      Effect.scoped,
      Effect.runPromise,
    ));
});
