// ⌘K, the command menu: every command available where the page is, found by
// typing, run with Enter or a click, each with the keys bound to it now (`/`
// opens it too, to go somewhere by name: a Go to entry is found by typing). It
// reads the page's hub and nothing else (the registry, the keymap), so a
// command a tool registers is here while the tool is mounted, and a key the
// viewer rebinds reads as rebound. The context is the one the page had when
// the menu opened (what was selected, whether the film played). A command
// runs once the menu has closed and focus is back on the page, so what it
// focuses (a note's composer) keeps focus. Its rows are keyed by their
// command (`rowKey`): made again each frame a film plays, a row keeps its
// element under the pointer. Hosted in @bible/ui's Dialog.

import { Dialog } from '@bible/ui/dialog';
import { For, Show } from '@solidjs/web';
import { Effect, Option } from 'effect';
import { createMemo, createSignal, onCleanup } from 'solid-js';
import { type Command, quiet } from '../../command/command.ts';
import type { Context } from '../../command/context.ts';
import type { Hub } from '../../command/hub.ts';
import { chordLabel } from '../../command/keymap.ts';
import { type MenuRow, menuRows, rowKey } from '../../command/menu.ts';
import { EVERYWHERE } from '../../command/target.ts';
import { hubChanges } from './changes.ts';

/** The command that opens and closes the menu: it is not listed in itself. */
const OPEN = 'app.command-menu';

/** The command that opens it to go somewhere by name (`/`): not listed in it either. */
export const GO_TO_COMMAND = 'app.go-to';

/** An ARIA state's text, by whether it holds. */
const PSEUDO = { true: 'true', false: 'false' } as const;

/** The keys bound to `command` now, as the page's keyboard writes them. */
const keysText = (hub: Hub, command: Command): string =>
  hub
    .keysOf(command.id)
    .map((k) => chordLabel(k, hub.mac))
    .join(' ');

export const CommandMenu = (props: { readonly hub: Hub }) => {
  const hub = props.hub;
  const [open, setOpen] = createSignal(false, { ownedWrite: true });
  const [query, setQuery] = createSignal('');
  const [at, setAt] = createSignal(0);
  const [opened, setOpened] = createSignal<Context>(hub.context());
  let chosen = Option.none<MenuRow>();
  const changes = hubChanges(hub);

  const rows = createMemo(() => {
    changes();
    const ctx = opened();
    return menuRows(
      hub.commands.available(ctx).filter((c) => c.id !== OPEN && c.id !== GO_TO_COMMAND),
      ctx,
      query(),
    );
  });

  const show = (ctx: Context) => {
    setOpened({ ...ctx, focus: 'page' });
    setQuery('');
    setAt(0);
    chosen = Option.none();
    setOpen(true);
  };

  onCleanup(
    hub.commands.register(
      {
        id: OPEN,
        label: 'Command menu',
        group: 'Help',
        keys: ['mod+k'],
        keysIn: ['page', 'field', 'studio'],
        about: EVERYWHERE,
        touch: 'long-press a cue, a card or a note, then Command menu',
        when: () => true,
        run: (ctx) =>
          Effect.sync(() => {
            if (open()) setOpen(false);
            else show(ctx);
            return quiet;
          }),
      },
      {
        // `/` opens the same menu to type a name in (AA-2): its Go to entries
        // are found by typing. Only from the page: in a field `/` is typed.
        id: GO_TO_COMMAND,
        label: 'Go to…',
        group: 'Help',
        keys: ['/'],
        touch: 'the command menu, then type a name',
        when: () => !open(),
        run: (ctx) =>
          Effect.sync(() => {
            show(ctx);
            return quiet;
          }),
      },
    ),
  );

  const choose = (row: MenuRow) => {
    chosen = Option.some(row);
    setOpen(false);
  };

  const onKey = (e: KeyboardEvent) => {
    const count = rows().length;
    if (e.key === 'ArrowDown') setAt((i) => Math.min(count - 1, i + 1));
    else if (e.key === 'ArrowUp') setAt((i) => Math.max(0, i - 1));
    else if (e.key === 'Enter') Option.map(Option.fromUndefinedOr(rows()[at()]), choose);
    else return;
    e.preventDefault();
  };

  return (
    <Dialog.Root
      open={open()}
      onOpenChange={(next) => setOpen(next)}
      onOpenChangeComplete={(isOpen) => {
        if (isOpen) return;
        const row = chosen;
        chosen = Option.none();
        Option.map(row, (r) => hub.invoke(r.command, { step: 'normal', via: 'palette' }, opened()));
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop class="lab-sheet-backdrop" />
        <Dialog.Popup class="lab-command-menu" data-role="command-menu">
          <Dialog.Title class="lab-sheet-title">Commands</Dialog.Title>
          <input
            class="lab-command-query"
            type="search"
            placeholder="Type a command"
            aria-label="Command"
            aria-controls="lab-command-rows"
            aria-activedescendant={`lab-command-${at()}`}
            value={query()}
            onInput={(e) => {
              setQuery(e.currentTarget.value);
              setAt(0);
            }}
            onKeyDown={onKey}
          />
          <div class="lab-command-rows" id="lab-command-rows" role="listbox" aria-label="Commands">
            <For each={rows()} keyed={rowKey}>
              {(row, i) => (
                <div
                  class="lab-command-row"
                  id={`lab-command-${i()}`}
                  role="option"
                  aria-selected={PSEUDO[`${i() === at()}`]}
                  data-command={row().command.id}
                  onPointerMove={() => setAt(i())}
                  onClick={() => choose(row())}
                >
                  <span class="lab-command-label">{row().label}</span>
                  <span class="lab-command-group">{row().command.group}</span>
                  <kbd>{keysText(hub, row().command)}</kbd>
                </div>
              )}
            </For>
            <Show when={rows().length === 0}>
              <p class="lab-command-none">No command matches.</p>
            </Show>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
