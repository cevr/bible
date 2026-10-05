// The page's context menu: a right-click, or a touch held still for half a
// second (a drag moves past @bible/ui's threshold first, so a scrub never
// opens it), on a thing the page marks as a `Target` opens the commands
// about that thing (`contextRows`): Copy link and the command menu on every
// one, and each thing's own verbs. The thing is read from where the press
// landed (`targetAt`: the nearest `data-target`), so one menu serves every
// target on the page, a nested one winning over its container. The page
// itself is the outermost target: its children sit in one trigger that lays
// out as they do (`display: contents`), so a press on no thing opens the
// commands about the page (`Page`: Undo, Redo, Show only…, the transport's
// steps, a stepped one also at ×10: `contextRows`), and a field
// anywhere keeps the browser's own menu. The commands run once the menu has
// closed and focus is back on the page, as ⌘K's do.
// Its groups and rows are keyed by name and command (`rowKey`): made again
// each frame a film plays, a row keeps its element under the pointer, and a
// press and its release are one click. Built on @bible/ui's ContextMenu: `TargetMenu` is the page's one root
// (`Lab.Root`, the review's page), `Target` a thing's trigger, rendered as
// the thing's own element (a `div` unless `render` names another).

import { For, Show } from '@solidjs/web';
import { ContextMenu } from '@bible/ui/context-menu';
import { Option } from 'effect';
import {
  type Accessor,
  type ComponentProps,
  type ParentProps,
  createMemo,
  createSignal,
  omit,
} from 'solid-js';
import { type Context, focusOf, withSelection } from '../../command/context.ts';
import type { Hub } from '../../command/hub.ts';
import { chordLabel } from '../../command/keymap.ts';
import { type MenuRow, contextRows, rowChord, rowKey } from '../../command/menu.ts';
import type { Selection } from '../../command/selection.ts';
import { targetAt, targetAttr } from '../../command/target.ts';
import { hubChanges } from './changes.ts';

/**
 * The page's one context menu, over `children`: every `Target` inside opens
 * it, and so does a press on no thing (the page's own commands). Its one
 * element, the page's trigger, lays out as its children do.
 */
export const TargetMenu = (props: ParentProps<{ readonly hub: Hub }>) => {
  const hub = props.hub;
  const [opened, setOpened] = createSignal<Context>(hub.context());
  const changes = hubChanges(hub);
  let chosen = Option.none<MenuRow>();

  const groups = createMemo(() => {
    changes();
    const ctx = opened();
    return contextRows(hub.commands.available(ctx), ctx);
  });

  const keysText = (row: MenuRow): string =>
    hub
      .keysOf(row.command.id)
      .map((k) => chordLabel(rowChord(row, k), hub.mac))
      .join(' ');

  return (
    <ContextMenu.Root
      onOpenChange={(open, details) => {
        if (!open) return;
        const at = Option.fromNullishOr(details.event.target);
        // A field keeps its own menu (paste, spelling): the thing's menu is for the thing.
        if (focusOf(at) === 'field') {
          details.cancel();
          return;
        }
        chosen = Option.none();
        setOpened(withSelection(hub.context(), Option.toArray(targetAt(at))));
      }}
      onOpenChangeComplete={(isOpen) => {
        if (isOpen) return;
        const row = chosen;
        chosen = Option.none();
        Option.map(row, (r) => hub.invoke(r.command, { step: r.step, via: 'menu' }, opened()));
      }}
    >
      {/* The page itself is a target: a press on no thing opens the page's commands (`Page`). */}
      <ContextMenu.Trigger class="lab-page-target" style={{ display: 'contents' }}>
        {props.children}
      </ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Positioner class="lab-context-positioner">
          <ContextMenu.Popup class="lab-context-menu" data-role="context-menu">
            <For each={groups()} keyed={([group]) => group}>
              {(entry, i: Accessor<number>) => (
                <ContextMenu.Group class="lab-context-group">
                  <Show when={i() > 0}>
                    <ContextMenu.Separator class="lab-context-separator" />
                  </Show>
                  <ContextMenu.GroupLabel class="lab-context-label">
                    {entry()[0]}
                  </ContextMenu.GroupLabel>
                  <For each={entry()[1]} keyed={rowKey}>
                    {(row) => (
                      <ContextMenu.Item
                        class="lab-context-item"
                        data-command={row().command.id}
                        data-step={row().step}
                        label={row().label}
                        onClick={() => {
                          chosen = Option.some(row());
                        }}
                      >
                        <span>{row().label}</span>
                        <kbd>{keysText(row())}</kbd>
                      </ContextMenu.Item>
                    )}
                  </For>
                </ContextMenu.Group>
              )}
            </For>
          </ContextMenu.Popup>
        </ContextMenu.Positioner>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
};

/** The props a target hands the element it renders as (its `render`): spread them onto it. */
export type TargetElementProps = Parameters<
  NonNullable<ComponentProps<typeof ContextMenu.Trigger>['render']>
>[0];

/** A thing the page's context menu opens on (a right-click or a long press on it): `of` is the thing. */
export const Target = (
  props: ComponentProps<typeof ContextMenu.Trigger> & { readonly of: Selection },
) => {
  const rest = omit(props, 'of');
  return <ContextMenu.Trigger {...rest} data-target={targetAttr(props.of)} />;
};
