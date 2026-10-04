// The inspector's parts: a number field and the footer's hint. A field is an
// `Inspected` (`core/field.ts`): its steps come from its schema's `field`
// annotation, so the arrows in it step as the schema says (Shift coarse,
// Alt fine), a drag across its label scrubs it the same way, and typed
// arithmetic (`+0.1`, `*2`, `0.42*2`) is read on Enter or on leaving it, as
// a typed number is. A field that cannot be written now is disabled and says
// why in its title. Built on @bible/ui's NumberField and its scrub area.
//
// The hint prints the keys of the commands about the selection, read from
// the page's keymap, and the gestures the caller names; it shows only while
// the pointer or the focus is in the inspector, never at rest, and never on
// a touch screen, where the long-press menu is the hint.

import { NumberField } from '@bible/ui/number-field';
import { For, type JSX, Show } from '@solidjs/web';
import { Option } from 'effect';
import { createMemo } from 'solid-js';
import type { Command } from '../../command/command.ts';
import { withSelection } from '../../command/context.ts';
import type { Hub } from '../../command/hub.ts';
import { chordLabel } from '../../command/keymap.ts';
import { contextRows } from '../../command/menu.ts';
import type { Selection } from '../../command/selection.ts';
import { EVERYWHERE } from '../../command/target.ts';
import { type Inspected, refusalOf } from '../../core/field.ts';
import { hubChanges } from './changes.ts';

/** How a field prints its value: to the thousandth, as the files keep it, without grouping. */
const FORMAT: Intl.NumberFormatOptions = { maximumFractionDigits: 3, useGrouping: false };

/** The scene files' notation, whatever the browser's language: `0.42`, never `0,42`. */
const LOCALE = 'en-US';

/**
 * One field: `label`, when given, is its scrubby label (drag it across to
 * change the value); without one the field is named for assistive tech only.
 */
export const Field = (props: { readonly field: Inspected; readonly label?: JSX.Element }) => {
  const refusal = () => refusalOf(props.field);
  const title = () => Option.getOrElse(refusal(), () => props.field.label);
  return (
    <NumberField.Root
      class="lab-field"
      value={props.field.value}
      step={props.field.spec.step}
      largeStep={props.field.spec.coarse}
      smallStep={props.field.spec.fine}
      min={Option.getOrUndefined(props.field.spec.min)}
      max={Option.getOrUndefined(props.field.spec.max)}
      disabled={Option.isSome(refusal())}
      format={FORMAT}
      locale={LOCALE}
      allowExpressions
      commitOnEnter
      onValueCommitted={(next) => {
        // A cleared field writes nothing; nor does the value it already has.
        Option.map(
          Option.filter(Option.fromNullishOr(next), (v) => v !== props.field.value),
          props.field.write,
        );
      }}
    >
      <Show when={props.label}>
        {(label) => (
          <NumberField.ScrubArea class="lab-field-scrub" title={title()}>
            {label()}
          </NumberField.ScrubArea>
        )}
      </Show>
      <NumberField.Input
        class="lab-num"
        data-field={props.field.id}
        title={title()}
        aria-label={props.field.label}
      />
    </NumberField.Root>
  );
};

/** The keys bound to `command` now, as the page's keyboard writes them. */
const keysText = (hub: Hub, command: Command): string =>
  hub
    .keysOf(command.id)
    .map((k) => chordLabel(k, hub.mac))
    .join(' ');

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
  const rows = createMemo(() => {
    changes();
    const ctx = withSelection(props.hub.context(), [props.selection]);
    const everywhere = (c: Command) =>
      EVERYWHERE.every((t) => Option.exists(Option.fromUndefinedOr(c.about), (a) => a.includes(t)));
    return contextRows(props.hub.commands.available(ctx), ctx)
      .flatMap(([, commands]) => commands)
      .filter((row) => !everywhere(row.command))
      .map((row) => ({ label: row.label, keys: keysText(props.hub, row.command) }))
      .filter((row) => row.keys !== '');
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
