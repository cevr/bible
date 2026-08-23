/** The one search form both corpora share (round-2 B3).
 *
 *  §10 asks for "one search surface, shared query/scope/book URL state". The
 *  route model already carried all three; what was missing was the form. Before
 *  this, `/search` swapped `BibleSearch` for `WritingsSearch` on `scope`, the
 *  only `<form>` in the app lived *inside* `BibleSearch` and hard-coded
 *  `scope: 'bible'`, and `WritingsSearch` rendered results with no input at all.
 *  A reader on `/search` therefore had no way to reach the writings side short of
 *  editing the URL by hand.
 *
 *  Every decision here is taken in `search-state.ts` — which scopes exist, which
 *  is current, what route each navigates to, what the empty box says. What is
 *  left is markup, for the reason the rest of this directory gives: a rule taken
 *  inside JSX is a rule no DOM-less unit test can state.
 *
 *  The scope controls are **anchors, not buttons**. A scope switch is a location,
 *  so it belongs in history: it must be shareable, back-navigable, and decodable
 *  by `route.test.ts`. Rendering them as links is what makes all three true, and
 *  is why `scopeOptions` yields routes rather than callbacks.
 */

import { useNavigate } from '@solidjs/router';
import { For } from '@solidjs/web';
import { createEffect, createMemo, createSignal } from 'solid-js';

import { encodeRoute } from '../route/index.js';
import { Button, Input } from '../ui/index.js';
import {
  scopeOptions,
  submittedRoute,
  type SearchRoute,
  type SearchScopeOption,
} from './search-state.js';

export interface SearchFormProps {
  readonly route: SearchRoute;
}

/** `aria-current="page"` on the scope that is showing, and the attribute absent
 *  on the other.
 *
 *  `undefined` rather than `Option` because this is a DOM attribute value, not a
 *  domain value: Solid omits an attribute whose value is `undefined`, and ARIA
 *  defines *absence* as the "not current" state — `aria-current="false"` is a
 *  different thing that assistive technology announces. The `Option` would have
 *  to be unwrapped to exactly this at the JSX boundary anyway. */
const currentScope = (
  option: SearchScopeOption,
  // oxlint-disable-next-line effect/noNullish -- the DOM's own "omit this attribute" signal; ARIA distinguishes an absent aria-current from aria-current="false"
): 'page' | undefined => {
  if (option.active) return 'page';
  // oxlint-disable-next-line effect/noNullish -- as above: Solid omits an attribute whose value is undefined
  return undefined;
};

export const SearchForm = (props: SearchFormProps) => {
  const navigate = useNavigate();
  const [draft, setDraft] = createSignal('');
  // The box follows the URL: a scope switch, a back navigation and a shared link
  // all arrive as a route change, and the input has to agree with what is being
  // shown or the reader is looking at results for text the box does not hold.
  createEffect(
    () => props.route.query,
    (routeQuery) => {
      setDraft(routeQuery);
    },
  );
  // One memo, one immutable value per route — the discipline `lookup-panel-state.ts`
  // documents in full. Reading `props.route` per control would let two controls
  // draw from different routes mid-update.
  const scopes = createMemo(() => scopeOptions(props.route));

  return (
    <div class="bible-search__search">
      <form
        class="bible-search__form"
        onSubmit={(event) => {
          event.preventDefault();
          navigate(encodeRoute(submittedRoute(props.route, draft())));
        }}
      >
        <Input
          value={draft()}
          onInput={(event) => setDraft(event.currentTarget.value)}
          placeholder="Search…"
          aria-label="Search"
          autofocus
        />
        <Button type="submit" tone="accent">
          Search
        </Button>
      </form>
      <nav class="bible-search__scopes" aria-label="Search scope">
        <For each={scopes()}>
          {(option) => (
            <a
              class="bible-search__scope"
              href={encodeRoute(option.route)}
              data-scope={option.id}
              aria-current={currentScope(option)}
              onClick={(event) => {
                // A real `href` so the control is a link the reader can copy,
                // open in a new window, and see in the status bar — but the
                // navigation goes through the router.
                //
                // The host decides what the bare path in `href` means: the
                // desktop renderer runs on `hashHistory()` from a `file://`
                // origin, where letting the browser follow `/search?...` walks
                // out of the application entirely. `navigate` is the one path
                // that is correct under every history mode this app is mounted
                // with. Modified clicks are left to the browser so
                // open-in-new-window keeps working.
                if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
                event.preventDefault();
                navigate(encodeRoute(option.route));
              }}
            >
              {option.label}
            </a>
          )}
        </For>
      </nav>
    </div>
  );
};
