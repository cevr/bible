// Upstream: packages/react/src/context-menu/root/ContextMenuRoot.tsx
//
// A menu opened by a right click or a long press on its trigger area, placed
// at the pointer. It is a `Menu.Root` under a context-menu context that holds
// the anchor point and the gesture bookkeeping; a context menu inside another
// menu starts a menu of its own.
import type { JSX } from '@solidjs/web';
import { createSignal, createUniqueId } from 'solid-js';

import type { BaseUIChangeEventDetails } from '../../internals/createBaseUIEventDetails.ts';
import { MenuRoot, type MenuRootProps } from '../../menu/root/MenuRoot.tsx';
import { MenuRootContext } from '../../menu/root/MenuRootContext.ts';
import type { MenuChangeEventReason } from '../../menu/store/MenuStore.ts';
import {
  type ContextMenuAnchor,
  ContextMenuRootContext,
  type ContextMenuRootContext as ContextMenuRootContextValue,
} from './ContextMenuRootContext.ts';

interface ContextMenuRootProps extends Omit<MenuRootProps, 'onOpenChange'> {
  /** Called when the menu opens or closes. */
  onOpenChange?:
    | ((open: boolean, eventDetails: ContextMenuRootChangeEventDetails) => void)
    | undefined;
}

type ContextMenuRootChangeEventReason = MenuChangeEventReason;
type ContextMenuRootChangeEventDetails = BaseUIChangeEventDetails<ContextMenuRootChangeEventReason>;

const ORIGIN_ANCHOR: ContextMenuAnchor = {
  getBoundingClientRect() {
    return DOMRect.fromRect({ width: 0, height: 0, x: 0, y: 0 });
  },
};

/** Groups the parts of a context menu. Doesn't render its own element. */
export function ContextMenuRoot(props: ContextMenuRootProps): JSX.Element {
  const [anchor, setAnchor] = createSignal<ContextMenuAnchor>(ORIGIN_ANCHOR, {
    ownedWrite: true,
  });
  const context: ContextMenuRootContextValue = {
    anchor,
    setAnchor(next) {
      setAnchor(() => next);
    },
    internalBackdropRef: { current: null },
    allowMouseUpTriggerRef: { current: true },
    initialCursorPointRef: { current: null },
    rootId: createUniqueId(),
  };
  return (
    <ContextMenuRootContext value={context}>
      <MenuRootContext value={null}>
        <MenuRoot {...props} />
      </MenuRootContext>
    </ContextMenuRootContext>
  );
}
