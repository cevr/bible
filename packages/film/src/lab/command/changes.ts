// The page's hub as Solid reads it: a count that moves each time a command
// comes or goes or a key is rebound, so a list of commands or keys reads it
// and follows. The subscription ends with the owner.

import type { Accessor } from 'solid-js';
import { createSignal, onCleanup } from 'solid-js';
import type { Hub } from '../../command/hub.ts';

/** A count of `hub`'s changes, for as long as the calling owner lives. */
export const hubChanges = (hub: Hub): Accessor<number> => {
  const [changes, setChanges] = createSignal(0, { ownedWrite: true });
  onCleanup(hub.subscribe(() => setChanges((n) => n + 1)));
  return changes;
};
