import { createContext, createSignal, useContext, type ParentProps } from 'solid-js';

import { useBibleState } from './bible.js';

export type DisplayMode = 'verse' | 'paragraph';

interface DisplayContextValue {
  mode: () => DisplayMode;
  setMode: (mode: DisplayMode) => void;
  toggleMode: () => void;
}

const DisplayContext = createContext<DisplayContextValue>();

interface DisplayProviderProps {
  initialMode?: DisplayMode;
}

export function DisplayProvider(props: ParentProps<DisplayProviderProps>) {
  const state = useBibleState();
  const prefs = state.getPreferences();
  const [mode, setModeState] = createSignal<DisplayMode>(props.initialMode ?? prefs.displayMode);

  const setMode = (newMode: DisplayMode) => {
    setModeState(newMode);
    state.setPreferences({ displayMode: newMode });
  };

  const toggleMode = () => {
    setMode(mode() === 'verse' ? 'paragraph' : 'verse');
  };

  const value: DisplayContextValue = {
    mode,
    setMode,
    toggleMode,
  };

  return <DisplayContext.Provider value={value}>{props.children}</DisplayContext.Provider>;
}

export function useDisplay(): DisplayContextValue {
  const ctx = useContext(DisplayContext);
  if (!ctx) {
    throw new Error('useDisplay must be used within a DisplayProvider');
  }
  return ctx;
}
