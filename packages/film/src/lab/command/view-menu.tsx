// The header's view menu, `⋯` (design language §4): how the page shows
// itself, on every page in the shell. Its rows are the page's own commands of
// the `View` group available now (captions, quality, findings, a filter,
// refresh, whatever the page registered), then Keyboard shortcuts; each with
// its keys. As in the context menu, a row runs once the menu has closed and
// focus is back on the page, so a sheet it opens keeps its focus.

import { For } from '@solidjs/web';
import { Menu } from '@bible/ui/menu';
import { Option } from 'effect';
import { createMemo, createSignal } from 'solid-js';
import { type Command, labelOf } from '../../command/command.ts';
import type { Context } from '../../command/context.ts';
import type { Hub } from '../../command/hub.ts';
import { KEYS_SHEET_COMMAND } from './keys-sheet.tsx';
import { hubChanges, hubKeys } from './changes.ts';

/** The group of the commands the view menu lists. */
const VIEW = 'View';

/** The view menu's rows in `ctx`: the view commands available, then the keys sheet. */
const viewRows = (hub: Hub, ctx: Context): ReadonlyArray<Command> => [
  ...hub.commands.available(ctx).filter((c) => c.group === VIEW),
  ...Option.toArray(hub.commands.byId(KEYS_SHEET_COMMAND)),
];

/** The `⋯` button and its menu, for `hub`'s page. */
export const ViewMenu = (props: { readonly hub: Hub }) => {
  const hub = props.hub;
  const changes = hubChanges(hub);
  const [opened, setOpened] = createSignal<Context>(hub.context());
  let chosen = Option.none<Command>();
  const rows = createMemo(() => {
    changes();
    return viewRows(hub, opened());
  });
  const keys = hubKeys(hub);
  const keysText = (command: Command) => keys.bound(command.id).map(keys.label).join(' ');
  return (
    <Menu.Root
      onOpenChange={(open) => {
        if (!open) return;
        chosen = Option.none();
        setOpened(hub.context());
      }}
      onOpenChangeComplete={(isOpen) => {
        if (isOpen) return;
        const row = chosen;
        chosen = Option.none();
        Option.map(row, (command) =>
          hub.invoke(command, { step: 'normal', via: 'menu' }, opened()),
        );
      }}
    >
      <Menu.Trigger class="sh-tool" data-act="view-menu" aria-label="View menu" title="View">
        <svg class="sh-icon sh-dots" viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="5" cy="12" r="1.6" />
          <circle cx="12" cy="12" r="1.6" />
          <circle cx="19" cy="12" r="1.6" />
        </svg>
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner class="lab-context-positioner" sideOffset={4} align="end">
          <Menu.Popup class="lab-context-menu" data-role="view-menu">
            <For each={rows()} keyed={(command) => command.id}>
              {(command) => (
                <Menu.Item
                  class="lab-context-item"
                  data-command={command().id}
                  label={labelOf(command(), opened())}
                  onClick={() => {
                    chosen = Option.some(command());
                  }}
                >
                  <span>{labelOf(command(), opened())}</span>
                  <kbd>{keysText(command())}</kbd>
                </Menu.Item>
              )}
            </For>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
};
