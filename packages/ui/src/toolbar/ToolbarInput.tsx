// Upstream: packages/react/src/toolbar/input/ToolbarInput.tsx
//
// A native text input in a toolbar. The arrow keys move its caret, and move
// on to the next item once the caret is at the end they point past. Disabled,
// it stays focusable by default (`aria-disabled`) and ignores presses.
import type { JSX } from '@solidjs/web';
import { omit, untrack } from 'solid-js';

import { CompositeItem } from '../internals/composite/CompositeItem.tsx';
import type { BaseUIComponentProps, HTMLProps } from '../internals/types.ts';
import { useFocusableWhenDisabled } from '../internals/useButton.ts';
import type { ToolbarRootState } from './ToolbarRoot.tsx';
import {
  type ToolbarItemMetadata,
  useToolbarGroupContext,
  useToolbarRootContext,
} from './ToolbarRootContext.ts';

export interface ToolbarInputState extends ToolbarRootState {
  /** Whether the input stays focusable when disabled. */
  focusable: boolean;
}

export interface ToolbarInputProps extends BaseUIComponentProps<'input', ToolbarInputState> {
  /** @default false */
  disabled?: boolean | undefined;
  /** Whether the input stays focusable when disabled. @default true */
  focusableWhenDisabled?: boolean | undefined;
}

export function ToolbarInput(props: ToolbarInputProps): JSX.Element {
  const toolbar = useToolbarRootContext();
  const group = useToolbarGroupContext();

  const disabled = () =>
    toolbar.disabled || (group?.disabled ?? false) || (props.disabled ?? false);
  const focusableWhenDisabled = () => props.focusableWhenDisabled ?? true;

  // Only the key handling and `aria-disabled`: the roving `tabindex` stays the item's.
  const focusableProps = useFocusableWhenDisabled({
    composite: true,
    get disabled() {
      return disabled();
    },
    get focusableWhenDisabled() {
      return focusableWhenDisabled();
    },
    isNativeButton: false,
  });

  const state: ToolbarInputState = {
    get disabled() {
      return disabled();
    },
    get orientation() {
      return toolbar.orientation;
    },
    get focusable() {
      return focusableWhenDisabled();
    },
  };

  const preventWhenDisabled = (event: Event) => {
    if (untrack(disabled)) {
      event.preventDefault();
    }
  };

  const elementProps = omit(props, 'class', 'style', 'render', 'disabled', 'focusableWhenDisabled');

  return (
    <CompositeItem<ToolbarItemMetadata, ToolbarInputState>
      tag="input"
      render={props.render}
      class={props.class}
      style={props.style}
      metadata={() => ({ disabled: disabled(), focusableWhenDisabled: focusableWhenDisabled() })}
      state={state}
      props={[
        { onClick: preventWhenDisabled, onPointerDown: preventWhenDisabled },
        elementProps as HTMLProps,
        {
          onKeyDown: focusableProps['onKeyDown'],
          get 'aria-disabled'() {
            return focusableProps['aria-disabled'];
          },
        },
      ]}
    />
  );
}
