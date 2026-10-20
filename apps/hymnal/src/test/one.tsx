/**
 * `one` as the app's tests see it: the router's boundary, standing in for
 * the parts the screens use. A link is an anchor to its href; a screen's
 * options configure the native header, which an HTML render has none of.
 */

import type { ReactNode } from 'react';

export function Link({ href, children }: { readonly href: string; readonly children: ReactNode }) {
  return <a href={href}>{children}</a>;
}

export const Stack = { Screen: (_: { readonly options: object }) => <></> };
