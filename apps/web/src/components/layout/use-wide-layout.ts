/**
 * Wide layout context — lets child routes widen the shell (e.g. split pane).
 *
 * Separated from app-shell.tsx so that hook consumers don't cause
 * HMR invalidation of the component (or vice versa).
 */
import { createContext, useContext, useEffect } from 'react';

export const WideLayoutContext = createContext<(wide: boolean) => void>(() => {});

/** Call from a route to toggle the shell to wide mode. */
export function useSetWideLayout(wide: boolean) {
  const setWide = useContext(WideLayoutContext);
  useEffect(() => {
    setWide(wide);
    return () => setWide(false);
  }, [wide, setWide]);
}
