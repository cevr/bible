/**
 * Ported from @effect/atom-solid (MIT), adapted to Solid 2. Delete this package
 * when upstream supports Solid 2.
 *
 * Solid context and provider for the Atom registry used by Effect Atom hooks.
 * The registry stores atom values, schedules update work, and cleans up unused
 * atoms. Sharing one registry through Solid context lets components and
 * computations in the same owner tree read and write the same atom state.
 */

/* oxlint-disable effect/noNewError -- a hook used outside its provider is a programming defect, reported the way Solid reports its own: by throwing from the hook. */

import { Option } from 'effect';
import * as AtomRegistry from 'effect/reactivity/AtomRegistry';
import type { ParentProps } from 'solid-js';
import { createComponent, createContext, onCleanup, useContext } from 'solid-js';

/**
 * The Solid context that carries the `AtomRegistry` used by atom hooks in
 * the current owner tree: a `RegistryProvider`'s, else none. There is no
 * registry without a provider, in the browser as on the server: a server
 * module is loaded once and renders every request, so a registry of its own
 * would carry one request's atoms (its URL, its reader's state) into the
 * next. Hooks read it through `useRegistry`; a page sets it only through
 * `RegistryProvider`.
 */
const RegistryContext = createContext<Option.Option<AtomRegistry.AtomRegistry>>(Option.none());

/** The registry of the current owner tree; a missing `RegistryProvider` throws. */
export const useRegistry = (): AtomRegistry.AtomRegistry =>
  Option.getOrThrowWith(
    useContext(RegistryContext),
    () =>
      new Error(
        '@bible/atom-solid: an atom hook ran outside a RegistryProvider. Wrap each page (and each server render) in its own RegistryProvider.',
      ),
  );

/** The provider's props: the atoms to seed, and Solid children. */
type RegistryProviderProps = ParentProps<
  Pick<NonNullable<Parameters<typeof AtomRegistry.make>[0]>, 'initialValues'>
>;

/**
 * Creates an `AtomRegistry` for a Solid subtree, optionally seeding initial atom
 * values, and disposes the registry when the owner is cleaned up. An atom that
 * nothing reads stays 400 ms before the registry drops it.
 *
 * `initialValues` is consumed when the registry is created; it is not a
 * reactive update.
 */
export const RegistryProvider = (props: RegistryProviderProps) => {
  const registry = AtomRegistry.make({
    initialValues: props.initialValues,
    defaultIdleTTL: 400,
  });
  onCleanup(() => registry.dispose());
  return createComponent(RegistryContext, {
    value: Option.some(registry),
    get children() {
      return props.children;
    },
  });
};
