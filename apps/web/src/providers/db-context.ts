/**
 * Stable context objects and hooks for the DB provider.
 *
 * Separated from db-provider.tsx so that HMR reloads of the component
 * don't re-execute createContext (which would produce new objects and
 * break the old component tree's references).
 */
import { createContext, useContext, useRef, useMemo, useSyncExternalStore } from 'react';
import type { CachedApp, CachedAppCore } from '@/lib/cached-app';

export const CachedAppContext = createContext<CachedAppCore | null>(null);

/**
 * Hook that returns a CachedApp proxy.
 *
 * Read methods suspend (return T, not Promise<T>).
 * Write methods return Promise as-is.
 * Only re-renders when a cache that was accessed during render is invalidated.
 */
export function useApp(): CachedApp {
  const core = useContext(CachedAppContext);
  if (!core) throw new Error('useApp must be used within a DbProvider');

  const accessedRef = useRef(new Set<string>());
  // Clear accessed set each render so we only track current render's reads
  accessedRef.current.clear();

  useSyncExternalStore(
    core.subscribe,
    () => core.snapshotFor(accessedRef.current),
    () => core.snapshotFor(accessedRef.current),
  );

  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => core.withTracking(accessedRef.current), [core]);
}
