// Fixture for film/history-through-host on the address bar's owner: a
// traversal (Back, Forward) is the owner's alone, chosen inside its dismissal,
// so one read off the bar `addressOn` gives, or off `Location` reached
// through a host's context, is refused.

import { Context, Effect } from 'effect';
import { Location } from '@bible/url-state';
import { addressOn as barOf } from '../../src/browser/host.ts';

declare const host: Context.Context<Location>;
declare const href: string;

export const backed = () => barOf(host).back(); // RED film/history-through-host
const address = barOf(host);
export const forwarded = () => address.forward(); // RED film/history-through-host
export const { back } = barOf(host); // RED film/history-through-host
export const fromContext = Context.get(host, Location).back; // RED film/history-through-host
export const fromContextUnsafe = Effect.sync(() => Context.getUnsafe(host, Location).go(-1)); // RED film/history-through-host

// The bar's own moves: the place, or the dismissal, chooses the history.
export const went = () => address.go(href);
export const followed = () => address.follow(href);
export const here = Context.get(host, Location).current;
// Another module's `back` is not the bar's.
declare const deck: { readonly back: () => void };
export const flipped = () => deck.back();

// The service under a type wrapper is the service.
const pinned = Context.getUnsafe(host, Location) satisfies { readonly back: unknown };
export const pinnedBack = pinned.back; // RED film/history-through-host
export const cast = (Context.get(host, Location) as { readonly back: unknown }).back; // RED film/history-through-host

// A parameter named like the bar's maker, or like effect's `Context`, is its own binding.
export const ownBar = (barOf: (on: unknown) => { readonly back: () => void }) => barOf(host).back();
export const ownContext = (Context: {
  readonly get: (on: unknown, key: unknown) => { readonly back: number };
}) => Context.get(host, Location).back;
