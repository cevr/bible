// Upstream: packages/react/src/toggle-group/ToggleGroup.tsx
//
// A set of toggles (`role="group"`), one pressed at a time. The owner holds
// `value`: pressing a toggle offers `[its value]`, pressing the pressed one
// offers `[]`, and the toggles show what the owner keeps. It is a composite
// with one tab stop (the left and right arrows, wrapping at the ends; Home
// and End), which starts on the toggle drawn pressed (`aria-pressed`; the
// first when none is). A mouse press from outside the group takes no focus:
// focus goes where the platform sends it for a press on content that takes
// none, the nearest focusable ancestor (a sheet's popup) or else nowhere;
// the pressed toggle takes the tab stop either way (see Toggle).
// Upstream's uncontrolled mode, `multiple`, `disabled`, `orientation` and
// `loopFocus` are left out.
import { isHTMLElement } from '@floating-ui/utils/dom';
import type { JSX } from '@solidjs/web';
import { omit, untrack } from 'solid-js';

import { getFocusableAncestor } from '../floating-ui-solid/utils/tabbable.ts';
import { CompositeRoot } from '../internals/composite/CompositeRoot.tsx';
import type { BaseUIComponentProps, HTMLProps } from '../internals/types.ts';
import { ToggleGroupContext, type ToggleGroupContextValue } from './ToggleGroupContext.ts';

interface ToggleGroupState {}

interface ToggleGroupProps<Value extends string = string> extends BaseUIComponentProps<
  'div',
  ToggleGroupState
> {
  /** The values of the pressed toggles. */
  value: readonly Value[];
  /** Called with the values a press offers: the pressed toggle's alone, or none. */
  onValueChange: (groupValue: Value[]) => void;
}

const STATE: ToggleGroupState = {};

/** The toggle drawn pressed, among the group's first toggles (-1: none). */
const pressedIndex = (elements: ReadonlyArray<HTMLElement | null>) =>
  elements.findIndex((el) => el?.getAttribute('aria-pressed') === 'true');

export function ToggleGroup<Value extends string = string>(
  props: ToggleGroupProps<Value>,
): JSX.Element {
  let element: HTMLElement | null = null;
  const context: ToggleGroupContextValue<Value> = {
    get value() {
      return props.value;
    },
    setGroupValue(newValue, nextPressed) {
      untrack(() => props.onValueChange)(nextPressed ? [newValue] : []);
    },
    holdsFocus() {
      return element?.contains(element.ownerDocument.activeElement) ?? false;
    },
    releaseFocus() {
      if (element === null) {
        return;
      }
      const ancestor = getFocusableAncestor(element);
      if (ancestor !== null) {
        ancestor.focus({ preventScroll: true });
        return;
      }
      const active = element.ownerDocument.activeElement;
      if (isHTMLElement(active) && active !== element.ownerDocument.body) {
        active.blur();
      }
    },
  };

  const defaultProps: HTMLProps = {
    role: 'group',
    ref(node: HTMLElement | null) {
      element = node;
    },
  };
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
        initialIndex={pressedIndex}
        props={[defaultProps, elementProps]}
      />
    </ToggleGroupContext>
  );
}
