// Fixture for film/history-through-host with only a namespace import of the
// package: the service is `US.Location`, and no name is imported for it.

import { Effect } from 'effect';
import * as US from '@bible/url-state';

declare const href: string;

export const bound = Effect.gen(function* () {
  const bar = yield* US.Location;
  yield* bar.push(href); // RED film/history-through-host
});
export const used = US.Location.use((bar) => bar.back); // RED film/history-through-host
