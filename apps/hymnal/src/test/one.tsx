/**
 * `one` as the app's tests see it: the router's boundary, standing in for
 * the parts the screens use, as One's web build has them. A link press
 * opens its href inside the app (recorded in `opened`, and told to each
 * listener in `opening`), and keeps the browser from following it; a click
 * with a modifier key, or not the main button, is left to the browser. A
 * screen's options configure the native header, which a web render has none
 * of.
 */

import type { MouseEvent } from 'react';

/** The hrefs opened inside the app, oldest first. */
export const opened: Array<string> = [];

/** Called with each href opened inside the app, as the router shows its screen. */
export const opening = new Set<(href: string) => void>();

type Press = (event?: MouseEvent) => void;

/** One's `useLinkTo` on the web (`one/src/link/useLinkTo.tsx`): a plain left click opens the href in the app. */
export function useLinkTo({ href }: { readonly href: string }) {
  const onPress: Press = (event) => {
    if (event?.defaultPrevented) return;
    if (
      event &&
      (event.button !== 0 || event.metaKey || event.altKey || event.ctrlKey || event.shiftKey)
    )
      return;
    event?.preventDefault();
    opened.push(href);
    for (const open of opening) open(href);
  };
  return { href, role: 'link' as const, onPress };
}

/** One's `Link` as the screens under test use it: its href resolver (a typed route is its own path). */
export const Link = { resolveHref: (href: string) => href };

export const Stack = { Screen: (_: { readonly options: object }) => <></> };
