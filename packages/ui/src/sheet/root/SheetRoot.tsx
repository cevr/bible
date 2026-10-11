// Upstream: react-aria-components 1.22.1, packages/react-aria-components/src/Sheet.tsx
// (SheetOverlay's props and dismissal). Copyright 2026 Adobe, Apache-2.0
// (`../LICENSE`); ported to Solid 2 over this package's dialog (Base UI's), in
// place of React Aria's Modal and Dialog.
//
// Groups a sheet's parts. A sheet is a dialog underneath (the same root and
// store): Escape and an outside press close it, a modal one traps focus,
// hides the rest of the page from assistive technology and locks the page's
// scroll. Its owner opens it through `open` (upstream's `SheetTrigger` is
// left out: no page has one). `preventDismissal` keeps it open against
// Escape, an outside press and a swipe (the sheet cannot be scrolled out);
// its own Close and its owner still close it.
import type { JSX } from '@solidjs/web';
import { createMemo } from 'solid-js';

import { type DialogChangeEventDetails, DialogRoot } from '../../dialog/root/DialogRoot.tsx';
import { REASONS } from '../../internals/reasons.ts';
import {
  defaultSwipeDirection,
  getSwipeConfig,
  type SheetPosition,
  type SheetSwipeDirection,
  type SnapPoint,
} from '../utils/swipe.ts';
import { SheetRootContext } from './SheetRootContext.ts';

type SheetChangeEventDetails = DialogChangeEventDetails;

interface SheetRootProps {
  open?: boolean | undefined;
  onOpenChange?: ((open: boolean, eventDetails: SheetChangeEventDetails) => void) | undefined;
  /** Called after the sheet has scrolled in, and after it has scrolled out and unmounted. */
  onOpenChangeComplete?: ((open: boolean) => void) | undefined;
  /**
   * Whether the open sheet is modal: focus trapped, page scroll locked, the
   * rest of the page hidden from assistive technology and out of reach of the
   * pointer. Otherwise the page around it stays live. Upstream's sheet is
   * always modal. @default true
   */
  modal?: boolean | undefined;
  /** Whether an outside press leaves the sheet open. @default false */
  disablePointerDismissal?: boolean | undefined;
  /**
   * Whether the user cannot dismiss the sheet: no Escape, no outside press,
   * and it cannot be swiped past its first snap point. @default false
   */
  preventDismissal?: boolean | undefined;
  /** The edge the sheet rests on. @default 'bottom' */
  position?: SheetPosition | undefined;
  /** The direction a swipe dismisses it in. @default the position's (`vertical` for `center`) */
  swipeDirection?: SheetSwipeDirection | undefined;
  /**
   * Where the sheet stops partly open, as the amount of it showing: pixels
   * (a number) or a CSS length (a percentage is of the sheet's size). It
   * opens at the first.
   */
  snapPoints?: ReadonlyArray<SnapPoint> | undefined;
  children?: JSX.Element;
}

// The reasons a sheet the user may not dismiss turns down.
const DISMISSALS: ReadonlySet<string> = new Set([
  REASONS.escapeKey,
  REASONS.outsidePress,
  REASONS.focusOut,
  REASONS.closeWatcher,
]);

/**
 * Groups all parts of the sheet.
 * Doesn't render its own HTML element.
 */
export function SheetRoot(props: SheetRootProps): JSX.Element {
  const position = () => props.position ?? 'bottom';
  const swipeDirection = () => props.swipeDirection ?? defaultSwipeDirection(position());
  const context: SheetRootContext = {
    position,
    swipeDirection,
    config: createMemo(() => getSwipeConfig(swipeDirection())),
    snapPoints: () => props.snapPoints,
    preventDismissal: () => props.preventDismissal ?? false,
  };
  return (
    <DialogRoot
      open={props.open}
      modal={props.modal}
      disablePointerDismissal={props.disablePointerDismissal}
      onOpenChange={(open, details) => {
        if (!open && context.preventDismissal() && DISMISSALS.has(details.reason)) {
          details.cancel();
          return;
        }
        props.onOpenChange?.(open, details);
      }}
      onOpenChangeComplete={props.onOpenChangeComplete}
    >
      <SheetRootContext value={context}>{props.children}</SheetRootContext>
    </DialogRoot>
  );
}
