// Fixture for film/history-through-host: each line marked RED fires the rule,
// and nothing else does.

import { Effect, Option } from 'effect';
import { Location, UrlState } from '@bible/url-state';

declare const href: string;
declare const url: { readonly navigate: (to: string) => void };

export const pushed = UrlState.UrlState.use(
  (u) => u.navigate(href, { history: 'push', throttle: Option.none() }), // RED film/history-through-host
);
export const navigated = () => url.navigate(href); // RED film/history-through-host
export const push = Location.use((l) => l.push(href)); // RED film/history-through-host
export const replace = Location.use((bar) => bar.replace(href)); // RED film/history-through-host
export const bound = Effect.gen(function* () {
  const bar = yield* Location;
  yield* bar.push(href); // RED film/history-through-host
  yield* (yield* Location).replace(href); // RED film/history-through-host
});

// A list's push and a string's replace are not the address bar's.
const list: Array<number> = [];
list.push(1);
export const spaced = href.replace(' ', '%20');
// Reading the bar is no move chosen.
export const here = Location.use((bar) => bar.current);
export const entries = Location.use((bar) => bar.changes);

// Going Back is a move too: addressOn owns whether an entry is the page's to go over.
export const back = Location.use((bar) => bar.back); // RED film/history-through-host
export const forward = Location.use(({ forward }) => forward); // RED film/history-through-host
export const gone = Location.use((bar) => bar.go(-1)); // RED film/history-through-host

// A move taken through a destructured name, a flatMap, an alias or a pipe.
export const destructured = Effect.gen(function* () {
  const { replace } = yield* Location; // RED film/history-through-host
  yield* replace(href);
});
export const flatMapped = Effect.flatMap(Location.asEffect(), (bar) => bar.push(href)); // RED film/history-through-host
export const piped = Location.asEffect().pipe(
  Effect.flatMap((bar) => bar.replace(href)), // RED film/history-through-host
);
export const aliased = Effect.gen(function* () {
  const bar = yield* Location;
  const same = bar;
  yield* same.replace(href); // RED film/history-through-host
});
export const read = Effect.gen(function* () {
  const { current, changes } = yield* Location;
  return [yield* current, changes];
});
