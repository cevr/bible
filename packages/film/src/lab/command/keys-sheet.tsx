// The `?` sheet: every command the page has registered, by group, with the
// keys bound to it now and how a phone reaches it, generated from the
// registry and the keymap (nothing here is written twice). A key is rebound
// here: Change, then the new chord; the viewer's keymap keeps it in this
// browser (`command/hub.ts`), and Reset puts a command's default keys back.
// Escape closes the sheet, a change waiting for its chord with it. Hosted in
// @bible/ui's Dialog.

import { Dialog } from '@bible/ui/dialog';
import { For, Show } from '@solidjs/web';
import { Effect, Option } from 'effect';
import { createMemo, createSignal, onCleanup } from 'solid-js';
import { type Command, type CommandId, quiet } from '../../command/command.ts';
import type { Hub } from '../../command/hub.ts';
import { chordLabel, chordOf, rebind, resetKeys } from '../../command/keymap.ts';
import { sheetRows } from '../../command/menu.ts';
import { hubChanges } from './changes.ts';

/** The keys a chord is not made of alone: a modifier waits for its key. */
const MODIFIER_KEYS = new Set(['Shift', 'Meta', 'Control', 'Alt', 'AltGraph', 'CapsLock']);

/** A rebind button's act and words, by whether it waits for its chord. */
const ACT = { true: 'press', false: 'rebind' } as const;
const LABEL = { true: 'Press a key…', false: 'Change' } as const;

/** The command that opens and closes the sheet. */
const OPEN = 'app.keys';

export const KeysSheet = (props: { readonly hub: Hub }) => {
  const hub = props.hub;
  const [open, setOpen] = createSignal(false, { ownedWrite: true });
  const [waiting, setWaiting] = createSignal(Option.none<CommandId>());
  const changes = hubChanges(hub);

  const groups = createMemo(() => {
    changes();
    return sheetRows(hub.commands.all());
  });
  const overridden = (id: CommandId) => {
    changes();
    return hub.overrides().some((o) => o.command === id || o.command === `-${id}`);
  };

  onCleanup(
    hub.commands.register({
      id: OPEN,
      label: 'Keyboard shortcuts',
      group: 'Help',
      keys: ['?'],
      keysIn: ['page', 'studio'],
      touch: 'the command menu, then Keyboard shortcuts',
      when: () => true,
      run: () =>
        Effect.sync(() => {
          setWaiting(Option.none());
          setOpen((was) => !was);
          return quiet;
        }),
    }),
  );

  /** The chord pressed while `command` waits for one: kept as its key. */
  const capture = (command: Command) => (e: KeyboardEvent) => {
    if (MODIFIER_KEYS.has(e.key) || e.key === 'Escape' || e.key === 'Tab') return;
    e.preventDefault();
    const chord = chordOf({
      key: e.key,
      code: e.code,
      shift: e.shiftKey,
      meta: e.metaKey,
      ctrl: e.ctrlKey,
      alt: e.altKey,
      target: Option.none(),
    });
    hub.setOverrides(rebind(hub.overrides(), command, chord));
    setWaiting(Option.none());
  };

  const keysOf = (id: CommandId) => {
    changes();
    return hub.keysOf(id).map((k) => chordLabel(k, hub.mac));
  };

  return (
    <Dialog.Root
      open={open()}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setWaiting(Option.none());
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop class="lab-sheet-backdrop" />
        <Dialog.Popup class="lab-keys-sheet" data-role="keys-sheet">
          <Dialog.Title class="lab-sheet-title">Keyboard shortcuts</Dialog.Title>
          <Dialog.Description class="lab-sheet-about">
            Change a key, then press the new one. Kept in this browser.
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
                      <Show when={command.touch}>
                        {(touch) => <span class="lab-keys-touch">{touch()}</span>}
                      </Show>
                      <span class="lab-keys-actions">
                        {/* One button, so the focus the click gave it stays while it waits for the chord. */}
                        <button
                          type="button"
                          data-act={ACT[`${Option.contains(waiting(), command.id)}`]}
                          onClick={() => setWaiting(Option.some(command.id))}
                          onKeyDown={(e) => {
                            if (Option.contains(waiting(), command.id)) capture(command)(e);
                          }}
                          onBlur={() => {
                            if (Option.contains(waiting(), command.id)) setWaiting(Option.none());
                          }}
                        >
                          {LABEL[`${Option.contains(waiting(), command.id)}`]}
                        </button>
                        <Show when={overridden(command.id)}>
                          <button
                            type="button"
                            data-act="reset"
                            onClick={() => hub.setOverrides(resetKeys(hub.overrides(), command.id))}
                          >
                            Reset
                          </button>
                        </Show>
                      </span>
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
