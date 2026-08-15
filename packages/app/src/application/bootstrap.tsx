import { failureMessage } from '@bible/core/observability';
import type { RouterHistory } from '@solidjs/router';
import { createRouter } from '@solidjs/router';
import { Show } from '@solidjs/web';
import { Option } from 'effect';
import { createSignal, onSettled } from 'solid-js';

import type { AppCapabilities } from '../platform/index.js';
import type { ActiveProcedureHost } from '../procedure/index.js';
import { ReadingApplication } from './application.js';
import { sharedRoutes } from './routes.js';

const STARTUP_FALLBACK = 'An unknown startup error prevented the library from opening.';

export interface ApplicationBootstrapProps {
  /** History choice stays with the host: `browserHistory()` (web, also the
   *  default), `hashHistory()` (desktop). */
  readonly history?: RouterHistory;
  /** Starts the host's procedure runtime; owned for the life of the Solid root. */
  readonly start: () => Promise<ActiveProcedureHost>;
  readonly capabilities?: AppCapabilities;
}

/**
 * The shared startup shell: starts the procedure host, disposes it with the
 * Solid root, and renders the preparing/failed/ready states around
 * `ReadingApplication` + `SharedRoutes`. A host supplies only history,
 * transport start, and capabilities.
 */
export const ApplicationBootstrap = (props: ApplicationBootstrapProps) => {
  const AppRouter = createRouter({ routes: sharedRoutes, history: props.history });
  const [host, setHost] = createSignal<ActiveProcedureHost>();
  const [failure, setFailure] = createSignal<unknown>();

  onSettled(() => {
    let disposed = false;
    let activeHost = Option.none<ActiveProcedureHost>();

    void props.start().then(
      (started) => {
        activeHost = Option.some(started);
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
      if (Option.isSome(activeHost)) void activeHost.value.dispose();
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
        <AppRouter>
          {(rootProps) => (
            <ReadingApplication procedures={current().procedures} capabilities={props.capabilities}>
              {rootProps.children}
            </ReadingApplication>
          )}
        </AppRouter>
      )}
    </Show>
  );
};
