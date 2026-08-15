import { ReadingApplication, SharedRoutes } from '@bible/app/application';
import { failureMessage } from '@bible/core/observability';
import { Router } from '@solidjs/router';
import { render, Show } from '@solidjs/web';
import { Effect } from 'effect';
import { createSignal, onSettled } from 'solid-js';

import { getDatabaseWorker } from './workers/database-worker.js';
import { webCapabilities } from './platform-capabilities.js';
import type { ActiveProcedureHost } from '@bible/app/procedure';

import { startWebProcedureHost } from './workers/procedure-client.js';
import '@bible/app/styles.css';

const STARTUP_FALLBACK = 'An unknown startup error prevented the library from opening.';

const WebApplication = () => {
  const [host, setHost] = createSignal<ActiveProcedureHost>();
  const [failure, setFailure] = createSignal<unknown>();

  onSettled(() => {
    let disposed = false;
    let activeHost: ActiveProcedureHost | undefined;
    const starting = startWebProcedureHost(getDatabaseWorker());

    void starting.then(
      (started) => {
        activeHost = started;
        if (disposed) {
          void started.dispose();
          return;
        }
        setHost(started);
      },
      (cause: unknown) => {
        if (!disposed) setFailure(() => cause);
      },
    );

    return () => {
      disposed = true;
      if (activeHost !== undefined) void activeHost.dispose();
    };
  });

  return (
    <Show
      when={host()}
      fallback={
        <main class="bible-bootstrap" aria-live="polite">
          <Show when={failure()} fallback={<p role="status">Preparing your library…</p>}>
            {(cause) => (
              <div role="alert">
                <strong>The library could not be opened.</strong>
                <p>{failureMessage(cause(), STARTUP_FALLBACK)}</p>
              </div>
            )}
          </Show>
        </main>
      }
    >
      {(current) => (
        <Router
          root={(props) => (
            <ReadingApplication procedures={current().procedures} capabilities={webCapabilities}>
              {props.children}
            </ReadingApplication>
          )}
        >
          <SharedRoutes />
        </Router>
      )}
    </Show>
  );
};

const root = (() => {
  const element = document.getElementById('root');
  if (element === null) return Effect.runSync(Effect.die('#root not found'));
  return element;
})();
render(() => <WebApplication />, root);
