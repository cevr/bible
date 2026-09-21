import type { Source } from "effect-frame/actor";
import type { Host } from "effect-frame/view";
import { View, mount as mountView } from "effect-frame/view";
import {
  Context,
  Deferred,
  Effect,
  Exit,
  Option,
  Queue,
  Scope,
  Stream,
  SubscriptionRef,
} from "effect";
import type { AnyRoute, Entered } from "./route.js";

/**
 * The router (#18 §7). The URL is the state: the router holds nothing about
 * "where we are" beyond what the location reports, so a reload, a link, and
 * a back navigation are one code path.
 */

export interface NavigateOptions {
  /** Replace the current history entry instead of pushing one. */
  readonly replace?: boolean;
}

/** One movement of the document, as the views may observe it. */
export interface Navigation {
  readonly url: URL;
  readonly kind: "initial" | "push" | "replace" | "pop";
}

export interface RouterService {
  /**
   * Move to a printed href. It cannot fail: a URL no route matches shows
   * the not-found view. An href equal to the current one is not a move.
   */
  readonly navigate: (href: string, options?: NavigateOptions) => Effect.Effect<void>;
  /** Every navigation, the current one first. */
  readonly navigations: Source<Navigation>;
}

export class Router extends Context.Service<Router, RouterService>()(
  "effect-frame/src/router/router",
) {}

/**
 * Where the document is and how it moves. The browser has one; a server
 * render and a test each have their own. The router never touches the
 * platform directly, so this is the whole seam.
 */
export interface LocationService {
  readonly current: Effect.Effect<URL>;
  readonly push: (url: URL) => Effect.Effect<void>;
  readonly replace: (url: URL) => Effect.Effect<void>;
  /** URLs the platform moves to on its own: back and forward. */
  readonly pops: Stream.Stream<URL>;
}

export class Location extends Context.Service<Location, LocationService>()(
  "effect-frame/src/router/router/Location",
) {}

/** What the not-found view receives: the URL nothing matched. */
export interface NotFoundProps {
  readonly url: Source<URL>;
}

export interface MountOptions<R, HostNode> {
  readonly routes: ReadonlyArray<AnyRoute<R>>;
  readonly notFound: View.View<NotFoundProps, never, R>;
  readonly host: Host<HostNode>;
  readonly root: HostNode;
}

interface Mounted<R> {
  readonly route: AnyRoute<R>;
  readonly entered: Entered<R>;
  readonly scope: Scope.Closeable;
}

/** The not-found view as a route that matches everything, so one rule mounts both. */
const notFoundRoute = <R>(view: View.View<NotFoundProps, never, R>): AnyRoute<R> => ({
  name: "not-found",
  enter: (url) =>
    Option.some(
      Effect.map(SubscriptionRef.make(url), (current): Entered<R> => ({
        setup: view.setup({
          url: { get: SubscriptionRef.get(current), changes: SubscriptionRef.changes(current) },
        }),
        update: (next) => Effect.as(SubscriptionRef.set(current, next), true),
      })),
    ),
});

interface Resolved<R> {
  readonly route: AnyRoute<R>;
  readonly enter: Effect.Effect<Entered<R>>;
}

/** The first route that matches, or not-found. Total. */
const resolve = <R>(
  routes: ReadonlyArray<AnyRoute<R>>,
  fallback: AnyRoute<R>,
  url: URL,
): Resolved<R> => {
  for (const route of routes) {
    const entered = route.enter(url);
    if (Option.isSome(entered)) {
      return { route, enter: entered.value };
    }
  }
  return {
    route: fallback,
    enter: Option.getOrElse(fallback.enter(url), () => Effect.die("not-found did not match")),
  };
};

interface Request {
  readonly url: URL;
  readonly kind: Navigation["kind"];
  readonly done: Deferred.Deferred<void>;
}

/**
 * Mount a route tree on a host. The Scope owns the router; each shown route
 * lives in a child scope that closes when the route exits. A navigation to
 * the route already shown is a stayed transition: the view keeps its
 * identity and its scope, and the new values are published into its props.
 * Any other navigation enters the next route before it exits the previous
 * one, so the two are briefly both held.
 *
 * Navigations are applied one at a time on the router's own fiber, which is
 * what lets `navigate` require nothing: a view calls it from an event and
 * the route's own requirements are met where the router was mounted.
 * `Router` is provided to every route's view.
 */
