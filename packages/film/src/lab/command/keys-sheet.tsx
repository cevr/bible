// The `?` sheet: every command the page has registered, by group, with the
// keys bound to it now and how a phone reaches it, generated from the
// registry and the keymap (nothing here is written twice). It lists; it
// changes no key: every viewer has the keys each command declares. Escape
// closes it. Every command a key is bound to is listed (`sheetRows`). Hosted
// in @bible/ui's Dialog.

import { Dialog } from '@bible/ui/dialog';
import { For, Show } from '@solidjs/web';
import { createMemo, createSignal, onCleanup } from 'solid-js';
import { type CommandId, quietly } from '../../command/command.ts';
import type { Hub } from '../../command/hub.ts';
import { sheetRows } from '../../command/menu.ts';
import { hubChanges, hubKeys } from './changes.ts';

/** The command that opens and closes the sheet. */
export const KEYS_SHEET_COMMAND = 'app.keys';

interface KeysSheetProps {
  readonly hub: Hub;
}

export const KeysSheet = (props: KeysSheetProps) => {
  const hub = props.hub;
  const [open, setOpen] = createSignal(false, { ownedWrite: true });
  const changes = hubChanges(hub);
  const keys = hubKeys(hub);
  const keysOf = (id: CommandId) => keys.bound(id).map(keys.label);

  const groups = createMemo(() => {
    changes();
    return sheetRows(hub.commands.all(), keys.bound);
  });

  onCleanup(
    hub.commands.register({
      id: KEYS_SHEET_COMMAND,
      label: 'Keyboard shortcuts',
      group: 'Help',
      keys: ['?'],
      keysIn: ['page', 'studio'],
      touch: 'the command menu, then Keyboard shortcuts',
      when: () => true,
      run: quietly(() => setOpen((was) => !was)),
    }),
  );

  return (
    <Dialog.Root open={open()} onOpenChange={(next) => setOpen(next)}>
      <Dialog.Portal>
        <Dialog.Backdrop class="lab-sheet-backdrop" />
        <Dialog.Popup class="lab-keys-sheet" data-role="keys-sheet">
          <Dialog.Title class="lab-sheet-title">Keyboard shortcuts</Dialog.Title>
          <Dialog.Description class="lab-sheet-about">
            Every command, the keys that run it, and how a phone reaches it.
          </Dialog.Description>
          <For each={groups()}>
            {([group, commands]) => (
              <section class="lab-keys-group">
                <h3>{group}</h3>
                <For each={commands}>
                  {(command) => (
                    <div class="lab-keys-row" data-command={command.id}>
                      <span class="lab-keys-label">{command.label}</span>
                      <span class="lab-keys-bound">
                        <For each={keysOf(command.id)}>{(key) => <kbd>{key}</kbd>}</For>
                        <Show when={keysOf(command.id).length === 0}>
                          <span class="lab-keys-none">no key</span>
                        </Show>
                      </span>
                      <span class="lab-keys-touch">{command.touch}</span>
                    </div>
                  )}
                </For>
              </section>
            )}
          </For>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
