import { useState, useEffect, useRef, type ReactNode } from 'react';
import {
  KeyboardContext,
  type KeyboardAction,
  type KeyboardHandler,
} from '@/providers/keyboard-context';

function parseKeyboardEvent(event: KeyboardEvent): KeyboardAction | null {
  const { key, metaKey, ctrlKey, shiftKey } = event;
  const mod = metaKey || ctrlKey;

  const target = event.target as HTMLElement;
  if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
    if (key === 'Escape') return 'closeOverlay';
    return null;
  }

  if (mod && key === 'k') return 'openCommandPalette';
  if (mod && key === 'f') return 'openSearch';
  if (key === '/' && !mod && !shiftKey) return 'openSearch';
  if (mod && key === 'g' && !shiftKey) return 'openGotoDialog';
  if (mod && key === 'i') return 'openCrossRefs';
  if (mod && shiftKey && key === 's') return 'openConcordance';
  if (mod && key === 'd') return 'toggleDisplayMode';
  if (mod && key === 'b') return 'openBookmarks';

  if (!mod && !shiftKey) {
    switch (key) {
      case 'ArrowDown':
        return 'nextVerse';
      case 'ArrowUp':
        return 'prevVerse';
      case 'ArrowRight':
        return 'nextChapter';
      case 'ArrowLeft':
        return 'prevChapter';
      case 'Enter':
        return 'openCrossRefs';
      case 'Escape':
        return 'closeOverlay';
    }
  }

  return null;
}

export function KeyboardProvider({ children }: { children: ReactNode }) {
  const [enabled, setEnabled] = useState(true);
  const handlersRef = useRef(new Set<KeyboardHandler>());
  const enabledRef = useRef(true);
  enabledRef.current = enabled;

  const registerHandler = (handler: KeyboardHandler) => {
    handlersRef.current.add(handler);
    return () => {
      handlersRef.current.delete(handler);
    };
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!enabledRef.current) return;
      const action = parseKeyboardEvent(event);
      if (!action) return;
      event.preventDefault();
      handlersRef.current.forEach((handler) => handler(action, event));
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <KeyboardContext.Provider value={{ registerHandler, enabled, setEnabled }}>
      {children}
    </KeyboardContext.Provider>
  );
}
