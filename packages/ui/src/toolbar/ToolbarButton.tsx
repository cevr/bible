// Upstream: packages/react/src/toolbar/button/ToolbarButton.tsx
//
// A toolbar button, used as-is or as the trigger of another part (render a
// menu trigger through `render`). Disabled, it stays focusable by default
// (`aria-disabled`), so the arrow keys still reach it.
import type { JSX } from '@solidjs/web';
import { omit, untrack } from 'solid-js';

import { CompositeItem } from '../internals/composite/CompositeItem.tsx';
import type { BaseUIComponentProps, HTMLProps, NativeButtonProps } from '../internals/types.ts';
import { useButton } from '../internals/useButton.ts';
import type { ToolbarRootState } from './ToolbarRoot.tsx';
import {
  type ToolbarItemMetadata,
  useToolbarGroupContext,
  useToolbarRootContext,
} from './ToolbarRootContext.ts';

export interface ToolbarButtonState extends ToolbarRootState {
  /** Whether the button stays focusable when disabled. */
  focusable: boolean;
}

export interface ToolbarButtonProps
  extends NativeButtonProps, BaseUIComponentProps<'button', ToolbarButtonState> {
  /** @default false */
  disabled?: boolean | undefined;
  /** Whether the button stays focusable when disabled. @default true */
  focusableWhenDisabled?: boolean | undefined;
}

export function ToolbarButton(props: ToolbarButtonProps): JSX.Element {
  const toolbar = useToolbarRootContext();
  const group = useToolbarGroupContext();

  const disabled = () =>
    toolbar.disabled || (group?.disabled ?? false) || (props.disabled ?? false);
  const focusableWhenDisabled = () => props.focusableWhenDisabled ?? true;

  const { getButtonProps, buttonRef } = useButton({
    get disabled() {
      return disabled();
    },
    get focusableWhenDisabled() {
      return focusableWhenDisabled();
    },
    get native() {
      return props.nativeButton;
    },
    composite: true,
  });

  const state: ToolbarButtonState = {
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

  const elementProps = omit(
    props,
    'class',
    'style',
    'render',
    'disabled',
    'focusableWhenDisabled',
    'nativeButton',
  );

  // A rendered part (a menu trigger) reads `disabled` to derive its own state;
  // the default button leaves it off so a focusable disabled button keeps
  // its hover interactions (a tooltip).
  const forwardDisabled: HTMLProps | undefined = untrack(() => props.render)
    ? {
        get disabled() {
          return disabled();
        },
      }
    : undefined;

  return (
    <CompositeItem<ToolbarItemMetadata, ToolbarButtonState>
      tag="button"
      render={props.render}
      class={props.class}
      style={props.style}
      metadata={() => ({ disabled: disabled(), focusableWhenDisabled: focusableWhenDisabled() })}
      state={state}
      refs={[buttonRef]}
      props={[elementProps as HTMLProps, forwardDisabled, getButtonProps]}
    />
  );
}
