// Upstream: packages/react/src/toggle-group/ToggleGroup.tsx
//
// A shared pressed state for a set of toggles (`role="group"`): one pressed
// at a time, or several with `multiple`. On its own it is a composite with
// one tab stop (arrow keys, Home and End); inside a toolbar it is a plain
// group and its toggles join the toolbar's roving focus.
import type { JSX } from '@solidjs/web';
import { omit, untrack } from 'solid-js';

import { CompositeRoot } from '../internals/composite/CompositeRoot.tsx';
import type { BaseUIChangeEventDetails } from '../internals/createBaseUIEventDetails.ts';
import type { REASONS } from '../internals/reasons.ts';
import type { BaseUIComponentProps, HTMLProps, Orientation } from '../internals/types.ts';
import { useRenderElement } from '../internals/useRenderElement.tsx';
import { useToolbarGroupContext, useToolbarRootContext } from '../toolbar/ToolbarRootContext.ts';
import { useControlled } from '../utils/useControlled.ts';
import { ToggleGroupContext, type ToggleGroupContextValue } from './ToggleGroupContext.ts';

export interface ToggleGroupState {
  /** Whether the group ignores user interaction. */
  disabled: boolean;
  /** Whether several toggles can be pressed at once. */
  multiple: boolean;
  orientation: Orientation;
}

export type ToggleGroupChangeEventReason = typeof REASONS.none;
export type ToggleGroupChangeEventDetails = BaseUIChangeEventDetails<ToggleGroupChangeEventReason>;

export interface ToggleGroupProps<Value extends string = string> extends BaseUIComponentProps<
  'div',
  ToggleGroupState
> {
  /** The values of the pressed toggles (controlled). */
  value?: readonly Value[] | undefined;
  /** The values of the toggles pressed at first (uncontrolled). */
  defaultValue?: readonly Value[] | undefined;
  /** Called when the pressed toggles change; `details.cancel()` keeps them. */
  onValueChange?:
    | ((groupValue: Value[], eventDetails: ToggleGroupChangeEventDetails) => void)
    | undefined;
  /** @default false */
  disabled?: boolean | undefined;
  /** @default 'horizontal' */
  orientation?: Orientation | undefined;
  /** Whether arrowing past the last toggle wraps to the first. @default true */
  loopFocus?: boolean | undefined;
  /** Whether several toggles can be pressed at once. @default false */
  multiple?: boolean | undefined;
}

const EMPTY: readonly never[] = [];

export function ToggleGroup<Value extends string = string>(
  props: ToggleGroupProps<Value>,
): JSX.Element {
  const toolbar = useToolbarRootContext(true);
  const toolbarGroup = useToolbarGroupContext();

  const disabled = () =>
    (toolbar?.disabled ?? false) || (toolbarGroup?.disabled ?? false) || (props.disabled ?? false);
  const multiple = () => props.multiple ?? false;
  const orientation = () => props.orientation ?? 'horizontal';

  const [groupValue, setValueState] = useControlled<readonly Value[]>({
    controlled: () => props.value,
    default: () => props.defaultValue ?? EMPTY,
  });

  const setGroupValue = (
    newValue: Value,
    nextPressed: boolean,
    eventDetails: ToggleGroupChangeEventDetails,
  ) => {
    const current = untrack(groupValue);
    let next: Value[];
    if (untrack(multiple)) {
      next = current.slice();
      if (nextPressed) {
        next.push(newValue);
      } else {
        next.splice(current.indexOf(newValue), 1);
      }
    } else {
      next = nextPressed ? [newValue] : [];
    }
    untrack(() => props.onValueChange)?.(next, eventDetails);
    if (eventDetails.isCanceled) {
      return;
    }
    setValueState(next);
  };

  const context: ToggleGroupContextValue<Value> = {
    get value() {
      return groupValue();
    },
    setGroupValue,
    get disabled() {
      return disabled();
    },
    get isValueInitialized() {
      return props.value !== undefined || props.defaultValue !== undefined;
    },
  };

  const state: ToggleGroupState = {
    get disabled() {
      return disabled();
    },
    get multiple() {
      return multiple();
    },
    get orientation() {
      return orientation();
    },
  };

  const defaultProps: HTMLProps = { role: 'group' };
  const elementProps = omit(
    props,
    'class',
    'style',
    'render',
    'value',
    'defaultValue',
    'onValueChange',
    'disabled',
    'orientation',
    'loopFocus',
    'multiple',
  ) as HTMLProps;

  function Plain() {
    return useRenderElement('div', props, { state, props: [defaultProps, elementProps] });
  }

  return (
    <ToggleGroupContext value={context as unknown as ToggleGroupContextValue<string>}>
      {toolbar ? (
        <Plain />
      ) : (
        <CompositeRoot<unknown, ToggleGroupState>
          render={props.render}
          class={props.class}
          style={props.style}
          state={state}
          props={[defaultProps, elementProps]}
          loopFocus={props.loopFocus ?? true}
          enableHomeAndEndKeys
          orientation={orientation()}
        />
      )}
    </ToggleGroupContext>
  );
}
