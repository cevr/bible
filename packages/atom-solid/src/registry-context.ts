/**
 * Ported from @effect/atom-solid (MIT), adapted to Solid 2. Delete this package
 * when upstream supports Solid 2.
 *
 * Solid context and provider for the Atom registry used by Effect Atom hooks.
 * The registry stores atom values, schedules update work, and cleans up unused
 * atoms. Sharing one registry through Solid context lets components and
 * computations in the same owner tree read and write the same atom state.
 */

/* oxlint-disable effect/noNewError -- a hook used outside its provider on the server is a programming defect, reported the way Solid reports its own: by throwing from the hook. */

import { isServer } from '@solidjs/web';
import { Option } from 'effect';
import * as AtomRegistry from 'effect/reactivity/AtomRegistry';
import type { ParentProps } from 'solid-js';
import { createComponent, createContext, onCleanup, useContext } from 'solid-js';

/**
 * The registry hooks use with no provider: one in the browser, where there is
 * one reader; none on the server. A server module is loaded once and renders
 * every request, so a registry of its own would carry one request's atoms
 * (its URL, its reader's state) into the next.
 */
const standalone = (): Option.Option<AtomRegistry.AtomRegistry> => {
  if (isServer) return Option.none();
  return Option.some(AtomRegistry.make());
};

/**
 * Provides a Solid context that carries the `AtomRegistry` used by atom hooks in
 * the current owner tree: a `RegistryProvider`'s, else the standalone one,
 * which the server does not have. Hooks read it through `useRegistry`.
 */
export const RegistryContext =
  createContext<Option.Option<AtomRegistry.AtomRegistry>>(standalone());

/** The registry of the current owner tree. On the server, a missing
 *  `RegistryProvider` throws. */
export const useRegistry = (): AtomRegistry.AtomRegistry =>
  Option.getOrThrowWith(
    useContext(RegistryContext),
    () =>
      new Error(
        '@bible/atom-solid: an atom hook ran on the server outside a RegistryProvider. Wrap each render in its own RegistryProvider so requests never share a registry.',
      ),
  );

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
    value: Option.some(registry),
    get children() {
      return props.children;
    },
  });
};
