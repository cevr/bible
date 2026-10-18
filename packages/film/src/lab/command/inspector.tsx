// The inspector's footer hint: it prints the keys of the commands about the
// selection, read from the page's keymap, and the gestures the caller names;
// it shows only while the pointer or the focus is in the inspector, never at
// rest, and never on a touch screen, where the long-press menu is the hint.

import { For } from '@solidjs/web';
import { Option } from 'effect';
import { createMemo } from 'solid-js';
import type { Command } from '../../command/command.ts';
import { withSelection } from '../../command/context.ts';
import type { Hub } from '../../command/hub.ts';
import { contextRows } from '../../command/menu.ts';
import type { Selection } from '../../command/selection.ts';
import { EVERYWHERE } from '../../command/target.ts';
import { hubChanges, hubKeys } from './changes.ts';

/**
 * The inspector's footer: the keys of the commands about `selection`
 * available now (not those every menu has), then `gestures`.
 */
export const Hint = (props: {
  readonly hub: Hub;
  readonly selection: Selection;
  readonly gestures: ReadonlyArray<string>;
}) => {
  const changes = hubChanges(props.hub);
  const keys = hubKeys(props.hub);
  const rows = createMemo(() => {
    changes();
    const ctx = withSelection(props.hub.context(), [props.selection]);
    const everywhere = (c: Command) =>
      EVERYWHERE.every((t) => Option.exists(Option.fromUndefinedOr(c.about), (a) => a.includes(t)));
    return (
      contextRows(props.hub.commands.available(ctx), ctx)
        .flatMap(([, commands]) => commands)
        // A key's own step: its ×10 is Shift on the same key, which the hint need not say twice.
        .filter((row) => row.step === 'normal' && !everywhere(row.command))
        .map((row) => ({ label: row.label, keys: keys.text(row.command.id) }))
        .filter((row) => row.keys !== '')
    );
  });
  return (
    <footer class="lab-inspector-hint" data-role="inspector-hint">
      <For each={rows()}>
        {(row) => (
          <span class="lab-inspector-key">
            <kbd>{row.keys}</kbd> {row.label}
          </span>
        )}
      </For>
      <For each={props.gestures}>{(g) => <span class="lab-inspector-key">{g}</span>}</For>
    </footer>
  );
};
