/**
 * `one` as the app's tests see it: the router's boundary, standing in for
 * the parts the screens use, as One's web build has them. A link press
 * opens its href inside the app (recorded in `opened`, and told to each
 * listener in `opening`), and keeps the browser from following it; a click
 * with a modifier key, or not the main button, is left to the browser.
 * `Stack.Screen` draws a header from its options, its title and its right
 * items, which a test finds in `header` as a reader finds them in the
 * header; the hymn route's comes from the stack's options (`stack.tsx`). A screen that changes its own
 * route's params does so in place (`useRouter().setParams`, kept in
 * `paramsSet`).
 */

import { Match } from 'effect';
import { type MouseEvent, type ReactNode, useEffect, useId } from 'react';
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

/** One's `Link` as the screens under test use it: its href resolver (a path, or a path with its params as a query). */
export const Link = {
  resolveHref: (
    href: string | { readonly pathname: string; readonly params: Record<string, string> },
  ): string =>
    Match.value(href).pipe(
      Match.when(Match.string, (path) => path),
      Match.orElse(({ pathname, params: query }) =>
        [pathname, String(new URLSearchParams(query))].filter(Boolean).join('?'),
      ),
    ),
};

/** The safe-area insets the screens read, in points: a test sets them, as a phone's would be. */
export const safeArea = { top: 0, right: 0, bottom: 0, left: 0 };

/** One's `useSafeAreaInsets`: the insets a test set. */
export const useSafeAreaInsets = () => safeArea;

/** The route's params, as a test sets them: the hymn route reads `number`. */
export const params: Record<string, string> = {};

/** One's `useParams`: the params a test set. */
export const useParams = <T,>() => params as T;

/** Each change of the shown route's params, oldest first: a change in place, not a screen pushed. */
export const paramsSet: Array<Record<string, string>> = [];

/** One's `useRouter`, for a screen that changes its own route's params: the change is recorded and made. */
export const useRouter = () => ({
  setParams: (next: Record<string, string>) => {
    paramsSet.push(next);
    Object.assign(params, next);
  },
});

/** A header from a screen's options: named by its title, holding its right items. */
export const Stack = {
  Screen: ({
    options,
  }: {
    readonly options: { readonly title?: string; readonly headerRight?: () => ReactNode };
  }) => (
    <View testID="header" aria-label={options.title}>
      {options.headerRight?.()}
    </View>
  ),
};

/** Each keep-awake hold now taken, by its hook's id: a screen keeps the screen on while this is not empty. */
export const awake = new Set<string>();

/** One's `useKeepAwake`: held from the first frame of the component that calls it, let go when it leaves. */
export function useKeepAwake() {
  const id = useId();
  useEffect(() => {
    awake.add(id);
    return () => void awake.delete(id);
  }, [id]);
}

/** One's device modules, which no test reaches: the player's tests hand in their own (`playbackOn`). */
export const One = {};
