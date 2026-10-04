// Upstream: packages/react/src/toolbar/link/ToolbarLink.tsx
//
// A link in a toolbar. Links cannot be disabled; each holds a slot in the
// roving focus.
import type { JSX } from '@solidjs/web';
import { omit } from 'solid-js';

import { CompositeItem } from '../internals/composite/CompositeItem.tsx';
import type { BaseUIComponentProps, HTMLProps, Orientation } from '../internals/types.ts';
import { type ToolbarItemMetadata, useToolbarRootContext } from './ToolbarRootContext.ts';

const TOOLBAR_LINK_METADATA: ToolbarItemMetadata = {
  disabled: false,
  focusableWhenDisabled: true,
};

export interface ToolbarLinkState {
  /** The toolbar's orientation. */
  orientation: Orientation;
}

export interface ToolbarLinkProps extends BaseUIComponentProps<'a', ToolbarLinkState> {}

export function ToolbarLink(props: ToolbarLinkProps): JSX.Element {
  const toolbar = useToolbarRootContext();
  const state: ToolbarLinkState = {
    get orientation() {
      return toolbar.orientation;
    },
  };
  const elementProps = omit(props, 'class', 'style', 'render');
  return (
    <CompositeItem<ToolbarItemMetadata, ToolbarLinkState>
      tag="a"
      render={props.render}
      class={props.class}
      style={props.style}
      metadata={() => TOOLBAR_LINK_METADATA}
      state={state}
      props={[elementProps as HTMLProps]}
    />
  );
}
