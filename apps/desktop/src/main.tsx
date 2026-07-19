import { ReadingApplication, SharedRoutes } from '@bible/app/application';
import { HashRouter } from '@solidjs/router';
import { render, Show } from '@solidjs/web';
import { createSignal, onSettled } from 'solid-js';

import { startDesktopProcedureHost, type ActiveDesktopProcedureHost } from './procedure-client.js';
import { desktopCapabilities } from './platform-capabilities.js';
import '@bible/app/styles.css';

const failureMessage = (cause: unknown): string =>
  cause instanceof Error
    ? cause.message
    : 'An unknown startup error prevented the library from opening.';

const DesktopApplication = () => {
  const [host, setHost] = createSignal<ActiveDesktopProcedureHost>();
  const [failure, setFailure] = createSignal<unknown>();

  onSettled(() => {
    let disposed = false;
    let activeHost: ActiveDesktopProcedureHost | undefined;
    const starting = startDesktopProcedureHost();

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
        <HashRouter
          root={(props) => (
            <ReadingApplication
              procedures={current().procedures}
              capabilities={desktopCapabilities}
            >
              {props.children}
            </ReadingApplication>
          )}
        >
          <SharedRoutes />
        </HashRouter>
      )}
    </Show>
  );
};

const root = document.getElementById('root');
if (root === null) throw new Error('#root not found');
render(() => <DesktopApplication />, root);
