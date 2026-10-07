// A labelling part's id (its own or a generated one), registered with the
// part it labels while it renders: a dialog's title and description, a menu
// group's label. The id is set from an effect, so a server render writes no
// signal, and cleared on cleanup only while it is still the one set, so a
// newer part's id outlives an older part's cleanup.
import { createEffect, createUniqueId } from 'solid-js';

/** Sets the registered id from the current one. */
export type RegisterId = (update: (current: string | undefined) => string | undefined) => void;

/** The part's id, registered through `register` while the part renders. */
export function useRegisteredId(
  props: { readonly id?: string | false | undefined },
  register: RegisterId,
): () => string {
  const fallbackId = createUniqueId();
  const id = () => props.id || fallbackId;
  createEffect(id, (value) => {
    register(() => value);
    return () => register((current) => (current === value ? undefined : current));
  });
  return id;
}
