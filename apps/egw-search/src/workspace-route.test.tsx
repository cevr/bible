import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { describe, expect, test } from 'bun:test';
import { Deferred, Effect, Queue, Ref, Schema, Stream } from 'effect';
import { Location, NavigationBehavior, Route, UrlState, mount } from 'effect-frame/router';
import type { LocationService } from 'effect-frame/router';
import type { Source } from 'effect-frame/actor/client';
import { Dom, View } from 'effect-frame/view';
import { ViewTest } from 'effect-frame/view/testing';

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
    const segment = Route.segment('search', {
      path: '/',
      search: Route.search(Schema.Struct({})),
    });
    const search = Route.client(
      'search',
      Route.leaf(segment, () =>
        Effect.gen(function* () {
          const state = yield* UrlState.make(WorkspaceSchema, { searchKeys: WORKSPACE_KEYS });
          const text = View.bind(state.state, (panes) => panes.map((pane) => pane.q).join('|'));
          const scopes = View.bind(state.state, (panes) =>
            panes.map((pane) => pane.scope).join('|'),
          );
          return yield* Effect.as(
            Deferred.succeed(captured, state),
            <>
              <p id="workspace">{text}</p>
              <p id="workspace-scopes">{scopes}</p>
            </>,
          );
        }),
      ),
    );
    const page = yield* ViewTest.make({
      host: Dom.host,
      root,
      rootId: 'egw-workspace-route',
      summarizeRoot: (actualRoot) => {
        if (actualRoot instanceof HTMLElement) return actualRoot.innerHTML;
        return '';
      },
      setup: (host, mountRoot) =>
        mount({
          routes: [search],
          notFound: NotFound,
          host,
          root: mountRoot,
          landing: NavigationBehavior.Restore,
          traversalReadLimit: '3 seconds',
        }).pipe(Effect.provideService(Location, location.service)),
    });
    return { page, root, location, navigation: yield* Deferred.await(captured) };
  });

const textOf = (root: Node): string => {
  if (root instanceof HTMLElement) return root.querySelector('#workspace')?.textContent ?? '';
  return '';
};
const scopesOf = (root: Node): string => {
  if (root instanceof HTMLElement) {
    return root.querySelector('#workspace-scopes')?.textContent ?? '';
  }
  return '';
};

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
      const { page, root, location, navigation } = yield* start(
        'http://app.test/?q=first&q2=second',
      );
      yield* page.act(
        Effect.all([navigation.push(updatePane(0, 'a')), navigation.push(updatePane(1, 'b'))], {
          concurrency: 2,
        }),
        {
          label: 'both pane pushes render',
          until: (actualRoot) => textOf(actualRoot) === 'firsta|secondb',
        },
      );

      expect(textOf(root)).toBe('firsta|secondb');
      expect(location.history.map((entry) => entry.startsWith('push '))).toEqual([true, true]);
      const current = yield* location.current;
      expect(current.searchParams.get('q')).toBe('firsta');
      expect(current.searchParams.get('q2')).toBe('secondb');

      yield* page.act(
        navigation.replace((currentWorkspace) =>
          currentWorkspace.map((pane, index) => {
            if (index === 1) return { ...pane, scope: 'egw' };
            return pane;
          }),
        ),
        {
          label: 'second pane filter replaces history',
          until: (actualRoot) => scopesOf(actualRoot) === 'all|egw',
        },
      );
      expect(location.history.map((entry) => entry.startsWith('replace '))).toEqual([
        false,
        false,
        true,
      ]);
      expect((yield* location.current).searchParams.get('scope2')).toBe('egw');

      yield* page.act(location.pop('/?q=first&q2=second'), {
        label: 'browser back restores both panes',
        until: (actualRoot) =>
          textOf(actualRoot) === 'first|second' && scopesOf(actualRoot) === 'all|all',
      });
      expect(textOf(root)).toBe('first|second');
    }).pipe(Effect.scoped, Effect.runPromise));
});
