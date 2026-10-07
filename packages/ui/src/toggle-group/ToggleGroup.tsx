// Upstream: packages/react/src/toggle-group/ToggleGroup.tsx
//
// A set of toggles (`role="group"`), one pressed at a time. The owner holds
// `value`: pressing a toggle offers `[its value]`, pressing the pressed one
// offers `[]`, and the toggles show what the owner keeps. It is a composite
// with one tab stop (the left and right arrows, wrapping at the ends; Home
// and End).
// Upstream's uncontrolled mode, `multiple`, `disabled`, `orientation` and
// `loopFocus` are left out.
import type { JSX } from '@solidjs/web';
import { omit, untrack } from 'solid-js';

import { CompositeRoot } from '../internals/composite/CompositeRoot.tsx';
import type { BaseUIComponentProps, HTMLProps } from '../internals/types.ts';
import { ToggleGroupContext, type ToggleGroupContextValue } from './ToggleGroupContext.ts';

export interface ToggleGroupState {}

export interface ToggleGroupProps<Value extends string = string> extends BaseUIComponentProps<
  'div',
  ToggleGroupState
> {
  /** The values of the pressed toggles. */
  value: readonly Value[];
  /** Called with the values a press offers: the pressed toggle's alone, or none. */
  onValueChange: (groupValue: Value[]) => void;
}

const STATE: ToggleGroupState = {};

export function ToggleGroup<Value extends string = string>(
  props: ToggleGroupProps<Value>,
): JSX.Element {
  const context: ToggleGroupContextValue<Value> = {
    get value() {
      return props.value;
    },
    setGroupValue(newValue, nextPressed) {
      untrack(() => props.onValueChange)(nextPressed ? [newValue] : []);
    },
  };

  const defaultProps: HTMLProps = { role: 'group' };
  const elementProps = omit(
    props,
    'class',
    'style',
    'render',
    'value',
    'onValueChange',
  ) as HTMLProps;

  return (
    <ToggleGroupContext value={context as unknown as ToggleGroupContextValue<string>}>
      <CompositeRoot<ToggleGroupState>
        render={props.render}
        class={props.class}
        style={props.style}
        state={STATE}
        props={[defaultProps, elementProps]}
      />
    </ToggleGroupContext>
  );
}
