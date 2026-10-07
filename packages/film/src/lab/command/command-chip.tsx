// A button that opens a menu of commands (`RowsMenu`): its rows are the
// commands available now that the button lists, each with its keys, and a
// row runs once the menu has closed and focus is back on the page
// (`deferredRun`), as the context menu's do, so a sheet it opens keeps its
// focus. Its rows are keyed by their command (`rowKey`): made again each
// frame a film plays, a row keeps its element under the pointer. Built on
// @bible/ui's Menu, styled as the context menu (`.lab-context-menu`,
// `style.ts`). Two buttons open one: a chip (`CommandChip`) and the header's
// `⋯` (`view-menu.tsx`).
//
// A chip says one setting and opens the commands that change it: the
// transport's rate chip (`1×`, opening Play at ½× and the rest: Frame.io's
// speed chip) and the lab's loop chip (`loop off`, opening Loop the selected
// cue, Set the in point here, …). The chip names its commands by id; its
// menu lists those available now (`chipRows`), so a rate the transport plays
// at already is not offered: the chip says it.

import { For, type JSX } from '@solidjs/web';
import { Menu } from '@bible/ui/menu';
import { createMemo } from 'solid-js';
import type { Command } from '../../command/command.ts';
import type { Context } from '../../command/context.ts';
import type { Hub } from '../../command/hub.ts';
import { type MenuRow, chipRows, rowKey } from '../../command/menu.ts';
import { deferredRun, hubChanges, hubKeys } from './changes.ts';

/** A button that opens a menu of commands, and the rows it lists. */
interface RowsMenuProps {
  readonly hub: Hub;
  /** Its rows, of the commands available in the context the menu opened in. */
  readonly rows: (available: ReadonlyArray<Command>, ctx: Context) => ReadonlyArray<MenuRow>;
  /** Its menu's `data-role`, for the page's tests and styles. */
  readonly role: string;
  /** The edge of the button its menu lines up with. */
  readonly align: 'start' | 'end';
  /** The button's own words or icon. */
  readonly children: JSX.Element;
  /** What it is, for the pointer's tip (and a screen reader, without `label`). */
  readonly title: string;
  /** Its name for a screen reader, when its title does not say it. */
  readonly label?: string;
  /** Its `data-act`, for the page's tests and styles. */
  readonly act: string;
  readonly class?: string;
}

/** A button that opens the rows `rows` lists of the commands available now. */
export const RowsMenu = (props: RowsMenuProps) => {
  const hub = props.hub;
  const changes = hubChanges(hub);
  const run = deferredRun(hub, 'menu');
  const rows = createMemo(() => {
    changes();
    const ctx = run.opened();
    return props.rows(hub.commands.available(ctx), ctx);
  });
  const keys = hubKeys(hub);
  return (
    <Menu.Root
      onOpenChange={(open) => {
        if (open) run.open(hub.context());
      }}
      onOpenChangeComplete={(isOpen) => {
        if (!isOpen) run.closed();
      }}
    >
      <Menu.Trigger
        class={props.class}
        data-act={props.act}
        aria-label={props.label}
        title={props.title}
      >
        {props.children}
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner class="lab-context-positioner" sideOffset={4} align={props.align}>
          <Menu.Popup class="lab-context-menu" data-role={props.role}>
            <For each={rows()} keyed={rowKey}>
              {(row) => (
                <Menu.Item
                  class="lab-context-item"
                  data-command={row().command.id}
                  label={row().label}
                  onClick={() => run.choose(row())}
                >
                  <span>{row().label}</span>
                  <kbd>{keys.text(row().command.id)}</kbd>
                </Menu.Item>
              )}
            </For>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
};

/** What a chip shows and the commands it opens. */
interface CommandChipProps {
  readonly hub: Hub;
  /** The commands it opens, in its menu's order. */
  readonly ids: ReadonlyArray<string>;
  /** The chip's own words: the setting as it stands (`1×`, `loop off`). */
  readonly children: JSX.Element;
  /** What it is, for a screen reader and the pointer's tip. */
  readonly title: string;
  /** Its `data-act`, for the page's tests and styles. */
  readonly act: string;
  readonly class?: string;
}

/** A chip that opens the commands named by `ids`, available now. */
export const CommandChip = (props: CommandChipProps) => (
  <RowsMenu
    hub={props.hub}
    rows={(available, ctx) => chipRows(available, ctx, props.ids)}
    role="chip-menu"
    align="start"
    title={props.title}
    act={props.act}
    class={props.class}
  >
    {props.children}
  </RowsMenu>
);
