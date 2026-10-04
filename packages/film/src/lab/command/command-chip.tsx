// A chip that says one setting and opens the commands that change it: the
// transport's rate chip (`1×`, opening Play at ½× and the rest: Frame.io's
// speed chip) and the lab's loop chip (`loop off`, opening Loop the selected
// cue, Set the in point here, …). The chip names its commands by id; its
// menu lists those available now (`chipRows`), each with its keys, so a
// rate the transport plays at already is not offered: the chip says it. A
// command runs once the menu has closed, as the context menu's do. Its rows
// are keyed by their command (`rowKey`): made again each frame a film plays,
// a row keeps its element under the pointer. Built on
// @bible/ui's Menu, styled as the context menu (`COMMAND_TOKENS`).

import { For, type JSX } from '@solidjs/web';
import { Menu } from '@bible/ui/menu';
import { Option } from 'effect';
import { createMemo, createSignal } from 'solid-js';
import type { Context } from '../../command/context.ts';
import type { Hub } from '../../command/hub.ts';
import { chordLabel } from '../../command/keymap.ts';
import { type MenuRow, chipRows, rowKey } from '../../command/menu.ts';
import { hubChanges } from './changes.ts';

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
export const CommandChip = (props: CommandChipProps) => {
  const hub = props.hub;
  const changes = hubChanges(hub);
  const [opened, setOpened] = createSignal<Context>(hub.context());
  let chosen = Option.none<MenuRow>();
  const rows = createMemo(() => {
    changes();
    const ctx = opened();
    return chipRows(hub.commands.available(ctx), ctx, props.ids);
  });
  const keysText = (row: MenuRow): string =>
    hub
      .keysOf(row.command.id)
      .map((k) => chordLabel(k, hub.mac))
      .join(' ');
  return (
    <Menu.Root
      onOpenChange={(open) => {
        if (!open) return;
        chosen = Option.none();
        setOpened(hub.context('page'));
      }}
      onOpenChangeComplete={(isOpen) => {
        if (isOpen) return;
        const row = chosen;
        chosen = Option.none();
        Option.map(row, (r) => hub.invoke(r.command, { step: 'normal', via: 'menu' }, opened()));
      }}
    >
      <Menu.Trigger class={props.class} data-act={props.act} title={props.title}>
        {props.children}
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner class="lab-context-positioner" sideOffset={4} align="start">
          <Menu.Popup class="lab-context-menu" data-role="chip-menu" data-chip={props.act}>
            <For each={rows()} keyed={rowKey}>
              {(row) => (
                <Menu.Item
                  class="lab-context-item"
                  data-command={row().command.id}
                  label={row().label}
                  onClick={() => {
                    chosen = Option.some(row());
                  }}
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
