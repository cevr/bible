// Upstream: packages/react/src/internals/createBaseUIEventDetails.ts
//
// The details every change callback receives: why (`reason`), the DOM event
// behind it, the trigger involved, and `cancel()` to keep the current state
// or `allowPropagation()` to let an Escape reach the parent popup.

/** The details of a change a callback may cancel. */
export type BaseUIChangeEventDetails<
  Reason extends string = string,
  CustomProperties extends object = {},
> = {
  reason: Reason;
  event: Event;
  cancel: () => void;
  allowPropagation: () => void;
  readonly isCanceled: boolean;
  readonly isPropagationAllowed: boolean;
  trigger: Element | undefined;
} & CustomProperties;

/** The details of an event a callback only observes. */
export type BaseUIGenericEventDetails<
  Reason extends string = string,
  CustomProperties extends object = {},
> = {
  reason: Reason;
  event: Event;
} & CustomProperties;

export function createChangeEventDetails<
  Reason extends string,
  CustomProperties extends object = {},
>(
  reason: Reason,
  event?: Event,
  trigger?: Element,
  customProperties?: CustomProperties,
): BaseUIChangeEventDetails<Reason, CustomProperties> {
  let canceled = false;
  let allowPropagation = false;
  const details = {
    reason,
    event: event ?? new Event('base-ui'),
    cancel() {
      canceled = true;
    },
    allowPropagation() {
      allowPropagation = true;
    },
    get isCanceled() {
      return canceled;
    },
    get isPropagationAllowed() {
      return allowPropagation;
    },
    trigger,
    ...customProperties,
  };
  return details as BaseUIChangeEventDetails<Reason, CustomProperties>;
}

export function createGenericEventDetails<
  Reason extends string,
  CustomProperties extends object = {},
>(
  reason: Reason,
  event?: Event,
  customProperties?: CustomProperties,
): BaseUIGenericEventDetails<Reason, CustomProperties> {
  return {
    reason,
    event: event ?? new Event('base-ui'),
    ...customProperties,
  } as BaseUIGenericEventDetails<Reason, CustomProperties>;
}
