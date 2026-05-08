/**
 * Stable context object and hooks for the keyboard provider.
 *
 * Separated from keyboard-provider.tsx so that hook consumers don't cause
 * HMR invalidation of the component (or vice versa).
 */
import { createContext, useContext, useRef, useEffect } from 'react';

export type KeyboardAction =
  | 'nextVerse'
  | 'prevVerse'
  | 'nextChapter'
  | 'prevChapter'
  | 'openCommandPalette'
  | 'openSearch'
  | 'openGotoDialog'
  | 'openCrossRefs'
  | 'openConcordance'
  | 'toggleDisplayMode'
  | 'openBookmarks'
  | 'closeOverlay';

export type KeyboardHandler = (action: KeyboardAction, event: KeyboardEvent) => void;

export interface KeyboardContextValue {
  registerHandler: (handler: KeyboardHandler) => () => void;
  enabled: boolean;
  setEnabled: (enabled: boolean) => void;
}

export const KeyboardContext = createContext<KeyboardContextValue | null>(null);

export function useKeyboard(): KeyboardContextValue {
  const ctx = useContext(KeyboardContext);
  if (!ctx) throw new Error('useKeyboard must be used within a KeyboardProvider');
  return ctx;
}

export function useKeyboardAction(
  handler: (action: KeyboardAction, event: KeyboardEvent) => void,
): void {
  const { registerHandler } = useKeyboard();
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(
    () => registerHandler((action, event) => handlerRef.current(action, event)),
    [registerHandler],
  );
}
