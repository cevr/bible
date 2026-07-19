import { Effect } from 'effect';

import { DesktopProcedurePortMessage } from '../shared/procedure-channel.js';

declare global {
  interface Window {
    readonly api: { readonly procedure: { readonly ready: () => void } };
  }
}

const isProcedurePortMessage = (event: MessageEvent<unknown>): boolean => {
  return event.data === DesktopProcedurePortMessage;
};

const makeDesktopProcedurePortMailbox = (): Effect.Effect<MessagePort> => {
  let buffered: MessagePort | undefined;
  let waiting: ((port: MessagePort) => void) | undefined;

  const onMessage = (event: MessageEvent<unknown>): void => {
    if (!isProcedurePortMessage(event)) return;
    const port = event.ports[0];
    if (port === undefined) return;
    window.removeEventListener('message', onMessage);
    const deliver = waiting;
    if (deliver === undefined) {
      buffered = port;
      return;
    }
    waiting = undefined;
    deliver(port);
  };

  // Preload transfers the channel at `did-finish-load`, before Solid's first
  // settled lifecycle. Subscribe eagerly so the one-shot message cannot race
  // renderer runtime startup.
  window.addEventListener('message', onMessage);
  window.api.procedure.ready();

  return Effect.callback((resume) => {
    const port = buffered;
    if (port !== undefined) {
      buffered = undefined;
      resume(Effect.succeed(port));
      return;
    }

    waiting = (received) => resume(Effect.succeed(received));
    return Effect.sync(() => {
      waiting = undefined;
    });
  });
};

/** Waits for the one renderer-owned procedure channel transferred by preload. */
export const waitForDesktopProcedurePort = makeDesktopProcedurePortMailbox();
