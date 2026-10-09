// Upstream: packages/react/src/toggle/Toggle.tsx
//
// A two-state button (`aria-pressed`), an item of a toggle group: pressed
// while its `value` is among the group's, and an item of the group's roving
// focus. Upstream's lone toggle (`pressed`, `defaultPressed`,
// `onPressedChange`) and `disabled` are left out.
import type { JSX } from '@solidjs/web';
import { omit, untrack } from 'solid-js';

import { CompositeItem } from '../internals/composite/CompositeItem.tsx';
import type { BaseUIComponentProps, HTMLProps } from '../internals/types.ts';
import { useButton } from '../internals/useButton.ts';
import { useToggleGroupContext } from '../toggle-group/ToggleGroupContext.ts';

export interface ToggleState {
  /** Whether the toggle is pressed. */
  pressed: boolean;
}

export interface ToggleProps<Value extends string = string> extends Omit<
  BaseUIComponentProps<'button', ToggleState>,
  'disabled'
> {
  /** The toggle's value in its group. */
  value: Value;
}

export function Toggle<Value extends string = string>(props: ToggleProps<Value>): JSX.Element {
  const group = useToggleGroupContext();
  const pressed = () => group.value.includes(props.value);

  const { getButtonProps } = useButton({ composite: true });

  const state: ToggleState = {
    get pressed() {
      return pressed();
    },
  };

  const ownProps: HTMLProps = {
    get 'aria-pressed'() {
      return pressed() ? 'true' : 'false';
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
      props={[ownProps, elementProps, getButtonProps]}
    />
  );
}