export const mount = Effect.fn("Router.mount")(function* <R, HostNode>(
  options: MountOptions<R, HostNode>,
) {
  const location = yield* Location;
  const scope = yield* Effect.scope;
  const fallback = notFoundRoute(options.notFound);
  const initial = yield* location.current;
  const navigations = yield* SubscriptionRef.make<Navigation>({ url: initial, kind: "initial" });
  const requests = yield* Queue.unbounded<Request>();
  let mounted: Option.Option<Mounted<R>> = Option.none();

  const service: RouterService = {
    navigate: (href, navigateOptions) =>
      Effect.gen(function* () {
        const base = yield* location.current;
        const url = new URL(href, base);
        if (url.href === base.href) {
          return;
        }
        const done = yield* Deferred.make<void>();
        if (navigateOptions?.replace === true) {
          yield* location.replace(url);
          yield* Queue.offer(requests, { url, kind: "replace", done });
        } else {
          yield* location.push(url);
          yield* Queue.offer(requests, { url, kind: "push", done });
        }
        yield* Deferred.await(done);
      }),
    navigations: {
      get: SubscriptionRef.get(navigations),
      changes: SubscriptionRef.changes(navigations),
    },
  };

  const show = (url: URL) =>
    Effect.gen(function* () {
      const target = resolve(options.routes, fallback, url);
      if (Option.isSome(mounted) && mounted.value.route === target.route) {
        yield* mounted.value.entered.update(url);
        return;
      }
      const child = yield* Scope.fork(scope);
      const entered = yield* target.enter;
      const page = View.make(() => Effect.provideService(entered.setup, Router, service));
      yield* Scope.provide(mountView(page, {}, options.host, options.root), child);
      const previous = mounted;
      mounted = Option.some({ route: target.route, entered, scope: child });
      yield* Option.match(previous, {
        onNone: () => Effect.void,
        onSome: (shown) => Scope.close(shown.scope, Exit.void),
      });
    });

  const move = (url: URL, kind: Navigation["kind"]) =>
    Effect.andThen(SubscriptionRef.set(navigations, { url, kind }), show(url));

  yield* show(initial);
  yield* Effect.forkScoped(
    Stream.runForEach(Stream.fromQueue(requests), (request) =>
      Effect.andThen(move(request.url, request.kind), Deferred.succeed(request.done, void 0)),
    ),
  );
  yield* Effect.forkScoped(
    Stream.runForEach(location.pops, (url) =>
      Effect.flatMap(Deferred.make<void>(), (done) =>
        Queue.offer(requests, { url, kind: "pop", done }),
      ),
    ),
  );
  return service;
});

// ---------------------------------------------------------------------------
// The browser
// ---------------------------------------------------------------------------

/** The document's own location and history. */
export const browserLocation: LocationService = {
  current: Effect.sync(() => new URL(window.location.href)),
  push: (url) =>
    Effect.sync(() => {
      window.history.pushState({}, "", url.href);
    }),
  replace: (url) =>
    Effect.sync(() => {
      window.history.replaceState({}, "", url.href);
    }),
  // Suspended so that importing the module needs no window.
  pops: Stream.suspend(() =>
    Stream.map(Stream.fromEventListener(window, "popstate"), () => new URL(window.location.href)),
  ),
};

/** The anchor a click landed on, when it is one the router should follow. */
const followable = (event: MouseEvent): Option.Option<HTMLAnchorElement> => {
  if (event.defaultPrevented || event.button !== 0) {
    return Option.none();
  }
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
    return Option.none();
  }
  const target = event.target;
  if (!(target instanceof Element)) {
    return Option.none();
  }
  const anchor = target.closest("a[href]");
  if (!(anchor instanceof HTMLAnchorElement)) {
    return Option.none();
  }
  if (anchor.target === "_blank" || anchor.hasAttribute("download")) {
    return Option.none();
  }
  if (anchor.origin !== window.location.origin) {
    return Option.none();
  }
  return Option.some(anchor);
};

/**
 * One delegated click handler at the root. It intercepts a click only when
 * the browser would have followed a same-origin link in this tab; a middle
 * click, a modifier, `target="_blank"`, a download, and another origin are
 * all left to the browser. There is no link component: the anchor is an
 * anchor.
 *
 * The decision and `preventDefault` happen inside the listener, on the
 * browser's own call: a stream would deliver the event after the browser
 * had already followed the link. Only the navigation itself is queued.
 */
export const followLinks = Effect.fn("Router.followLinks")(function* (
  root: EventTarget,
  router: RouterService,
) {
  const hrefs = yield* Queue.unbounded<string>();
  const listener = (event: Event) => {
    if (!(event instanceof MouseEvent)) {
      return;
    }
    Option.match(followable(event), {
      onNone: () => {},
      onSome: (anchor) => {
        event.preventDefault();
        Queue.offerUnsafe(hrefs, anchor.href);
      },
    });
  };
  yield* Effect.acquireRelease(
    Effect.sync(() => {
      root.addEventListener("click", listener);
    }),
    () =>
      Effect.sync(() => {
        root.removeEventListener("click", listener);
      }),
  );
  yield* Effect.forkScoped(
    Stream.runForEach(Stream.fromQueue(hrefs), (href) => router.navigate(href)),
  );
});
