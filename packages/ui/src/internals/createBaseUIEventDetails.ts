// Upstream: packages/react/src/internals/createBaseUIEventDetails.ts
//
// The details every change callback receives: why (`reason`), the DOM event
// behind it, the trigger involved, and `cancel()` to keep the current state.

/** The details of a change a callback may cancel. */
export type BaseUIChangeEventDetails<Reason extends string = string> = {
  reason: Reason;
  event: Event;
  cancel: () => void;
  readonly isCanceled: boolean;
  trigger: Element | undefined;
};

/** The details of an event a callback only observes. */
export type BaseUIGenericEventDetails<Reason extends string = string> = {
  reason: Reason;
  event: Event;
};

export function createChangeEventDetails<Reason extends string>(
  reason: Reason,
  event?: Event,
  trigger?: Element,
): BaseUIChangeEventDetails<Reason> {
  let canceled = false;
  const details = {
    reason,
    event: event ?? new Event('base-ui'),
    cancel() {
      canceled = true;
    },
    get isCanceled() {
      return canceled;
    },
    trigger,
  };
  return details;
}

export function createGenericEventDetails<Reason extends string>(
  reason: Reason,
  event?: Event,
): BaseUIGenericEventDetails<Reason> {
  return { reason, event: event ?? new Event('base-ui') };
}
