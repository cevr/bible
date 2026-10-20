/**
 * `one` as the app's tests see it: the router's boundary, standing in for
 * the parts the screens use, as One's web build has them. A link press
 * opens its href inside the app (recorded in `opened`), and keeps the
 * browser from following it; `Link asChild` hands its props to its child
 * as One's (a Radix `Slot`) does, the child's own props winning and the
 * click handlers both called. A screen's options configure the native
 * header, which a web render has none of.
 */

import {
  cloneElement,
  type MouseEvent,
  type ReactElement,
  type ReactNode,
  isValidElement,
} from 'react';

/** The hrefs opened inside the app, oldest first. */
export const opened: Array<string> = [];

type Press = (event?: MouseEvent) => void;

/** What `Link asChild` hands its child. */
interface SlotProps {
  readonly href?: string;
  readonly role?: string;
  readonly onClick?: Press;
}

/** One's `useLinkTo` on the web: a plain left click opens the href in the app. */
export function useLinkTo({ href }: { readonly href: string }) {
  const onPress: Press = (event) => {
    if (event?.defaultPrevented) return;
    if (event && (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey)) return;
    event?.preventDefault();
    opened.push(href);
  };
  return { href, role: 'link' as const, onPress };
}

export function Link({
  href,
  asChild,
  onPress,
  children,
}: {
  readonly href: string;
  readonly asChild?: boolean;
  readonly onPress?: Press;
  readonly children: ReactNode;
}) {
  const link = useLinkTo({ href });
  const onClick: Press = (event) => {
    onPress?.(event);
    link.onPress(event);
  };
  if (asChild && isValidElement<SlotProps>(children)) {
    const child: ReactElement<SlotProps> = children;
    return cloneElement(child, {
      href: link.href,
      role: link.role,
      ...child.props,
      onClick: (event?: MouseEvent) => {
        child.props.onClick?.(event);
        onClick(event);
      },
    });
  }
  return (
    <a href={link.href} onClick={onClick}>
      {children}
    </a>
  );
}

export const Stack = { Screen: (_: { readonly options: object }) => <></> };
