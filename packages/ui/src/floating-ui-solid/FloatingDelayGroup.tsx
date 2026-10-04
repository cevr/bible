// Upstream: packages/react/src/floating-ui-react/components/FloatingDelayGroup.tsx
//
// A group of popups (tooltips) that share their delays. Once one opens, the
// group is active: the next one opens at once and closes the previous one,
// and both skip their transitions (the instant phase). The group stays
// active until `timeoutMs` after the last one closed, then the normal open
// delay applies again.
import type { JSX } from '@solidjs/web';
import {
  type Accessor,
  createContext,
  createEffect,
  createSignal,
  onCleanup,
  untrack,
  useContext,
} from 'solid-js';

import {
  type BaseUIChangeEventDetails,
  createChangeEventDetails,
} from '../internals/createBaseUIEventDetails.ts';
import { REASONS } from '../internals/reasons.ts';
import { Timeout, useTimeout } from '../utils/timers.ts';
import type { FloatingRootContext } from './FloatingRootContext.ts';
import { type Delay, getDelay } from './hooks/useHoverShared.ts';

interface GroupMember {
  onOpenChange: (open: boolean, eventDetails: BaseUIChangeEventDetails) => void;
  setIsInstantPhase: (value: boolean) => void;
}

interface FloatingDelayGroupContextValue {
  hasProvider: boolean;
  timeoutMs: () => number;
  delayRef: { current: Delay };
  initialDelayRef: { current: Delay };
  timeout: Timeout;
  currentIdRef: { current: string | null };
  currentContextRef: { current: GroupMember | null };
}

const FloatingDelayGroupContext = createContext<FloatingDelayGroupContextValue>({
  hasProvider: false,
  timeoutMs: () => 0,
  delayRef: { current: 0 },
  initialDelayRef: { current: 0 },
  timeout: new Timeout(),
  currentIdRef: { current: null },
  currentContextRef: { current: null },
});

export interface FloatingDelayGroupProps {
  children?: JSX.Element;
  /** The group's delay while it is not in the instant phase. */
  delay: Delay;
  /** How long the group stays active after the last popup closed, in ms. @default 0 */
  timeoutMs?: number | undefined;
}

export function FloatingDelayGroup(props: FloatingDelayGroupProps): JSX.Element {
  const initialDelay = untrack(() => props.delay);
  const delayRef = { current: initialDelay };
  const initialDelayRef = { current: initialDelay };
  const currentIdRef: { current: string | null } = { current: null };
  const currentContextRef: { current: GroupMember | null } = { current: null };
  const timeout = useTimeout();

  createEffect(
    () => props.delay,
    (delay) => {
      initialDelayRef.current = delay;
      if (!currentIdRef.current) {
        delayRef.current = delay;
        return;
      }
      delayRef.current = {
        open: getDelay(delayRef.current, 'open'),
        close: getDelay(delay, 'close'),
      };
    },
  );

  const value: FloatingDelayGroupContextValue = {
    hasProvider: true,
    timeoutMs: () => props.timeoutMs ?? 0,
    delayRef,
    initialDelayRef,
    timeout,
    currentIdRef,
    currentContextRef,
  };
  return <FloatingDelayGroupContext value={value}>{props.children}</FloatingDelayGroupContext>;
}

export interface UseDelayGroupOptions {
  /** Whether this popup is open. */
  open: Accessor<boolean>;
  /** This popup's id in the group; its floating id when not given. */
  id?: string | undefined;
}

export interface UseDelayGroupReturn {
  /** The id of the popup keeping the group active. */
  activeIdRef: { current: string | null };
  delayRef: { current: Delay };
  /** Whether transitions are skipped, as the group hands over from one popup to the next. */
  isInstantPhase: Accessor<boolean>;
  hasProvider: boolean;
}

/** Joins the enclosing `FloatingDelayGroup`, if any. */
export function useDelayGroup(
  context: FloatingRootContext,
  options: UseDelayGroupOptions,
): UseDelayGroupReturn {
  const group = useContext(FloatingDelayGroupContext);
  const { currentIdRef, delayRef, initialDelayRef, currentContextRef, timeout } = group;
  const floatingId = options.id ?? untrack(context.floatingId) ?? '';
  const [isInstantPhase, setIsInstantPhase] = createSignal(false, { ownedWrite: true });
  let isOpen = untrack(options.open);

  const unset = () => {
    currentContextRef.current?.setIsInstantPhase(false);
    currentIdRef.current = null;
    currentContextRef.current = null;
    delayRef.current = initialDelayRef.current;
    timeout.clear();
  };

  createEffect(options.open, (open) => {
    isOpen = open;
    if (open) {
      const prevContext = currentContextRef.current;
      const prevId = currentIdRef.current;
      // A popup opening cancels the pending reset of the group.
      timeout.clear();
      currentContextRef.current = {
        onOpenChange: (next, details) => context.setOpen(next, details),
        setIsInstantPhase: (value) => setIsInstantPhase(value),
      };
      currentIdRef.current = floatingId;
      delayRef.current = { open: 0, close: getDelay(initialDelayRef.current, 'close') };
      if (prevId !== null && prevId !== floatingId) {
        setIsInstantPhase(true);
        prevContext?.setIsInstantPhase(true);
        prevContext?.onOpenChange(false, createChangeEventDetails(REASONS.none));
      } else {
        setIsInstantPhase(false);
        prevContext?.setIsInstantPhase(false);
      }
      return undefined;
    }

    if (!currentIdRef.current || currentIdRef.current !== floatingId) {
      return undefined;
    }
    setIsInstantPhase(false);
    const timeoutMs = untrack(group.timeoutMs);
    if (timeoutMs) {
      const closingId = floatingId;
      timeout.start(timeoutMs, () => {
        // Another popup took the group over meanwhile.
        if (untrack(context.open) || (currentIdRef.current && currentIdRef.current !== closingId)) {
          return;
        }
        unset();
      });
      return () => {
        if (isOpen || currentIdRef.current !== closingId) {
          timeout.clear();
        }
      };
    }
    unset();
    return undefined;
  });

  onCleanup(() => {
    if (currentIdRef.current !== floatingId) {
      return;
    }
    currentContextRef.current = null;
    if (!isOpen) {
      return;
    }
    currentIdRef.current = null;
    delayRef.current = initialDelayRef.current;
    timeout.clear();
  });

  return {
    activeIdRef: currentIdRef,
    delayRef,
    isInstantPhase,
    hasProvider: group.hasProvider,
  };
}
