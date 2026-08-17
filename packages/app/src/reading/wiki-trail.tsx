/** The §5 breadcrumb trail, as one provider and one component.
 *
 *  > **Trail:** a breadcrumb history stack of hops, tap-to-jump, truncating to
 *  > the tapped crumb, cleared on leaving the wiki surface.
 *
 *  A context rather than a signal inside the topic page, because the trail
 *  outlives any one page: hopping from *sanctuary* to *investigative judgment*
 *  unmounts the first page and mounts the second, and a trail owned by the page
 *  would be a trail of length one. It is owned by the app shell instead, and
 *  every hop is recorded by the page that arrived.
 *
 *  All three transitions live in `peek-state.ts` as plain functions — `enterTopic`,
 *  `jumpTo`, `trailForRoute` — and are asserted there. What this file adds is the
 *  reactive plumbing: who holds the value, and when the route clears it.
 */

import { useLocation, useNavigate } from '@solidjs/router';
import { For, Show, type JSX } from '@solidjs/web';
import { Option } from 'effect';
import { createContext, createEffect, createSignal, useContext, type Accessor } from 'solid-js';

import {
  emptyTrail,
  enterTopic,
  jumpTo,
  topicPath,
  trailForRoute,
  type Crumb,
  type Trail,
} from './peek-state.js';

interface TrailStore {
  readonly trail: Accessor<Trail>;
  /** Records arrival at a topic. Idempotent for the page you are already on, and
   *  truncating for a page already in the trail — see `enterTopic`. */
  readonly enter: (crumb: Crumb) => void;
  readonly jump: (index: number) => void;
}

/** The default is a trail that records nothing.
 *
 *  The default *form* rather than Solid 2's canonical default-less one, and the
 *  reason is the one the API's own docs give for the exception: a missing
 *  provider here has a meaningful static fallback. The topic page renders
 *  correctly with no breadcrumb — the trail is navigation history, not content
 *  — so a host that mounted the page outside the provider should show a page
 *  without a trail rather than throw `ContextNotFoundError` inside a render. The
 *  provider is in `sharedRoutes`' own tree, so both shipped hosts have it. */
const TrailContext = createContext<TrailStore>({
  trail: () => emptyTrail,
  enter: () => {},
  jump: () => {},
});

export const useWikiTrail = (): TrailStore => useContext(TrailContext);

/** Holds the trail for the session and clears it when the reader leaves.
 *
 *  Clearing is derived from the location rather than from an explicit exit call,
 *  so no navigation path can forget: `trailForRoute` decides, and it decides
 *  from the destination. */
export const WikiTrailProvider = (props: { readonly children: JSX.Element }) => {
  const location = useLocation();
  const [trail, setTrail] = createSignal(emptyTrail);

  createEffect(
    () => location.pathname,
    (path) => {
      setTrail((current) => trailForRoute(current, path));
    },
  );

  const store: TrailStore = {
    trail,
    enter: (crumb) => setTrail((current) => enterTopic(current, crumb)),
    jump: (index) => setTrail((current) => jumpTo(current, index)),
  };

  // In Solid 2 the context *is* its own provider component — there is no
  // `.Provider`.
  return <TrailContext value={store}>{props.children}</TrailContext>;
};

/** The trail as the reader sees it.
 *
 *  Rendered only from the second hop: a trail of one crumb is the page's own
 *  title repeated above itself, which is noise rather than navigation. The last
 *  crumb is where the reader is, so it is marked `aria-current` and is not a
 *  link — tapping the page you are on is not a hop.
 *
 *  Tapping any earlier crumb both truncates the trail and navigates, in that
 *  order, so the page that arrives finds the trail already ending where it is
 *  and `enterTopic` records nothing new. */
export const WikiTrail = () => {
  const store = useWikiTrail();
  const navigate = useNavigate();
  const last = (): number => store.trail().length - 1;

  return (
    <Show when={store.trail().length > 1}>
      <nav class="bible-trail" aria-label="Topics you have followed">
        <ol>
          <For each={store.trail()}>
            {(crumb, index) => (
              <li>
                <Show
                  when={index() < last()}
                  fallback={
                    <span aria-current="page" class="bible-trail__current">
                      {crumb.title}
                    </span>
                  }
                >
                  <button
                    type="button"
                    class="bible-trail__crumb"
                    onClick={() => {
                      store.jump(index());
                      navigate(topicPath(crumb.slug));
                    }}
                  >
                    {crumb.title}
                  </button>
                </Show>
              </li>
            )}
          </For>
        </ol>
      </nav>
    </Show>
  );
};

/** The crumb for a page, as a value the page hands to `enter` on arrival.
 *
 *  A named helper rather than an object literal at the call site, so a page
 *  cannot record a crumb whose title is its slug — the failure mode a trail made
 *  of raw ids has, and one nobody notices until the second hop. */
export const crumbFor = (input: {
  readonly slug: string;
  readonly title: string;
}): Option.Option<Crumb> => {
  if (input.title.length === 0) return Option.none();
  return Option.some({ slug: input.slug, title: input.title });
};
