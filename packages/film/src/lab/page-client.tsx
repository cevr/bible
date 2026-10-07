// A page's mount in the browser, for its browser entry: hydrated over the
// markup the lab rendered it with on the server (`page-server.tsx`: its root
// marked `PAGE_ROOT`, its styles in the head), or, served as built (no
// server entry, a render that failed or was cut, a kept build), rendered
// anew with its styles added and its root made. Either way the same
// components run. A film page whose film does not start, or whose faces do
// not load, fails (`PageEnd`): its tree disposed and its keys unheard before
// it says why in its place.
// Every studio page mounts in the one sequence `mountStudio` runs (the Lab,
// Scenes and Play, and the review).

import { Location } from '@bible/url-state';
import { type JSX, hydrate, render } from '@solidjs/web';
import { Deferred, Effect, Fiber, type Layer, Option } from 'effect';
import type { Frames } from '../browser/frames.ts';
import { type BrowserServices, type Host, addressOn, hostOf } from '../browser/host.ts';
import { BrowserHost } from '../browser/host-browser.ts';
import type { Media } from '../browser/media.ts';
import type { Viewport } from '../browser/viewport.ts';
import type { Hub } from '../command/hub.ts';
import { legacyPlace } from '../core/api.ts';
import { PAGE_CUT, PAGE_MOUNTED, PAGE_ROOT, PAGE_STYLE } from '../core/page-render.ts';
import { showFailure } from '../player/dom.ts';
import { registerFace } from '../player/face.ts';

/** A page as its browser entry mounts it: the same parts its server entry renders (`pageRender`). */
interface MountedPage {
  readonly bodyClass: string;
  readonly rootClass: string;
  readonly style: string;
  readonly app: () => JSX.Element;
}

/** How a page was mounted: over the server's markup, or anew. */
type Mounted = 'hydrated' | 'rendered';

/** A page as mounted: how, and what disposes its tree (its reads, feeds and atoms with it). */
interface MountedAs {
  readonly how: Mounted;
  readonly dispose: () => void;
}

/**
 * Mount `page`: hydrated over the server's markup when the page came with
 * it whole, else rendered. A page whose render the lab cut short (it ends
 * with `PAGE_CUT_MARK`) has its server markup and the mark dropped first: a
 * hydration would wait on parts of it that never came. The body says how
 * once it is (`PAGE_MOUNTED`).
 */
const mountPage = (page: MountedPage): MountedAs => {
  document.body.classList.add(page.bodyClass);
  const served = Option.fromNullishOr(document.querySelector(`[${PAGE_ROOT}]`));
  const cut = Option.fromNullishOr(document.querySelector(`[${PAGE_CUT}]`));
  if (Option.isSome(cut)) for (const node of [...Option.toArray(served), cut.value]) node.remove();
  const whole = Option.filter(served, () => Option.isNone(cut));
  const mounted = Option.match(whole, {
    onSome: (served): MountedAs => ({ how: 'hydrated', dispose: hydrate(page.app, served) }),
    onNone: (): MountedAs => ({ how: 'rendered', dispose: rendered(page) }),
  });
  document.body.setAttribute(PAGE_MOUNTED, mounted.how);
  return mounted;
};

/** `page` rendered anew: its styles added unless the page has them, its root made. */
const rendered = (page: MountedPage): (() => void) => {
  if (Option.isNone(Option.fromNullishOr(document.querySelector(`[${PAGE_STYLE}]`)))) {
    const style = document.createElement('style');
    style.setAttribute(PAGE_STYLE, '');
    style.textContent = page.style;
    document.head.append(style);
  }
  const root = document.createElement('div');
  root.className = page.rootClass;
  document.body.append(root);
  return render(page.app, root);
};

/**
 * A film page's end, made before the page is mounted (its body, loaded
 * later, may end it) and settled once it is (`mounted`). Failing it disposes
 * its tree and stops its key listener, then says why in its place, so a film
 * that does not start (or whose faces do not load) leaves no part of the
 * page running behind the words: no feed asking its server again, no key
 * heard. It is the one way a studio page says it failed.
 */
interface PageEnd {
  /** End the page (once it is mounted, at once if it already is), then show `why` in its place. */
  readonly fail: (why: string) => Effect.Effect<void>;
  /** The page mounted as `page`, hearing its keys on `listening`: what ending it stops. */
  readonly mounted: (page: MountedAs, listening: Fiber.Fiber<unknown>) => Effect.Effect<void>;
}

/** A page's end, to settle once the page is mounted. */
const makePageEnd: Effect.Effect<PageEnd> = Effect.map(
  Deferred.make<Effect.Effect<void>>(),
  (stop): PageEnd => ({
    fail: (why) =>
      Effect.andThen(
        Effect.flatten(Deferred.await(stop)),
        Effect.sync(() => showFailure(why)),
      ),
    mounted: (page, listening) =>
      Effect.asVoid(
        Deferred.succeed(
          stop,
          Effect.andThen(Effect.sync(page.dispose), Fiber.interrupt(listening)),
        ),
      ),
  }),
);

/** A studio page as its browser entry mounts it. */
interface StudioPage {
  /** Its body's and root's classes and its styles (`pageRender`'s too). */
  readonly page: Omit<MountedPage, 'app'>;
  /** The event its mount logs, with where it is and how it mounted (`lab.shell`). */
  readonly event: string;
  /**
   * Its media, when it does more than the host's own (the review's
   * compares on WebCodecs panes, `panesMediaLayer`): its host is
   * `BrowserHost.withMedia` it, so no other page loads what it needs.
   */
  readonly media?: Layer.Layer<Media, never, Frames | Viewport>;
  /**
   * Its commands' hub and its app over `host`, given what fails the page: a
   * film page's body, loaded later, fails it when its film does not start.
   */
  readonly on: (
    host: Host,
    fail: (why: string) => Effect.Effect<void>,
  ) => Effect.Effect<
    { readonly hub: Hub; readonly app: () => JSX.Element },
    never,
    BrowserServices
  >;
}

/**
 * Mount `studio` into the page over the browser's host: an old link the
 * server could not see all of (a bare `#<seconds>`) goes on to its place;
 * the UI face is registered first, so the fonts a film waits on include it;
 * then its commands and their one key listener, and the page mounted
 * (`mountPage`), its end settled on it.
 */
export const mountStudio = (studio: StudioPage): void => {
  const host = hostOf(
    Option.match(Option.fromUndefinedOr(studio.media), {
      onNone: () => BrowserHost.layer,
      onSome: BrowserHost.withMedia,
    }),
  );
  Effect.runSyncWith(host)(
    Effect.gen(function* () {
      const address = addressOn(host);
      Option.map(legacyPlace(address.href()), address.follow);
      registerFace(document.fonts);
      const ending = yield* makePageEnd;
      const { hub, app } = yield* studio.on(host, ending.fail);
      const listening = yield* Effect.forkDetach(hub.listen);
      const mounted = mountPage({ ...studio.page, app });
      yield* ending.mounted(mounted, listening);
      const { href } = yield* Location.use((bar) => bar.current);
      yield* Effect.logInfo(`${studio.event} href=${href} how=${mounted.how}`);
    }),
  );
};
