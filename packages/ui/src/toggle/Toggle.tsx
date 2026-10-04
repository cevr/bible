// Upstream: packages/react/src/toggle/Toggle.tsx
//
// A two-state button (`aria-pressed`). Alone it keeps its own pressed state
// (or the owner's, `pressed`); inside a toggle group it is pressed while its
// `value` is among the group's, and it is an item of the group's (or the
// toolbar's) roving focus. A disabled toggle is natively disabled and leaves
// the roving focus.
import type { JSX } from '@solidjs/web';
import { createEffect, createUniqueId, omit, untrack } from 'solid-js';

import { CompositeItem } from '../internals/composite/CompositeItem.tsx';
import { useCompositeRootContext } from '../internals/composite/CompositeRootContext.ts';
import {
  type BaseUIChangeEventDetails,
  createChangeEventDetails,
} from '../internals/createBaseUIEventDetails.ts';
import { REASONS } from '../internals/reasons.ts';
import type { BaseUIComponentProps, HTMLProps, NativeButtonProps } from '../internals/types.ts';
import { useButton } from '../internals/useButton.ts';
import { useRenderElement } from '../internals/useRenderElement.tsx';
import { useToggleGroupContext } from '../toggle-group/ToggleGroupContext.ts';
import type { ToolbarItemMetadata } from '../toolbar/ToolbarRootContext.ts';
import { useControlled } from '../utils/useControlled.ts';

export interface ToggleState {
  /** Whether the toggle is pressed. */
  pressed: boolean;
  /** Whether the toggle ignores user interaction. */
  disabled: boolean;
}

export type ToggleChangeEventReason = typeof REASONS.none;
export type ToggleChangeEventDetails = BaseUIChangeEventDetails<ToggleChangeEventReason>;

export interface ToggleProps<Value extends string = string>
  extends NativeButtonProps, BaseUIComponentProps<'button', ToggleState> {
  /** Whether the toggle is pressed (controlled). */
  pressed?: boolean | undefined;
  /** Whether the toggle is pressed at first (uncontrolled). @default false */
  defaultPressed?: boolean | undefined;
  /** @default false */
  disabled?: boolean | undefined;
  /** Called when the pressed state changes; `details.cancel()` keeps it (and the group's value). */
  onPressedChange?:
    | ((pressed: boolean, eventDetails: ToggleChangeEventDetails) => void)
    | undefined;
  /** The toggle's value in a toggle group. */
  value?: Value | undefined;
}

export function Toggle<Value extends string = string>(props: ToggleProps<Value>): JSX.Element {
  const group = useToggleGroupContext();
  const composite = useCompositeRootContext(true) !== null;
  const generatedValue = createUniqueId();
  // An empty value counts as none.
  const value = () => props.value || generatedValue;

  const disabled = () => (props.disabled ?? false) || (group?.disabled ?? false);

  createEffect(
    () => group !== null && props.value === undefined && group.isValueInitialized,
    (missing) => {
      if (missing) {
        console.error(
          'Base UI: A `<Toggle>` component rendered in a `<ToggleGroup>` has no explicit `value` prop. ' +
            'This will cause issues between the Toggle Group and Toggle values. ' +
            'Provide the `<Toggle>` with a `value` prop matching the `<ToggleGroup>` values prop type.',
        );
      }
    },
  );

  const [pressed, setPressedState] = useControlled({
    controlled: () => (group ? group.value.includes(value()) : props.pressed),
    default: () => props.defaultPressed ?? false,
  });

  const { getButtonProps, buttonRef } = useButton({
    get disabled() {
      return disabled();
    },
    get native() {
      return props.nativeButton;
    },
    composite,
  });

  const state: ToggleState = {
    get pressed() {
      return pressed();
    },
    get disabled() {
      return disabled();
    },
  };

  const ownProps: HTMLProps = {
    get 'aria-pressed'() {
      return pressed() ? 'true' : 'false';
    },
    onClick(event: MouseEvent) {
      untrack(() => {
        const nextPressed = !pressed();
        const details = createChangeEventDetails(REASONS.none, event);
        // Runs before the group commits, so canceling also vetoes the group's change.
        props.onPressedChange?.(nextPressed, details);
        if (details.isCanceled) {
          return;
        }
        group?.setGroupValue(value(), nextPressed, details);
        if (details.isCanceled) {
          return;
        }
        setPressedState(nextPressed);
      });
    },
  };

  const elementProps = omit(
    props,
    'class',
    'style',
    'render',
    'pressed',
    'defaultPressed',
    'disabled',
    'onPressedChange',
    'value',
    'nativeButton',
    // A toggle never submits or joins a form.
    'type',
    'form',
  ) as HTMLProps;

  if (group) {
    return (
      <CompositeItem<ToolbarItemMetadata, ToggleState>
        tag="button"
        render={props.render}
        class={props.class}
        style={props.style}
        metadata={() => ({ disabled: disabled(), focusableWhenDisabled: false })}
        state={state}
        refs={[buttonRef]}
        props={[ownProps, elementProps, getButtonProps]}
      />
    );
  }

  return useRenderElement('button', props, {
    state,
    ref: buttonRef,
    props: [ownProps, elementProps, getButtonProps],
  });
}
