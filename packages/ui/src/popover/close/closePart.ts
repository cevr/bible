// Upstream: packages/react/src/utils/closePart.ts
//
// How a popup knows a close button is rendered inside it: each close part
// registers with the popup while mounted. A modal popup traps focus only
// when one is there, so touch screen reader users can always get out.
import { type Accessor, createContext, createSignal, onCleanup, useContext } from 'solid-js';

interface ClosePartContextValue {
  register: () => () => void;
}

export const ClosePartContext = createContext<ClosePartContextValue | null>(null);

export function useClosePartCount(): {
  context: ClosePartContextValue;
  hasClosePart: Accessor<boolean>;
} {
  const [count, setCount] = createSignal(0, { ownedWrite: true });
  const context: ClosePartContextValue = {
    register() {
      setCount((value) => value + 1);
      return () => setCount((value) => Math.max(0, value - 1));
    },
  };
  return { context, hasClosePart: () => count() > 0 };
}

/** Registers the current close part with the enclosing popup, if any. */
export function useClosePartRegistration(): void {
  const context = useContext(ClosePartContext);
  if (context) {
    onCleanup(context.register());
  }
}
