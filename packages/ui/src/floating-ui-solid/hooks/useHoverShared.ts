// Upstream: packages/react/src/floating-ui-react/hooks/useHoverShared.ts,
// packages/react/src/floating-ui-react/hooks/useHoverInteractionSharedState.ts
//
// State the trigger-side and popup-side hover interactions share for one
// popup: the last pointer type, the pending open/close and rest timers, the
// safe-polygon mousemove handler, and the pointer-events shield that keeps
// sibling items from stealing hover while the pointer crosses to a submenu.
import { onCleanup } from 'solid-js';

import { Timeout } from '../../utils/timers.ts';
import type { ContextData, FloatingRootContext } from '../FloatingRootContext.ts';
import type { HandleCloseOptions } from '../safePolygon.ts';
import { isMouseLikePointerType } from '../utils/event.ts';

export type {
  HandleClose,
  HandleCloseContext,
  HandleCloseOptions,
  SafePolygonOptions,
} from '../safePolygon.ts';
export { isTargetInsideEnabledTrigger as isInsideEnabledTrigger } from '../utils/element.ts';

export type Delay = number | Partial<{ open: number; close: number }>;

function resolveValue<T>(
  value: T | (() => T) | undefined,
  pointerType?: string,
): T | 0 | undefined {
  if (pointerType != null && !isMouseLikePointerType(pointerType)) {
    return 0;
  }
  if (typeof value === 'function') {
    return (value as () => T)();
  }
  return value;
}

/** The open or close delay; touch and pen hover never wait. */
export function getDelay(
  value: Delay | (() => Delay) | undefined,
  prop: 'open' | 'close',
  pointerType?: string,
): number | undefined {
  const result = resolveValue(value, pointerType);
  if (typeof result === 'number') {
    return result;
  }
  return result?.[prop];
}

export function getRestMs(value: number | (() => number)): number {
  return typeof value === 'function' ? value() : value;
}

export function isClickLikeOpenEvent(openEventType: string | undefined, interactedInside: boolean) {
  return interactedInside || openEventType === 'click' || openEventType === 'mousedown';
}

export function isHoverOpenEvent(openEventType: string | undefined) {
  return Boolean(openEventType?.includes('mouse') && openEventType !== 'mousedown');
}

export class HoverInteraction {
  pointerType: string | undefined = undefined;
  interactedInside = false;
  handler: ((event: MouseEvent) => void) | undefined = undefined;
  blockMouseMove = true;
  performedPointerEventsMutation = false;
  pointerEventsScopeElement: HTMLElement | SVGSVGElement | null = null;
  pointerEventsReferenceElement: HTMLElement | SVGSVGElement | null = null;
  pointerEventsFloatingElement: HTMLElement | null = null;
  restTimeoutPending = false;
  openChangeTimeout: Timeout = new Timeout();
  restTimeout: Timeout = new Timeout();
  handleCloseOptions: HandleCloseOptions | undefined = undefined;

  dispose = () => {
    this.openChangeTimeout.clear();
    this.restTimeout.clear();
  };
}

type PointerEventsMutationState = Pick<
  HoverInteraction,
  | 'performedPointerEventsMutation'
  | 'pointerEventsScopeElement'
  | 'pointerEventsReferenceElement'
  | 'pointerEventsFloatingElement'
>;

const pointerEventsMutationOwnerByScopeElement = new WeakMap<
  HTMLElement | SVGSVGElement,
  PointerEventsMutationState
>();

export function clearSafePolygonPointerEventsMutation(instance: PointerEventsMutationState) {
  if (!instance.performedPointerEventsMutation) {
    return;
  }
  const scopeElement = instance.pointerEventsScopeElement;
  if (scopeElement && pointerEventsMutationOwnerByScopeElement.get(scopeElement) === instance) {
    instance.pointerEventsScopeElement?.style.removeProperty('pointer-events');
    instance.pointerEventsReferenceElement?.style.removeProperty('pointer-events');
    instance.pointerEventsFloatingElement?.style.removeProperty('pointer-events');
    pointerEventsMutationOwnerByScopeElement.delete(scopeElement);
  }
  instance.performedPointerEventsMutation = false;
  instance.pointerEventsScopeElement = null;
  instance.pointerEventsReferenceElement = null;
  instance.pointerEventsFloatingElement = null;
}

/** Makes everything in `scopeElement` but the trigger and popup ignore the pointer. */
export function applySafePolygonPointerEventsMutation(
  instance: PointerEventsMutationState,
  options: {
    scopeElement: HTMLElement | SVGSVGElement;
    referenceElement: HTMLElement | SVGSVGElement;
    floatingElement: HTMLElement;
  },
) {
  const { scopeElement, referenceElement, floatingElement } = options;
  const existingOwner = pointerEventsMutationOwnerByScopeElement.get(scopeElement);
  if (existingOwner && existingOwner !== instance) {
    clearSafePolygonPointerEventsMutation(existingOwner);
  }
  clearSafePolygonPointerEventsMutation(instance);
  instance.performedPointerEventsMutation = true;
  instance.pointerEventsScopeElement = scopeElement;
  instance.pointerEventsReferenceElement = referenceElement;
  instance.pointerEventsFloatingElement = floatingElement;
  pointerEventsMutationOwnerByScopeElement.set(scopeElement, instance);
  scopeElement.style.pointerEvents = 'none';
  referenceElement.style.pointerEvents = 'auto';
  floatingElement.style.pointerEvents = 'auto';
}

type HoverContextData = ContextData & { hoverInteractionState?: HoverInteraction | undefined };

/** The one hover state of a popup, made by whichever side asks first. */
export function useHoverInteractionSharedState(context: FloatingRootContext): HoverInteraction {
  const data = context.dataRef.current as HoverContextData;
  if (!data.hoverInteractionState) {
    data.hoverInteractionState = new HoverInteraction();
  }
  const instance = data.hoverInteractionState;
  onCleanup(instance.dispose);
  return instance;
}
