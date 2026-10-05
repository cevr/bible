// The `?` sheet: every command the page has registered, by group, with the
// keys bound to it now and how a phone reaches it, generated from the
// registry and the keymap (nothing here is written twice). A key is rebound
// here: Change, then the new chord; the viewer's keymap keeps it in this
// browser (`command/hub.ts`), and Reset puts a command's default keys back.
// Escape closes the sheet, a change waiting for its chord with it. Every
// command a key is bound to is listed (`sheetRows`). On a film's page, whose
// bar has stripes and ticks, the sheet ends on what they mean (`BAR_LEGEND`),
// the bar's own legend being hidden at rest. Hosted in @bible/ui's Dialog.

import { Dialog } from '@bible/ui/dialog';
import { For, Show } from '@solidjs/web';
import { Option } from 'effect';
import { createMemo, createSignal, onCleanup } from 'solid-js';
import { type Command, type CommandId, quietly } from '../../command/command.ts';
import type { Hub } from '../../command/hub.ts';
import { chordOf, rebind, resetKeys } from '../../command/keymap.ts';
import { sheetRows } from '../../command/menu.ts';
import { BAR_LEGEND } from '../../player/transport.ts';
import { hubChanges, hubKeys } from './changes.ts';

/** The keys a chord is not made of alone: a modifier waits for its key. */
const MODIFIER_KEYS = new Set(['Shift', 'Meta', 'Control', 'Alt', 'AltGraph', 'CapsLock']);

/** A rebind button's act and words, by whether it waits for its chord. */
const ACT = { true: 'press', false: 'rebind' } as const;
const LABEL = { true: 'Press a key…', false: 'Change' } as const;

/** The command that opens and closes the sheet. */
export const KEYS_SHEET_COMMAND = 'app.keys';

/** What the bar's stripes and ticks mean, each tick beside its swatch. */
const Legend = () => (
  <section class="lab-keys-group" data-role="keys-legend">
    <h3>The bar</h3>
    <p class="keys">
      {BAR_LEGEND.striped} · ticks:{' '}
      <For each={BAR_LEGEND.ticks}>
        {(tick) => (
          <>
            <i class={`k-${tick.kind}`} />
            {`${tick.name} `}
          </>
        )}
      </For>
      {BAR_LEGEND.names}
    </p>
  </section>
);

interface KeysSheetProps {
  readonly hub: Hub;
  /** Whether the page has a film's bar, whose stripes and ticks the sheet then explains. */
  readonly legend: boolean;
}

export const KeysSheet = (props: KeysSheetProps) => {
  const hub = props.hub;
  const [open, setOpen] = createSignal(false, { ownedWrite: true });
  const [waiting, setWaiting] = createSignal(Option.none<CommandId>());
  const changes = hubChanges(hub);
  const keys = hubKeys(hub);
  const keysOf = (id: CommandId) => keys.bound(id).map(keys.label);

  const groups = createMemo(() => {
    changes();
    return sheetRows(hub.commands.all(), keys.bound);
  });
  const overridden = (id: CommandId) => {
    changes();
    return hub.overrides().some((o) => o.command === id || o.command === `-${id}`);
  };

  onCleanup(
    hub.commands.register({
      id: KEYS_SHEET_COMMAND,
      label: 'Keyboard shortcuts',
      group: 'Help',
      keys: ['?'],
      keysIn: ['page', 'studio'],
      touch: 'the command menu, then Keyboard shortcuts',
      when: () => true,
      run: quietly(() => {
        setWaiting(Option.none());
        setOpen((was) => !was);
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
                      <span class="lab-keys-touch">{command.touch}</span>
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
          <Show when={props.legend}>
            <Legend />
          </Show>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
