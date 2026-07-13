/**
 * DB Provider — Top-level provider that initializes SQLite and the Effect runtime.
 *
 * Blocks rendering until wa-sqlite databases are ready.
 * Creates ManagedRuntime with all Effect services after init.
 * Provides the feature-oriented CachedApp interface to presentation code.
 */
import { useState, useEffect, useRef, type ReactNode } from 'react';
import { ManagedRuntime, type Layer } from 'effect';
import { getDbClient } from '@/workers/db-client';
import { LoadingScreen } from '@/components/shared/loading-screen';
import { makeAppClient, type AppRuntime, type AppServices } from '@/data/app-client';
import { AppLive } from '@/data/layer';
import { type CachedAppCore, createCachedApp } from '@/lib/cached-app';
import { CachedAppContext } from '@/providers/db-context';

const log = import.meta.env['DEV'] ? (...args: unknown[]) => console.log(...args) : () => {};

export function DbProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [stage, setStage] = useState('Initializing...');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const runtimeRef = useRef<AppRuntime | null>(null);
  const cachedAppRef = useRef<CachedAppCore | null>(null);

  useEffect(() => {
    let disposed = false;
    const client = getDbClient();
    client.onProgress((s, p) => {
      if (!disposed) {
        setStage(s);
        setProgress(p);
      }
    });

    client
      .init()
      .then(() => {
        if (disposed) return;
        log('[db-provider] db ready, creating runtime');
        const runtime = ManagedRuntime.make(AppLive as Layer.Layer<AppServices>);
        runtimeRef.current = runtime;
        const appClient = makeAppClient(runtime);
        const cachedApp = createCachedApp(appClient);
        cachedAppRef.current = cachedApp;

        // Warm caches for data that's needed on first render
        cachedApp.preload('state.getPosition');
        cachedApp.preload('state.getPreferences');
        cachedApp.preload('state.getBookmarks');
        cachedApp.preload('state.getHistory');

        setReady(true);
        log('[db-provider] ready');
      })
      .catch((err) => {
        if (disposed) return;
        console.error('[db-provider] FAILED', err);
        setError(err instanceof Error ? err.message : String(err));
      });

    return () => {
      disposed = true;
      runtimeRef.current?.dispose().catch((err) => {
        console.warn('[db-provider] runtime dispose error:', err);
      });
    };
  }, []);

  if (!ready) {
    return (
      <LoadingScreen
        stage={stage}
        progress={progress}
        error={error}
        onRetry={() => window.location.reload()}
      />
    );
  }

  return (
    <CachedAppContext.Provider value={cachedAppRef.current}>{children}</CachedAppContext.Provider>
  );
}
