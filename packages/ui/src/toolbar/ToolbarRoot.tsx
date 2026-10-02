// Upstream: packages/react/src/toolbar/root/ToolbarRoot.tsx
//
// A container for a set of controls (buttons, links, inputs, toggle groups,
// menu triggers): `role="toolbar"` with one tab stop, moved by the arrow keys
// along its orientation. Items that are disabled and not focusable when
// disabled leave the roving focus; the others stay reachable.
import type { JSX } from '@solidjs/web';
import { createMemo, createSignal, omit } from 'solid-js';

import type { CompositeMetadata } from '../internals/composite/CompositeList.tsx';
import { CompositeRoot } from '../internals/composite/CompositeRoot.tsx';
import type { BaseUIComponentProps, HTMLProps, Orientation } from '../internals/types.ts';
import {
  type ToolbarItemMetadata,
  ToolbarRootContext,
  type ToolbarRootContextValue,
} from './ToolbarRootContext.ts';

export interface ToolbarRootState {
  /** Whether the toolbar is disabled. */
  disabled: boolean;
  /** The toolbar's orientation. */
  orientation: Orientation;
}

export interface ToolbarRootProps extends BaseUIComponentProps<'div', ToolbarRootState> {
  /** Whether every item in the toolbar is disabled. @default false */
  disabled?: boolean | undefined;
  /** @default 'horizontal' */
  orientation?: Orientation | undefined;
  /** Whether arrowing past the last item wraps to the first. @default true */
  loopFocus?: boolean | undefined;
}

export function ToolbarRoot(props: ToolbarRootProps): JSX.Element {
  const [itemMap, setItemMap] = createSignal(
    new Map<Element, CompositeMetadata<ToolbarItemMetadata>>(),
    { ownedWrite: true },
  );

  const disabledIndices = createMemo(() => {
    const output: number[] = [];
    for (const metadata of itemMap().values()) {
      if (metadata.disabled && !metadata.focusableWhenDisabled) {
        output.push(metadata.index);
      }
    }
    return output;
  });

  const context: ToolbarRootContextValue = {
    get disabled() {
      return props.disabled ?? false;
    },
    get orientation() {
      return props.orientation ?? 'horizontal';
    },
  };

  const state: ToolbarRootState = {
    get disabled() {
      return context.disabled;
    },
    get orientation() {
      return context.orientation;
    },
  };

  const defaultProps: HTMLProps = {
    role: 'toolbar',
    get 'aria-orientation'() {
      return context.orientation;
    },
  };

  const elementProps = omit(
    props,
    'class',
    'style',
    'render',
    'disabled',
    'orientation',
    'loopFocus',
  );

  return (
    <ToolbarRootContext value={context}>
      <CompositeRoot<ToolbarItemMetadata, ToolbarRootState>
        render={props.render}
        class={props.class}
        style={props.style}
        state={state}
        props={[defaultProps, elementProps as HTMLProps]}
        disabledIndices={disabledIndices()}
        loopFocus={props.loopFocus}
        orientation={context.orientation}
        onMapChange={(map) => setItemMap(() => map)}
      />
    </ToolbarRootContext>
  );
}
