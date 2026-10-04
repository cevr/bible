// The page's hub as Solid reads and writes it: a count that moves each time
// a command comes or goes or a key is rebound, so a list of commands or keys
// reads it and follows; and commands that follow a value (a page's Go to
// entries over what it shows), registered again as it changes. Each ends
// with the owner.

import type { Accessor } from 'solid-js';
import { createEffect, createSignal, onCleanup } from 'solid-js';
import type { Command } from '../../command/command.ts';
import type { Hub } from '../../command/hub.ts';

/** A count of `hub`'s changes, for as long as the calling owner lives. */
export const hubChanges = (hub: Hub): Accessor<number> => {
  const [changes, setChanges] = createSignal(0, { ownedWrite: true });
  onCleanup(hub.subscribe(() => setChanges((n) => n + 1)));
  return changes;
};

/** Register `commands` as they stand, again each time they change, for as long as the owner lives. */
export const registerWhile = (hub: Hub, commands: Accessor<ReadonlyArray<Command>>): void => {
  createEffect(commands, (now) => hub.commands.register(...now));
};
