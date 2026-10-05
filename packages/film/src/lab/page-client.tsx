// A page's mount in the browser, for its browser entry: hydrated over the
// markup the lab rendered it with on the server (`page-server.tsx`: its root
// marked `PAGE_ROOT`, its styles in the head), or, served as built (no
// server entry, a render that failed or was cut, a kept build), rendered
// anew with its styles added and its root made. Either way the same
// components run. A film page whose film does not start ends (`PageEnd`):
// its tree disposed and its keys unheard before it says why in its place.

import { type JSX, hydrate, render } from '@solidjs/web';
import { Deferred, Effect, Fiber, Option } from 'effect';
import { PAGE_CUT, PAGE_MOUNTED, PAGE_ROOT, PAGE_STYLE } from '../core/page-render.ts';

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
export const mountPage = (page: MountedPage): MountedAs => {
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
 * later, may end it) and settled once it is (`mounted`). Ending it disposes
 * its tree and stops its key listener, so a film that does not start leaves
 * no part of the page running behind the words that say why: no feed asking
 * its server again, no key heard.
 */
interface PageEnd {
  /** End the page: once it is mounted, at once if it already is. */
  readonly end: Effect.Effect<void>;
  /** The page mounted as `page`, hearing its keys on `listening`: what ending it stops. */
  readonly mounted: (page: MountedAs, listening: Fiber.Fiber<unknown>) => Effect.Effect<void>;
}

/** A page's end, to settle once the page is mounted. */
export const makePageEnd: Effect.Effect<PageEnd> = Effect.map(
  Deferred.make<Effect.Effect<void>>(),
  (stop): PageEnd => ({
    end: Effect.flatten(Deferred.await(stop)),
    mounted: (page, listening) =>
      Effect.asVoid(
        Deferred.succeed(
          stop,
          Effect.andThen(Effect.sync(page.dispose), Fiber.interrupt(listening)),
        ),
      ),
  }),
);
