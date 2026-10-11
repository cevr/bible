// Upstream: packages/react/src/toggle/Toggle.tsx
//
// A two-state button (`aria-pressed`), an item of a toggle group: pressed
// while its `value` is among the group's, and an item of the group's roving
// focus. A mouse press takes no focus unless focus is already in the group
// (upstream focuses the toggle): it blurs whatever had focus, which then
// rests on the page, and still moves the group's tab stop to the toggle.
// Upstream's lone toggle (`pressed`, `defaultPressed`,
// `onPressedChange`) and `disabled` are left out.
import { isHTMLElement } from '@floating-ui/utils/dom';
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
    ref(node: HTMLElement | null) {
      if (node) {
        group.registerToggle(
          node,
          untrack(() => props.value),
        );
      }
    },
    onMouseDown(event: MouseEvent) {
      // A mouse press from outside the group takes no focus: whatever had it
      // is blurred (a field commits on its own blur, before the press's
      // change) and the page keeps its keys (Space, the arrows). A keyboard
      // user already in the group keeps it, on the pressed toggle.
      if (group.holdsFocus()) {
        return;
      }
      event.preventDefault();
      const active = (event.currentTarget as HTMLElement).ownerDocument.activeElement;
      if (isHTMLElement(active) && active !== active.ownerDocument.body) {
        active.blur();
      }
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
