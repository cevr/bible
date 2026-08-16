/**
 * Ported from @effect/atom-solid (MIT), adapted to Solid 2. Delete this package
 * when upstream supports Solid 2.
 *
 * Solid context and provider for the Atom registry used by Effect Atom hooks.
 * The registry stores atom values, schedules update work, and cleans up unused
 * atoms. Sharing one registry through Solid context lets components and
 * computations in the same owner tree read and write the same atom state.
 */

import * as AtomRegistry from 'effect/unstable/reactivity/AtomRegistry';
import type { ParentProps } from 'solid-js';
import { createComponent, createContext, onCleanup } from 'solid-js';

/**
 * Provides a Solid context that carries the `AtomRegistry` used by atom hooks in
 * the current owner tree.
 *
 * When no provider is present, the context uses a standalone default registry.
 */
export const RegistryContext = createContext<AtomRegistry.AtomRegistry>(AtomRegistry.make());

/**
 * The provider forwards the registry options straight through, so its props are
 * `AtomRegistry.make`'s options plus Solid children.
 */
export type RegistryProviderProps = ParentProps<
  NonNullable<Parameters<typeof AtomRegistry.make>[0]>
>;

/**
 * Creates an `AtomRegistry` for a Solid subtree, optionally seeding initial atom
 * values and scheduler settings, and disposes the registry when the owner is
 * cleaned up.
 *
 * Provider options are consumed when the registry is created; they are not
 * reactive updates. A custom `scheduleTask` should return a cancellation
 * function that is safe to call during Solid cleanup.
 */
export const RegistryProvider = (props: RegistryProviderProps) => {
  const registry = AtomRegistry.make({
    scheduleTask: props.scheduleTask,
    initialValues: props.initialValues,
    timeoutResolution: props.timeoutResolution,
    defaultIdleTTL: props.defaultIdleTTL ?? 400,
  });
  onCleanup(() => registry.dispose());
  return createComponent(RegistryContext, {
    value: registry,
    get children() {
      return props.children;
    },
  });
};
