import { createContext, createSignal, useContext, type Accessor, type ParentProps } from 'solid-js';

/**
 * Overlay types that can be displayed.
 * Using a discriminated union ensures only one overlay can be active at a time.
 */
export type OverlayType =
  | 'command-palette'
  | 'tools-palette'
  | 'theme-picker'
  | 'cross-refs'
  | 'strongs'
  | 'concordance'
  | 'egw-command-palette'
  | 'egw-bible-refs';

/**
 * Overlay state using discriminated union.
 * Eliminates impossible states like having multiple overlays open simultaneously.
 */
export type OverlayState = { _tag: 'none' } | { _tag: 'open'; type: OverlayType };

export const OverlayState = {
  none: (): OverlayState => ({ _tag: 'none' }),
  open: (type: OverlayType): OverlayState => ({ _tag: 'open', type }),
} as const;

interface OverlayContextValue {
  /** Current overlay state */
  state: Accessor<OverlayState>;

  /** Check if any overlay is open */
  isOpen: Accessor<boolean>;

  /** Check if a specific overlay is open */
  isOverlayOpen: (type: OverlayType) => boolean;

  /** Open an overlay (closes any currently open overlay) */
  open: (type: OverlayType) => void;

  /** Close the current overlay */
  close: () => void;

  /** Toggle an overlay (open if closed, close if open) */
  toggle: (type: OverlayType) => void;
}

const OverlayContext = createContext<OverlayContextValue>();

export function OverlayProvider(props: ParentProps) {
  const [state, setState] = createSignal<OverlayState>(OverlayState.none());

  const isOpen = () => state()._tag === 'open';

  const isOverlayOpen = (type: OverlayType) => {
    const current = state();
    return current._tag === 'open' && current.type === type;
  };

  const open = (type: OverlayType) => {
    setState(OverlayState.open(type));
  };

  const close = () => {
    setState(OverlayState.none());
  };

  const toggle = (type: OverlayType) => {
    if (isOverlayOpen(type)) {
      close();
    } else {
      open(type);
    }
  };

  const value: OverlayContextValue = {
    state,
    isOpen,
    isOverlayOpen,
    open,
    close,
    toggle,
  };

  return <OverlayContext.Provider value={value}>{props.children}</OverlayContext.Provider>;
}

export function useOverlay(): OverlayContextValue {
  const ctx = useContext(OverlayContext);
  if (!ctx) {
    throw new Error('useOverlay must be used within an OverlayProvider');
  }
  return ctx;
}
