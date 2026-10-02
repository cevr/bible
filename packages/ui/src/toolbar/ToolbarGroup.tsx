// Upstream: packages/react/src/toolbar/group/ToolbarGroup.tsx
//
// Groups toolbar items (`role="group"`); disabling the group disables the
// items inside it.
import type { JSX } from '@solidjs/web';
import { omit } from 'solid-js';

import type { BaseUIComponentProps, HTMLProps } from '../internals/types.ts';
import { useRenderElement } from '../internals/useRenderElement.tsx';
import type { ToolbarRootState } from './ToolbarRoot.tsx';
import {
  ToolbarGroupContext,
  type ToolbarGroupContextValue,
  useToolbarRootContext,
} from './ToolbarRootContext.ts';

export type ToolbarGroupState = ToolbarRootState;

export interface ToolbarGroupProps extends BaseUIComponentProps<'div', ToolbarGroupState> {
  /** Whether every item in the group is disabled. @default false */
  disabled?: boolean | undefined;
}

export function ToolbarGroup(props: ToolbarGroupProps): JSX.Element {
  const toolbar = useToolbarRootContext();

  const context: ToolbarGroupContextValue = {
    get disabled() {
      return toolbar.disabled || (props.disabled ?? false);
    },
  };

  const state: ToolbarGroupState = {
    get disabled() {
      return context.disabled;
    },
    get orientation() {
      return toolbar.orientation;
    },
  };

  const elementProps = omit(props, 'class', 'style', 'render', 'disabled');

  function Element() {
    return useRenderElement('div', props, {
      state,
      props: [{ role: 'group' }, elementProps as HTMLProps],
    });
  }

  return (
    <ToolbarGroupContext value={context}>
      <Element />
    </ToolbarGroupContext>
  );
}
