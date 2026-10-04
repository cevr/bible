// Upstream: packages/react/src/number-field/root/useNumberFieldStepperButton.ts
//
// The increment and decrement buttons: they differ only in direction and in
// the bound (`max` or `min`) that disables them. A mouse press steps at once
// and repeats while held; a release commits. Typed text not yet committed
// is synced first, so the step starts from it. The buttons stay out of the
// Tab order (the input's arrow keys do the same) but are not hidden from
// touch screen readers.
import type { JSX } from '@solidjs/web';
import { omit, untrack } from 'solid-js';

import {
  createChangeEventDetails,
  createGenericEventDetails,
} from '../../internals/createBaseUIEventDetails.ts';
import { REASONS } from '../../internals/reasons.ts';
import type { BaseUIComponentProps, HTMLProps, NativeButtonProps } from '../../internals/types.ts';
import { useButton } from '../../internals/useButton.ts';
import { useRenderElement } from '../../internals/useRenderElement.tsx';
import { isTouchLikePointerType, usePressAndHold } from '../../utils/usePressAndHold.ts';
import { parseNumber } from '../utils/parse.ts';
import { getKeyState } from '../utils/types.ts';
import { stateAttributesMapping } from '../utils/stateAttributesMapping.ts';
import { useNumberFieldRootContext } from './NumberFieldRootContext.ts';
import type { NumberFieldRootState } from './NumberFieldRootState.ts';

const SELECT_NONE_STYLE: JSX.CSSProperties = {
  '-webkit-user-select': 'none',
  'user-select': 'none',
};

export type StepperButtonProps = NativeButtonProps &
  BaseUIComponentProps<'button', NumberFieldRootState>;

export function useNumberFieldStepperButton(
  componentProps: StepperButtonProps,
  isIncrement: boolean,
): JSX.Element {
  const ctx = useNumberFieldRootContext();
  const rootState = ctx.state;
  const elementProps = omit(componentProps, 'class', 'style', 'render', 'disabled', 'nativeButton');
  const pressReason = isIncrement ? REASONS.incrementPress : REASONS.decrementPress;
  const direction = isIncrement ? 1 : -1;

  const disabled = () => {
    const value = rootState.value;
    const isAtBoundary =
      value != null && (isIncrement ? value >= ctx.maxWithDefault : value <= ctx.minWithDefault);
    return (componentProps.disabled ?? false) || rootState.disabled || isAtBoundary;
  };
  const isInert = () => disabled() || rootState.readOnly;

  // Syncs typed text not yet committed, with no direction (so `snapOnStep`
  // does not snap it on the way), before the step runs.
  const commitValue = (event: Event) => {
    const shouldCommitInputValue = !ctx.allowInputSyncRef.current;
    ctx.allowInputSyncRef.current = true;
    if (!shouldCommitInputValue) {
      // Synced already: step from the exact value, and forget a value left
      // from an earlier change so a canceled step cannot commit it.
      ctx.lastChangedValueRef.current = ctx.valueRef.current;
      return;
    }
    const parsedValue = parseNumber(rootState.inputValue, ctx.locale, ctx.format);
    if (parsedValue !== null) {
      const details = createChangeEventDetails(pressReason, event);
      ctx.setValue(parsedValue, details);
      if (!details.isCanceled) {
        ctx.valueRef.current = parsedValue;
      }
    }
  };

  const { pointerHandlers, shouldSkipClick } = usePressAndHold({
    get disabled() {
      return isInert();
    },
    element: ctx.inputElement,
    tick(triggerEvent) {
      return ctx.incrementValue(ctx.getStepAmount(getKeyState(triggerEvent)), {
        direction,
        event: triggerEvent,
        reason: pressReason,
      });
    },
    onStop(event) {
      // Every release commits; with no change, the current value.
      const committed = ctx.lastChangedValueRef.current ?? ctx.valueRef.current;
      ctx.onValueCommitted(committed, createGenericEventDetails(pressReason, event));
    },
  });

  const props: HTMLProps = {
    get disabled() {
      return disabled();
    },
    'aria-label': isIncrement ? 'Increase' : 'Decrease',
    get 'aria-controls'() {
      return ctx.id;
    },
    tabindex: -1,
    style: SELECT_NONE_STYLE,
    ...pointerHandlers,
    onClick(event: MouseEvent) {
      untrack(() => {
        if (event.defaultPrevented || isInert() || shouldSkipClick(event)) {
          return;
        }
        commitValue(event);
        const prev = ctx.valueRef.current;
        ctx.incrementValue(ctx.getStepAmount(event), { direction, event, reason: pressReason });
        const committed = ctx.lastChangedValueRef.current ?? ctx.valueRef.current;
        if (committed !== prev) {
          ctx.onValueCommitted(committed, createGenericEventDetails(pressReason, event));
        }
      });
    },
    onPointerDown(event: PointerEvent) {
      untrack(() => {
        if (event.defaultPrevented || rootState.readOnly || event.button || disabled()) {
          return;
        }
        commitValue(event);
        // The result slot of this hold: a no-op or canceled first tick then
        // commits the current value, not one from an earlier interaction.
        ctx.lastChangedValueRef.current = null;
        if (!isTouchLikePointerType(event.pointerType)) {
          // Keyboard steps can follow in the input.
          ctx.focusInput();
        }
        pointerHandlers.onPointerDown(event);
      });
    },
  };

  const { getButtonProps, buttonRef } = useButton({
    // Read-only steppers are unavailable as buttons; `data-readonly` stays for
    // styling (`aria-readonly` is not valid on a button).
    get disabled() {
      return isInert();
    },
    get native() {
      return componentProps.nativeButton ?? true;
    },
    focusableWhenDisabled: true,
  });

  const state: NumberFieldRootState = {
    get value() {
      return rootState.value;
    },
    get inputValue() {
      return rootState.inputValue;
    },
    get required() {
      return rootState.required;
    },
    get disabled() {
      return disabled();
    },
    get readOnly() {
      return rootState.readOnly;
    },
    get scrubbing() {
      return rootState.scrubbing;
    },
  };

  return useRenderElement('button', componentProps, {
    ref: buttonRef,
    state,
    props: [props, elementProps, getButtonProps],
    stateAttributesMapping,
  });
}
