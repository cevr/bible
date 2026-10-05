/**
 * `@bible/url-state` as Effect atoms.
 *
 * A thin binding: every atom reads and writes through the core's services,
 * and holds no URL state of its own.
 *
 * - `layer`: the `Location` layer, one per registry. It is the browser's by
 *   default; seed it through the registry's initial values: the browser with
 *   options at an app's root, `layerServer(requestUrl)` per server render,
 *   a memory layer in a test, or a host's built `Location` and `UrlState`.
 * - `services`: `Location` and `UrlState`, built from `layer` in the atom's
 *   scope and kept alive with the registry; the layer's own `UrlState` when
 *   it has one.
 * - `href`: the URL as the program's writes leave it.
 * - `entry`: the history entry on screen (its key and how it arrived), for
 *   per-entry memory such as a scroll position.
 * - `place(place)`: the place's value, `None` off the place. Writing a value
 *   navigates to it (`UrlState.set`): writes in one tick make one entry. Every
 *   place atom derives from `href`, so all of them agree within a tick. Make
 *   one atom per place, at module level.
 *
 * **Server rendering.** A browser never sends the hash, so a place with hash
 * keys carries a server value (`Atom.withServerValue`): the place decoded
 * from the href without its hash, where every hash key is its default. A
 * binding that honours server values (`@bible/atom-solid`) renders it on the
 * server and on the client's hydration pass, then the real hash.
 */

import { Context, Effect, Exit, Layer, Option, Scheduler, Scope, Stream } from 'effect';
import * as Atom from 'effect/reactivity/Atom';

import { Location, type Entry } from './location.js';
import { layerBrowser } from './location-browser.js';
import * as Place from './place.js';
import { printHref, readHref } from './url-parts.js';
import * as UrlState from './url-state.js';

/** The `Location` layer for this registry. */
export const layer: Atom.Writable<Layer.Layer<Location>> = Atom.keepAlive(
  Atom.make<Layer.Layer<Location>>(layerBrowser()),
);

/**
 * `Location` and `UrlState`, built from `layer` and closed with the atom. A
 * layer that carries a `UrlState` of its own (a host that writes through
 * one) gives that one, so the page has a single `UrlState`; any other layer
 * gets one built over its `Location`.
 */
export const services: Atom.Atom<Services> = Atom.keepAlive(
  Atom.make((get) => {
    const scope = Scope.makeUnsafe();
    get.addFinalizer(() => Effect.runSync(Scope.close(scope, Exit.void)));
    return Effect.runSync(
      Effect.gen(function* () {
        const given = yield* Layer.buildWithScope(get(layer), scope);
        return yield* Option.match(Context.getOption(given, UrlState.UrlState), {
          onSome: (own) => Effect.succeed(Context.add(given, UrlState.UrlState, own)),
          onNone: () =>
            Layer.buildWithScope(
              UrlState.layer.pipe(Layer.provideMerge(Layer.succeedContext(given))),
              scope,
            ),
        });
      }),
    );
  }),
);

/**
 * An atom's read of a value the services hold: read synchronously, then kept
 * current by the stream of its changes. The stream runs on a microtask
 * scheduler, so a change lands in the turn it was made, before a paint.
 */
const follow =
  <A>(
    read: (context: Services) => Effect.Effect<A>,
    changes: (context: Services) => Stream.Stream<A>,
  ) =>
  (get: Atom.AtomContext): A => {
    const context = get(services);
    const fiber = Effect.runForkWith(context)(
      changes(context).pipe(
        Stream.runForEach((value) => Effect.sync(() => get.setSelf(value))),
        Effect.provideService(Scheduler.Scheduler, new Scheduler.MixedScheduler('sync')),
      ),
    );
    get.addFinalizer(() => fiber.interruptUnsafe());
    return Effect.runSyncWith(context)(read(context));
  };

type Services = Context.Context<Location | UrlState.UrlState>;

const currentHref = (context: Services) => Context.get(context, UrlState.UrlState).href;

/**
 * The href, writable here so a place's write shows in the same tick. The
 * stream of changes usually lands synchronously too (a parked fiber resumes
 * in the caller's turn), but a fiber past its operation budget yields to the
 * next microtask; the write sets the href itself, so it never waits on that.
 */
const hrefState = Atom.keepAlive(
  Atom.writable(
    follow(currentHref, (context) => Context.get(context, UrlState.UrlState).changes),
    (ctx, value: string) => ctx.setSelf(value),
  ),
);

/** The URL as the program's writes leave it. */
export const href: Atom.Atom<string> = hrefState;

/** The history entry on screen. */
export const entry: Atom.Atom<Entry> = Atom.keepAlive(
  Atom.make(
    follow(
      (context) => Context.get(context, Location).current,
      (context) => Context.get(context, Location).changes,
    ),
  ),
);

/** An href with its hash left off: what a server is asked for. */
const withoutHash = (url: string): string => printHref({ ...readHref(url), hash: {} });

/** The place's value, `None` off the place; writing a value navigates to it. */
export const place = <A>(at: Place.Place<A>): Atom.Writable<Option.Option<A>, A> => {
  const atom = Atom.writable(
    (get) => Place.decode(at, get(href)),
    (ctx, value: A) => {
      const context = ctx.get(services);
      Effect.runSyncWith(context)(UrlState.set(at, value));
      ctx.set(hrefState, Effect.runSyncWith(context)(currentHref(context)));
    },
  );
  if (at.policies.hash.size === 0) return atom;
  return Atom.withServerValue(atom, (get) => Place.decode(at, withoutHash(get(href))));
};
