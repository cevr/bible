// Upstream: react-aria-components 1.22.1, packages/react-aria-components/src/Sheet.tsx
// (SheetBackdrop). Copyright 2026 Adobe, Apache-2.0 (`../LICENSE`); ported to Solid 2
// over this package's dialog backdrop (Base UI's), so a press on it is the
// sheet's outside press.
//
// The layer behind the sheet, filling its overlay. `swipeAnimation` names
// `@keyframes` (from exited to entered, a fade say) it runs along the swipe.
import type { JSX } from '@solidjs/web';
import { omit, onCleanup } from 'solid-js';

import { useDialogRootContext } from '../../dialog/root/DialogRootContext.ts';
import type { BaseUIComponentProps } from '../../internals/types.ts';
import { useRenderElement } from '../../internals/useRenderElement.tsx';
import { useSheetOverlayContext } from '../overlay/SheetOverlay.tsx';
import { useSheetRootContext } from '../root/SheetRootContext.ts';
import { type SheetState, sheetStateAttributesMapping } from '../utils/sheetAttributes.ts';
import { type SwipeAnimationRange, swipeAnimationStyle } from '../utils/swipe.ts';

interface SheetBackdropProps extends BaseUIComponentProps<'div', SheetState> {
  /** The `@keyframes` the backdrop runs while the sheet is swiped, authored from exited to entered. */
  swipeAnimation?: string | undefined;
  /** The snap point indices the swipe animation runs between; the whole travel without. */
  swipeAnimationRange?: SwipeAnimationRange | undefined;
}

/**
 * An overlay displayed beneath the sheet.
 * Renders a `<div>` element.
 */
export function SheetBackdrop(componentProps: SheetBackdropProps): JSX.Element {
  const { store } = useDialogRootContext();
  const root = useSheetRootContext();
  const sheet = useSheetOverlayContext();
  const elementProps = omit(
    componentProps,
    'class',
    'style',
    'render',
    'swipeAnimation',
    'swipeAnimationRange',
  );

  onCleanup(() => {
    store.backdropRef.current = null;
  });

  return useRenderElement('div', componentProps, {
    state: sheet.state,
    ref: (el: HTMLElement) => {
      store.backdropRef.current = el;
    },
    stateAttributesMapping: sheetStateAttributesMapping,
    props: [
      {
        role: 'presentation',
        get style() {
          return {
            position: 'absolute',
            inset: '0',
            'user-select': 'none',
            '-webkit-user-select': 'none',
            ...swipeAnimationStyle({
              name: componentProps.swipeAnimation,
              range: componentProps.swipeAnimationRange,
              snapPoints: root.snapPoints(),
              swipeDirection: root.swipeDirection(),
              index: sheet.index(),
              entering: sheet.state.entering,
              exiting: sheet.state.exiting,
            }),
          } satisfies JSX.CSSProperties;
        },
      },
      elementProps,
    ],
  });
}
