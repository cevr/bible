/**
 * The bottom inset the stack's screens meet (`stackBottom`), given by the
 * layout around its stack: none while the bar docked under the stack shows,
 * the device's inset while it is hidden. A list's end space and a page's
 * bottom space read it, so they follow the bar. Outside the layout (a test
 * of one screen) a screen meets the device's inset.
 */

import { Option } from 'effect';
import { useSafeAreaInsets } from 'one';
import { createContext, type ReactNode, use, useMemo } from 'react';

import { stackBottom } from './bar';
import { usePlayer } from './context';
import type { HymnPlayer } from './player';
import { useBar } from './PlayerBar';

const Bottom = createContext<Option.Option<number>>(Option.none());

/** The stack's screens, told the bottom inset they meet as the bar shows or hides. */
export function StackBottom({ children }: { readonly children: ReactNode }) {
  const inset = useSafeAreaInsets().bottom;
  return Option.match(usePlayer(), {
    onNone: () => <Meets bottom={Math.max(0, inset)}>{children}</Meets>,
    onSome: (player) => (
      <WithBar player={player} inset={inset}>
        {children}
      </WithBar>
    ),
  });
}

function WithBar({
  player,
  inset,
  children,
}: {
  readonly player: HymnPlayer;
  readonly inset: number;
  readonly children: ReactNode;
}) {
  return <Meets bottom={stackBottom(useBar(player), inset)}>{children}</Meets>;
}

/** Hands `bottom` down; its readers draw again only when the number changes. */
function Meets({ bottom, children }: { readonly bottom: number; readonly children: ReactNode }) {
  const value = useMemo(() => Option.some(bottom), [bottom]);
  return <Bottom value={value}>{children}</Bottom>;
}

/** The bottom inset the calling screen meets, in points. */
export const useStackBottom = (): number => {
  const inset = useSafeAreaInsets().bottom;
  return Option.getOrElse(use(Bottom), () => Math.max(0, inset));
};
