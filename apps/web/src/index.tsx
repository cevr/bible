import { ReadingApplication, SharedRoutes } from '@bible/app/application';
import { Router } from '@solidjs/router';
import { render, Show } from '@solidjs/web';
import { createSignal, onSettled } from 'solid-js';

import { getDatabaseWorker } from './workers/database-worker.js';
import { webCapabilities } from './platform-capabilities.js';
import { startWebProcedureHost, type ActiveWebProcedureHost } from './workers/procedure-client.js';
import '@bible/app/styles.css';

const failureMessage = (cause: unknown): string =>
  cause instanceof Error
    ? cause.message
    : 'An unknown startup error prevented the library from opening.';

const WebApplication = () => {
  const [host, setHost] = createSignal<ActiveWebProcedureHost>();
  const [failure, setFailure] = createSignal<unknown>();

  onSettled(() => {
    let disposed = false;
    let activeHost: ActiveWebProcedureHost | undefined;
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
                <p>{failureMessage(cause())}</p>
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

const root = document.getElementById('root');
if (root === null) throw new Error('#root not found');
render(() => <WebApplication />, root);
