import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { describe, expect, test } from 'bun:test';
import { Deferred, Effect, Queue, Ref, Schema, Stream } from 'effect';
import { Location, Route, UrlState, mount } from 'effect-frame/router';
import type { LocationService } from 'effect-frame/router';
import type { Source } from 'effect-frame/actor/client';
import { Dom, View, render } from 'effect-frame/view';

import { WORKSPACE_KEYS, Workspace as WorkspaceSchema } from './url-state.js';

if (!GlobalRegistrator.isRegistered) {
  GlobalRegistrator.register({ url: 'http://app.test/' });
}

interface FakeLocation {
  readonly service: LocationService;
  readonly current: Effect.Effect<URL>;
  readonly history: string[];
  readonly pop: (href: string) => Effect.Effect<void>;
}

type Workspace = Schema.Schema.Type<typeof WorkspaceSchema>;
type CapturedNavigation = UrlState.State<Workspace>;

const makeLocation = (initial: string): Effect.Effect<FakeLocation> =>
  Effect.gen(function* () {
    const current = yield* Ref.make(new URL(initial));
    const pops = yield* Queue.unbounded<URL>();
    const history: string[] = [];
    return {
      service: {
        current: Ref.get(current),
        push: (url) =>
          Effect.andThen(
            Ref.set(current, url),
            Effect.sync(() => history.push(`push ${url.pathname}${url.search}`)),
          ),
        replace: (url) =>
          Effect.andThen(
            Ref.set(current, url),
            Effect.sync(() => history.push(`replace ${url.pathname}${url.search}`)),
          ),
        pops: Stream.fromQueue(pops),
      },
      current: Ref.get(current),
      history,
      pop: (href) =>
        Effect.gen(function* () {
          const url = new URL(href, initial);
          yield* Ref.set(current, url);
          yield* Queue.offer(pops, url);
        }),
    };
  });

const NotFound = (_props: { readonly url: Source<URL> }) => Effect.succeed(<p>not found</p>);

const start = (initial: string) =>
  Effect.gen(function* () {
    const root = yield* Effect.sync(() => document.createElement('main'));
    const location = yield* makeLocation(initial);
    const captured = yield* Deferred.make<CapturedNavigation>();
    const search = Route.client('search', {
      path: '/',
      params: Schema.Struct({}),
      search: Route.search(Schema.Struct({})),
      view: () =>
        Effect.gen(function* () {
          const state = yield* UrlState.make(WorkspaceSchema, { keys: WORKSPACE_KEYS });
          const text = View.bind(state.state, (panes) => panes.map((pane) => pane.q).join('|'));
          return yield* Effect.as(Deferred.succeed(captured, state), <p id="workspace">{text}</p>);
        }),
    });
    yield* mount({ routes: [search], notFound: NotFound, host: Dom.host, root }).pipe(
      Effect.provideService(Location, location.service),
    );
    return { root, location, navigation: yield* Deferred.await(captured) };
  });

const textOf = (root: HTMLElement): string => root.querySelector('#workspace')?.textContent ?? '';

const updatePane =
  (index: number, suffix: string) =>
  (current: Workspace): Workspace =>
    current.map((pane, position) => {
      if (position === index) return { ...pane, q: `${pane.q}${suffix}` };
      return pane;
    });

describe('workspace route updates', () => {
  test('serializes concurrent pane updates and keeps replace and pop semantics', () =>
    Effect.gen(function* () {
      const { root, location, navigation } = yield* start('http://app.test/?q=first&q2=second');
      yield* Effect.all(
        [navigation.push.update(updatePane(0, 'a')), navigation.push.update(updatePane(1, 'b'))],
        { concurrency: 2 },
      );
      yield* render;

      expect(textOf(root)).toBe('firsta|secondb');
      expect(location.history.map((entry) => entry.startsWith('push '))).toEqual([true, true]);
      const current = yield* location.current;
      expect(current.searchParams.get('q')).toBe('firsta');
      expect(current.searchParams.get('q2')).toBe('secondb');

      yield* navigation.update((currentWorkspace) =>
        currentWorkspace.map((pane, index) => {
          if (index === 1) return { ...pane, scope: 'egw' };
          return pane;
        }),
      );
      yield* render;
      expect(location.history.map((entry) => entry.startsWith('replace '))).toEqual([
        false,
        false,
        true,
      ]);
      expect((yield* location.current).searchParams.get('scope2')).toBe('egw');

      yield* location.pop('/?q=first&q2=second');
      yield* render;
      expect(textOf(root)).toBe('first|second');
    }).pipe(Effect.scoped, Effect.runPromise));
});
