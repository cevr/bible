/**
 * The app's one address: `/`, with the workspace in the query string.
 *
 * Apart from `./routes.tsx` so the page view can type its props from it
 * (`Route.PropsOf<typeof search>` in `./app.tsx`) without importing the
 * route tree that mounts it. The search codec declares no key: the page owns
 * the whole query string through `UrlState` (`./url-state.ts`).
 */

import { Route } from 'effect-frame/router';
import { Schema } from 'effect';

export const search = Route.segment('search', {
  path: '/',
  search: Route.search(Schema.Struct({})),
});
