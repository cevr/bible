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
// Reading the bar, or going Back over an entry the page pushed, is no move chosen.
export const here = Location.use((bar) => bar.current);
export const back = Location.use((bar) => bar.back);
