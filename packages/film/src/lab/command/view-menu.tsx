// The header's view menu, `⋯` (design language §4): how the page shows
// itself, on every page in the shell. Its rows are the page's own commands of
// the `View` group available now (captions, quality, findings, a filter,
// refresh, whatever the page registered), then Keyboard shortcuts
// (`viewRows`); each with its keys. As in the context menu, a row runs once
// the menu has closed and focus is back on the page (`deferredRun`), so a
// sheet it opens keeps its focus.

import { For } from '@solidjs/web';
import { Menu } from '@bible/ui/menu';
import { Option } from 'effect';
import { createMemo } from 'solid-js';
import type { Hub } from '../../command/hub.ts';
import { type MenuRow, rowKey, viewRows } from '../../command/menu.ts';
import { KEYS_SHEET_COMMAND } from './keys-sheet.tsx';
import { deferredRun, hubChanges, hubKeys } from './changes.ts';

/** The `⋯` button and its menu, for `hub`'s page. */
export const ViewMenu = (props: { readonly hub: Hub }) => {
  const hub = props.hub;
  const changes = hubChanges(hub);
  const run = deferredRun(hub, 'menu');
  const rows = createMemo(() => {
    changes();
    const ctx = run.opened();
    return viewRows(
      hub.commands.available(ctx),
      ctx,
      Option.toArray(hub.commands.byId(KEYS_SHEET_COMMAND)),
    );
  });
  const keys = hubKeys(hub);
  const keysText = (row: MenuRow) => keys.bound(row.command.id).map(keys.label).join(' ');
  return (
    <Menu.Root
      onOpenChange={(open) => {
        if (open) run.open(hub.context());
      }}
      onOpenChangeComplete={(isOpen) => {
        if (!isOpen) run.closed();
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
            <For each={rows()} keyed={rowKey}>
              {(row) => (
                <Menu.Item
                  class="lab-context-item"
                  data-command={row().command.id}
                  label={row().label}
                  onClick={() => run.choose(row())}
                >
                  <span>{row().label}</span>
                  <kbd>{keysText(row())}</kbd>
                </Menu.Item>
              )}
            </For>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
};
