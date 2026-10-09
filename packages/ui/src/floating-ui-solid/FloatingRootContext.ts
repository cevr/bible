// Upstream: packages/react/src/floating-ui-react/components/FloatingRootStore.ts,
// packages/react/src/floating-ui-react/hooks/useFloatingRootContext.ts,
// packages/react/src/floating-ui-react/hooks/useSyncedFloatingRootContext.ts,
// packages/react/src/floating-ui-react/types.ts
//
// What the interactions (dismiss, list navigation, focus management)
// read of one popup: whether it is open, its trigger and popup elements,
// and how to ask it to open or close. Upstream keeps a second store synced
// from the popup's; here the context reads the popup's own signals, so
// there is nothing to sync (decided by derive-dont-sync).
import type { VirtualElement } from '@floating-ui/dom';
import { isElement } from '@floating-ui/utils/dom';
import { type Accessor, createSignal, untrack } from 'solid-js';

import type { BaseUIChangeEventDetails } from '../internals/createBaseUIEventDetails.ts';
import type { FloatingUIOpenChangeDetails } from '../internals/types.ts';
import { PopupTriggerMap } from '../utils/popups/popupTriggerMap.ts';
import { createEventEmitter, type FloatingEvents, isClickLikeEvent } from './utils/event.ts';

export type ReferenceType = Element | VirtualElement;

interface ContextData {
  /** The event that opened the popup, kept while it is open. */
  openEvent?: Event | undefined;
}

export interface FloatingRootContext {
  open: Accessor<boolean>;
  /** The trigger element (the active one when there are several). */
  domReferenceElement: Accessor<Element | null>;
  /** What the popup is positioned against: the position reference if set, else the trigger. */
  referenceElement: Accessor<ReferenceType | null>;
  floatingElement: Accessor<HTMLElement | null>;
  /** Sets the anchor the popup is positioned against, apart from its trigger. */
  setPositionReference(node: ReferenceType | null): void;
  /** Asks the popup to open or close; the part decides (a change callback may cancel). */
  setOpen(open: boolean, eventDetails: BaseUIChangeEventDetails): void;
  /** Tells the interactions an open change happened (the part calls it once it applies one). */
  dispatchOpenChange(open: boolean, eventDetails: BaseUIChangeEventDetails): void;
  readonly dataRef: { current: ContextData };
  readonly events: FloatingEvents;
  readonly triggerElements: PopupTriggerMap;
}

interface FloatingRootContextOptions {
  open: Accessor<boolean>;
  /** The trigger, or a virtual element (a context menu's pointer position). */
  referenceElement: Accessor<ReferenceType | null>;
  floatingElement: Accessor<HTMLElement | null>;
  onOpenChange(open: boolean, eventDetails: BaseUIChangeEventDetails): void;
  triggerElements?: PopupTriggerMap | undefined;
}

export function createFloatingRootContext(
  options: FloatingRootContextOptions,
): FloatingRootContext {
  const [positionReference, setPositionReference] = createSignal<ReferenceType | null>(null, {
    ownedWrite: true,
  });
  const dataRef: { current: ContextData } = { current: {} };
  const events = createEventEmitter();

  const context: FloatingRootContext = {
    open: options.open,
    domReferenceElement: () => {
      const reference = options.referenceElement();
      return isElement(reference) ? reference : null;
    },
    referenceElement: () => positionReference() ?? options.referenceElement(),
    floatingElement: options.floatingElement,
    setPositionReference(node) {
      setPositionReference(() => node);
    },
    setOpen(open, eventDetails) {
      options.onOpenChange(open, eventDetails);
    },
    dispatchOpenChange(open, eventDetails) {
      const event = eventDetails.event;
      if (!open || !untrack(options.open) || (event != null && isClickLikeEvent(event))) {
        dataRef.current.openEvent = open ? event : undefined;
      }
      const details: FloatingUIOpenChangeDetails = {
        open,
        reason: eventDetails.reason,
        nativeEvent: event,
        triggerElement: eventDetails.trigger,
      };
      events.emit('openchange', details);
    },
    dataRef,
    events,
    triggerElements: options.triggerElements ?? new PopupTriggerMap(),
  };
  return context;
}
