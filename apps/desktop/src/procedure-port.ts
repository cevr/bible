import { Effect, Option } from 'effect';

import { DesktopProcedurePortMessage } from '../shared/procedure-channel.js';

declare global {
  interface Window {
    readonly api: {
      readonly procedure: { readonly ready: () => void };
      readonly files: {
        readonly select: (
          accept: readonly string[],
        ) => Promise<readonly { readonly name: string; readonly contents: Uint8Array }[]>;
        readonly save: (options: {
          readonly suggestedName: string;
          readonly contents: Uint8Array;
        }) => Promise<void>;
      };
    };
  }
}

const isProcedurePortMessage = (event: MessageEvent<unknown>): boolean =>
  event.data === DesktopProcedurePortMessage;

const makeDesktopProcedurePortMailbox = (): Effect.Effect<MessagePort> => {
  let buffered: Option.Option<MessagePort> = Option.none();
  let waiting: Option.Option<(port: MessagePort) => void> = Option.none();

  const onMessage = (event: MessageEvent<unknown>): void => {
    if (!isProcedurePortMessage(event)) return;
    const port = Option.fromUndefinedOr(event.ports[0]);
    if (Option.isNone(port)) return;
    window.removeEventListener('message', onMessage);
    const deliver = waiting;
    if (Option.isNone(deliver)) {
      buffered = port;
      return;
    }
    waiting = Option.none();
    deliver.value(port.value);
  };

  // Preload transfers the channel at `did-finish-load`, before Solid's first
  // settled lifecycle. Subscribe eagerly so the one-shot message cannot race
  // renderer runtime startup.
  window.addEventListener('message', onMessage);
  window.api.procedure.ready();

  return Effect.callback((resume) => {
    const port = buffered;
    if (Option.isSome(port)) {
      buffered = Option.none();
      resume(Effect.succeed(port.value));
      return;
    }

    waiting = Option.some((received) => resume(Effect.succeed(received)));
    return Effect.sync(() => {
      waiting = Option.none();
    });
  });
};

/** Waits for the one renderer-owned procedure channel transferred by preload. */
export const waitForDesktopProcedurePort = makeDesktopProcedurePortMailbox();
