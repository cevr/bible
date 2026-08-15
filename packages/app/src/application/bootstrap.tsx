import { failureMessage } from '@bible/core/observability';
import type { RouteSectionProps } from '@solidjs/router';
import { Show, type JSX } from '@solidjs/web';
import { createSignal, onSettled, type Component } from 'solid-js';

import type { AppCapabilities } from '../platform/index.js';
import type { ActiveProcedureHost } from '../procedure/index.js';
import { ReadingApplication } from './application.js';
import { SharedRoutes } from './routes.js';

const STARTUP_FALLBACK = 'An unknown startup error prevented the library from opening.';

/** The slice of a Solid router's interface the bootstrap needs: a root
 *  wrapper and route children. `Router` and `HashRouter` both satisfy it. */
export type BootstrapRouter = Component<{
  readonly root?: Component<RouteSectionProps>;
  readonly children?: JSX.Element;
}>;

export interface ApplicationBootstrapProps {
  /** History choice stays with the host: `Router` (web), `HashRouter` (desktop). */
  readonly router: BootstrapRouter;
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
  const RouterComponent = props.router;
  const [host, setHost] = createSignal<ActiveProcedureHost>();
  const [failure, setFailure] = createSignal<unknown>();

  onSettled(() => {
    let disposed = false;
    let activeHost: ActiveProcedureHost | undefined;

    void props.start().then(
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
        <RouterComponent
          root={(rootProps) => (
            <ReadingApplication procedures={current().procedures} capabilities={props.capabilities}>
              {rootProps.children}
            </ReadingApplication>
          )}
        >
          <SharedRoutes />
        </RouterComponent>
      )}
    </Show>
  );
};
