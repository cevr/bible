/**
 * `one` as the app's tests see it: the router's boundary, standing in for
 * the parts the screens use, as One's web build has them. A link press
 * opens its href inside the app (recorded in `opened`, and told to each
 * listener in `opening`), and keeps the browser from following it; a click
 * with a modifier key, or not the main button, is left to the browser. A
 * screen's options configure the native header, which a web render has none
 * of, except its right items, which a test finds in `header` as a reader
 * finds them in the header.
 */

import type { MouseEvent, ReactNode } from 'react';
import { View } from 'react-native';

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

/** The safe-area insets the screens read, in points: a test sets them, as a phone's would be. */
export const safeArea = { top: 0, right: 0, bottom: 0, left: 0 };

/** One's `useSafeAreaInsets`: the insets a test set. */
export const useSafeAreaInsets = () => safeArea;

/** The route's params, as a test sets them: the hymn route reads `number`. */
export const params: Record<string, string> = {};

/** One's `useParams`: the params a test set. */
export const useParams = <T,>() => params as T;

export const Stack = {
  Screen: ({ options }: { readonly options: { readonly headerRight?: () => ReactNode } }) => (
    <View testID="header">{options.headerRight?.()}</View>
  ),
};

/** One's device modules, which no test reaches: the player's tests hand in their own (`playbackOn`). */
export const One = {};
