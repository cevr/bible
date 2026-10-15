// Upstream: packages/react/src/toggle/Toggle.tsx
//
// A two-state button (`aria-pressed`), an item of a toggle group: pressed
// while its `value` is among the group's, and an item of the group's roving
// focus. A mouse press takes no focus unless focus is already in the group
// (upstream focuses the toggle): focus goes where the platform sends it for
// a press on content that takes none, the group's nearest focusable ancestor
// (a sheet's popup) or else nowhere, and the press still moves the group's
// tab stop to the toggle.
// Upstream's lone toggle (`pressed`, `defaultPressed`,
// `onPressedChange`) and `disabled` are left out.
import type { JSX } from '@solidjs/web';
import { omit, untrack } from 'solid-js';

import { CompositeItem } from '../internals/composite/CompositeItem.tsx';
import type { BaseUIComponentProps, HTMLProps } from '../internals/types.ts';
import { useButton } from '../internals/useButton.ts';
import { useToggleGroupContext } from '../toggle-group/ToggleGroupContext.ts';

interface ToggleState {
  /** Whether the toggle is pressed. */
  pressed: boolean;
}

interface ToggleProps<Value extends string = string> extends Omit<
  BaseUIComponentProps<'button', ToggleState>,
  'disabled'
> {
  /** The toggle's value in its group. */
  value: Value;
}

export function Toggle<Value extends string = string>(props: ToggleProps<Value>): JSX.Element {
  const group = useToggleGroupContext();
  const pressed = () => group.value.includes(props.value);

  const button = useButton({ composite: true });

  const state: ToggleState = {
    get pressed() {
      return pressed();
    },
  };

  const ownProps: HTMLProps = {
    get 'aria-pressed'() {
      return pressed() ? 'true' : 'false';
    },
    onMouseDown(event: MouseEvent) {
      // A mouse press from outside the group takes no focus. Focus moves to
      // the group's focusable ancestor or leaves every control, so a field
      // commits on its own blur before the press's change, a sheet keeps the
      // keyboard, and on the page the page keeps its keys (Space, the
      // arrows). A keyboard user already in the group keeps it, on the
      // pressed toggle.
      if (group.holdsFocus()) {
        return;
      }
      event.preventDefault();
      group.releaseFocus();
    },
    onClick() {
      untrack(() => group.setGroupValue(props.value, !pressed()));
    },
  };

  const elementProps = omit(
    props,
    'class',
    'style',
    'render',
    'value',
    // A toggle never submits or joins a form.
    'type',
    'form',
  ) as HTMLProps;

  return (
    <CompositeItem<ToggleState>
      tag="button"
      render={props.render}
      class={props.class}
      style={props.style}
      state={state}
      props={[button, ownProps, elementProps]}
    />
  );
}
