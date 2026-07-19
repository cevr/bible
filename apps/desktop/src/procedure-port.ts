import { Effect } from 'effect';

const isProcedurePortMessage = (event: MessageEvent<unknown>): boolean => {
  if (event.source !== window) return false;
  if (typeof event.data !== 'object' || event.data === null) return false;
  return 'type' in event.data && event.data.type === 'bible-procedure-port';
};

/** Waits for the one renderer-owned procedure channel transferred by preload. */
export const waitForDesktopProcedurePort: Effect.Effect<MessagePort> = Effect.callback((resume) => {
  const onMessage = (event: MessageEvent<unknown>): void => {
    if (!isProcedurePortMessage(event)) return;
    const port = event.ports[0];
    if (port === undefined) return;
    window.removeEventListener('message', onMessage);
    resume(Effect.succeed(port));
  };

  window.addEventListener('message', onMessage);
  return Effect.sync(() => window.removeEventListener('message', onMessage));
});
