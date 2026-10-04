// Upstream: packages/react/src/number-field/root/NumberFieldRoot.tsx
//
// Groups the number field's parts and owns its value: controlled or not,
// validated (snapped, clamped, cleaned of float noise) on every change, and
// shown as formatted text in the input. Typed text stays as typed until it
// is committed on blur; step changes (keys, buttons, wheel, scrub) rewrite it
// at once. A visually hidden `<input type="number">` carries the value into
// forms and native validation, and takes browser autofill.
// Renders a `<div>`.
import type { JSX } from '@solidjs/web';
import { createEffect, createSignal, createUniqueId, omit, untrack } from 'solid-js';

import {
  createChangeEventDetails,
  createGenericEventDetails,
} from '../../internals/createBaseUIEventDetails.ts';
import { REASONS } from '../../internals/reasons.ts';
import type { BaseUIComponentProps } from '../../internals/types.ts';
import { useRenderElement } from '../../internals/useRenderElement.tsx';
import { activeElement, addEventListener, ownerDocument } from '../../utils/dom.ts';
import { formatNumber } from '../../utils/formatNumber.ts';
import { platform } from '../../utils/platform.ts';
import { useControlled } from '../../utils/useControlled.ts';
import { visuallyHidden, visuallyHiddenInput } from '../../utils/visuallyHidden.ts';
import { stateAttributesMapping } from '../utils/stateAttributesMapping.ts';
import type { EventWithOptionalKeyState, IncrementValueParameters } from '../utils/types.ts';
import { getKeyState } from '../utils/types.ts';
import { toValidatedNumber } from '../utils/validate.ts';
import { getAllowedNonNumericKeys } from './allowedNonNumericKeys.ts';
import {
  type InputMode,
  NumberFieldRootContext,
  type NumberFieldRootContextValue,
} from './NumberFieldRootContext.ts';
import type {
  NumberFieldRootChangeEventDetails,
  NumberFieldRootChangeEventReason,
  NumberFieldRootCommitEventDetails,
  NumberFieldRootCommitEventReason,
  NumberFieldRootState,
} from './NumberFieldRootState.ts';

export interface NumberFieldRootProps extends Omit<
  BaseUIComponentProps<'div', NumberFieldRootState>,
  'onChange' | 'id'
> {
  /** The id of the input element. */
  id?: string | undefined;
  /** The minimum value. */
  min?: number | undefined;
  /** The maximum value. */
  max?: number | undefined;
  /**
   * Whether typed text may fall outside `min`/`max` without clamping, so native
   * range validation can occur. Step interactions still clamp.
   * @default false
   */
  allowOutOfRange?: boolean | undefined;
  /** The step while Alt is held. @default 0.1 */
  smallStep?: number | undefined;
  /**
   * The step of the buttons, arrow keys and scrub area. `'any'` turns off step
   * validation; interactive steps then use 1.
   * @default 1
   */
  step?: number | 'any' | undefined;
  /** The step while Shift is held. @default 10 */
  largeStep?: number | undefined;
  /** Whether a value is required to submit a form. @default false */
  required?: boolean | undefined;
  /** Whether the field ignores user interaction. @default false */
  disabled?: boolean | undefined;
  /** Whether the user cannot change the value. @default false */
  readOnly?: boolean | undefined;
  /** Identifies the field when a form is submitted. */
  name?: string | undefined;
  /** The id of the form that owns the hidden input. */
  form?: string | undefined;
  /** The value (controlled). */
  value?: number | null | undefined;
  /** The value when first rendered (uncontrolled). */
  defaultValue?: number | undefined;
  /** Whether the mouse wheel steps the value while the input is focused. @default false */
  allowWheelScrub?: boolean | undefined;
  /** Whether stepping snaps to the nearest multiple of the step. @default false */
  snapOnStep?: boolean | undefined;
  /** The options the value is formatted with. */
  format?: Intl.NumberFormatOptions | undefined;
  /** The locale the value is formatted and parsed in; the runtime's by default. */
  locale?: Intl.LocalesArgument | undefined;
  /**
   * Called when the value changes. `details.reason` is `input-change`,
   * `input-clear`, `input-blur`, `input-paste`, `keyboard`, `increment-press`,
   * `decrement-press`, `wheel`, `scrub` or `none` (autofill).
   */
  onValueChange?:
    | ((value: number | null, details: NumberFieldRootChangeEventDetails) => void)
    | undefined;
  /**
   * Called when the value is committed: on blur after typing, on release after
   * scrubbing or pressing a stepper, and with each keyboard or wheel step.
   */
  onValueCommitted?:
    | ((value: number | null, details: NumberFieldRootCommitEventDetails) => void)
    | undefined;
  /** A ref to the hidden input. */
  inputRef?: JSX.Ref<HTMLInputElement> | undefined;
}

const ROOT_PROPS = [
  'class',
  'style',
  'render',
  'id',
  'min',
  'max',
  'allowOutOfRange',
  'smallStep',
  'step',
  'largeStep',
  'required',
  'disabled',
  'readOnly',
  'name',
  'form',
  'value',
  'defaultValue',
  'allowWheelScrub',
  'snapOnStep',
  'format',
  'locale',
  'onValueChange',
  'onValueCommitted',
  'inputRef',
] as const;

export function NumberFieldRoot(props: NumberFieldRootProps): JSX.Element {
  const generatedId = createUniqueId();
  const disabled = () => props.disabled ?? false;
  const readOnly = () => props.readOnly ?? false;
  const required = () => props.required ?? false;
  const minWithDefault = () => props.min ?? Number.MIN_SAFE_INTEGER;
  const maxWithDefault = () => props.max ?? Number.MAX_SAFE_INTEGER;

  const [value, setValueUnwrapped] = useControlled<number | null>({
    controlled: () => props.value,
    default: () => props.defaultValue ?? null,
  });
  const [isScrubbing, setScrubbing] = createSignal(false, { ownedWrite: true });
  const [inputElement, setInputElement] = createSignal<HTMLInputElement | null>(null, {
    ownedWrite: true,
  });
  const [inputValue, setInputValue] = createSignal(
    untrack(() => formatNumber(value(), props.locale, props.format)),
    { ownedWrite: true },
  );

  const allowInputSyncRef = { current: true };
  const valueRef = { current: untrack(value) };
  const lastChangedValueRef: { current: number | null } = { current: null };
  const hasPendingCommitRef = { current: false };

  // Steps start from the value the field last rendered.
  createEffect(value, (next) => {
    valueRef.current = next;
  });

  const onValueCommitted = (
    next: number | null,
    details: NumberFieldRootCommitEventDetails,
  ): void => {
    hasPendingCommitRef.current = false;
    untrack(() => props.onValueCommitted)?.(next, details);
  };

  const getStepAmount = (event?: EventWithOptionalKeyState): number =>
    untrack(() => {
      if (event?.altKey) {
        return props.smallStep ?? 0.1;
      }
      if (event?.shiftKey) {
        return props.largeStep ?? 10;
      }
      return props.step === 'any' ? 1 : (props.step ?? 1);
    });

  const setValue = (
    unvalidatedValue: number | null,
    details: NumberFieldRootChangeEventDetails,
  ): boolean =>
    untrack(() => {
      const keyState = getKeyState(details.event);
      const direction = details.direction;
      // Direct text entry (typing, paste, clear, autofill) behaves natively;
      // steps (keys, buttons, wheel, scrub) do not.
      const isInputReason = details.reason.startsWith('input-') || details.reason === REASONS.none;
      const shouldClamp = !(props.allowOutOfRange ?? false) || !isInputReason;
      const current = value();

      const validatedValue = toValidatedNumber(
        unvalidatedValue,
        direction ? getStepAmount(keyState) * direction : undefined,
        minWithDefault(),
        maxWithDefault(),
        props.min ?? 0,
        props.format,
        props.snapOnStep ?? false,
        keyState?.altKey ?? false,
        shouldClamp,
      );

      // Text entry reports even an unchanged number: the typed text may have
      // clamped or snapped back to it.
      const shouldFireChange =
        validatedValue !== current ||
        (isInputReason && (unvalidatedValue !== current || !allowInputSyncRef.current));

      if (shouldFireChange) {
        props.onValueChange?.(validatedValue, details);
        if (details.isCanceled) {
          return false;
        }
        setValueUnwrapped(validatedValue);
        hasPendingCommitRef.current = true;
      }

      lastChangedValueRef.current = validatedValue;

      // Step changes show at once; typed text stays until it is committed.
      if (allowInputSyncRef.current) {
        setInputValue(formatNumber(validatedValue, props.locale, props.format));
      }
      return shouldFireChange;
    });

  const incrementValue = (amount: number, params: IncrementValueParameters): boolean => {
    const prevValue = params.currentValue == null ? valueRef.current : params.currentValue;
    if (typeof prevValue !== 'number') {
      // An empty field is seeded with 0, clamped into range; the seed is not
      // a step, so it carries no direction to snap by.
      return setValue(0, createChangeEventDetails(params.reason, params.event));
    }
    return setValue(
      prevValue + amount * params.direction,
      createChangeEventDetails(params.reason, params.event, undefined, {
        direction: params.direction,
      }),
    );
  };

  // The input shows the formatted value whenever it changes from outside,
  // unless the person is typing (the text then waits for blur).
  createEffect(
    () => [value(), inputValue(), props.locale, props.format] as const,
    ([next, text, locale, format]) => {
      if (!allowInputSyncRef.current) {
        return;
      }
      const formatted = formatNumber(next, locale, format);
      if (formatted !== text) {
        setInputValue(formatted);
      }
    },
  );

  // iOS's numeric keyboard has no minus key (and "numeric" no decimal key).
  const inputMode = (): InputMode => {
    if (!platform.os.ios) {
      return 'numeric';
    }
    return minWithDefault() >= 0 ? 'decimal' : 'text';
  };

  // Programmatic focus leaves the caret at the start (Chromium, Firefox) or
  // selects everything (Safari); set it at the end first. Every engine
  // restores the stored selection on `focus()`, and a selection set in
  // `onFocus` still wins.
  const focusInput = () => {
    const input = untrack(inputElement);
    if (!input) {
      return;
    }
    const length = input.value.length;
    input.setSelectionRange(length, length);
    input.focus();
  };

  // A native, non-passive listener, so the page does not scroll as the wheel steps.
  createEffect(
    () => [inputElement(), disabled(), readOnly(), props.allowWheelScrub ?? false] as const,
    ([element, isDisabled, isReadOnly, allowWheelScrub]) => {
      if (isDisabled || isReadOnly || !allowWheelScrub || !element) {
        return undefined;
      }
      return addEventListener<WheelEvent>(
        element,
        'wheel',
        (event) => {
          // Ctrl + wheel is a pinch-zoom.
          if (event.ctrlKey || activeElement(ownerDocument(element)) !== element) {
            return;
          }
          // Some browsers deliver Shift + wheel on the horizontal axis. Touchpads
          // add sub-pixel noise on the cross axis, so the axes are compared.
          const isHorizontal = Math.abs(event.deltaX) > Math.abs(event.deltaY);
          const delta = event.shiftKey && isHorizontal ? event.deltaX : event.deltaY;
          // A horizontal gesture scrolls the page (Shift's is the swapped vertical one).
          if (delta === 0 || (!event.shiftKey && isHorizontal)) {
            return;
          }
          event.preventDefault();
          allowInputSyncRef.current = true;
          // Each wheel turn is a final change: it commits when it changed the value.
          const changed = incrementValue(getStepAmount(event), {
            direction: delta > 0 ? -1 : 1,
            event,
            reason: REASONS.wheel,
          });
          if (changed) {
            onValueCommitted(
              lastChangedValueRef.current,
              createGenericEventDetails(REASONS.wheel, event),
            );
          }
        },
        { passive: false },
      );
    },
  );

  const state: NumberFieldRootState = {
    get disabled() {
      return disabled();
    },
    get readOnly() {
      return readOnly();
    },
    get required() {
      return required();
    },
    get value() {
      return value();
    },
    get inputValue() {
      return inputValue();
    },
    get scrubbing() {
      return isScrubbing();
    },
  };

  const context: NumberFieldRootContextValue = {
    state,
    get id() {
      return props.id ?? generatedId;
    },
    get min() {
      return props.min;
    },
    get max() {
      return props.max;
    },
    get minWithDefault() {
      return minWithDefault();
    },
    get maxWithDefault() {
      return maxWithDefault();
    },
    get name() {
      return props.name;
    },
    get inputMode() {
      return inputMode();
    },
    get locale() {
      return props.locale;
    },
    get format() {
      return props.format;
    },
    setValue,
    incrementValue,
    getStepAmount,
    getAllowedNonNumericKeys: () =>
      untrack(() =>
        getAllowedNonNumericKeys({
          locale: props.locale,
          format: props.format,
          minWithDefault: minWithDefault(),
          allowOutOfRange: props.allowOutOfRange ?? false,
        }),
      ),
    setInputValue: (text) => setInputValue(text),
    setInputElement: (element) => setInputElement(() => element),
    inputElement,
    focusInput,
    setScrubbing: (scrubbing) => setScrubbing(scrubbing),
    onValueCommitted,
    allowInputSyncRef,
    valueRef,
    lastChangedValueRef,
    hasPendingCommitRef,
  };

  const elementProps = omit(props, ...ROOT_PROPS);

  // Rendered inside the provider, so the parts among its children find the context.
  function RootElement() {
    return useRenderElement('div', props, {
      state,
      props: [elementProps],
      stateAttributesMapping,
    });
  }

  const onHiddenInput = (event: Event & { currentTarget: HTMLInputElement }) => {
    if (event.defaultPrevented || untrack(disabled) || untrack(readOnly)) {
      return;
    }
    // Browser autofill.
    const next = event.currentTarget.valueAsNumber;
    setValue(Number.isNaN(next) ? null : next, createChangeEventDetails(REASONS.none, event));
  };

  return (
    <NumberFieldRootContext value={context}>
      <RootElement />
      <input
        ref={props.inputRef}
        type="number"
        form={props.form}
        name={props.name}
        value={value() ?? ''}
        min={props.min}
        max={props.max}
        step={props.step}
        disabled={disabled()}
        readonly={readOnly()}
        required={required()}
        aria-hidden="true"
        tabindex={-1}
        style={props.name ? visuallyHiddenInput : visuallyHidden}
        onFocus={focusInput}
        onInput={onHiddenInput}
      />
    </NumberFieldRootContext>
  );
}

export namespace NumberFieldRoot {
  export type State = NumberFieldRootState;
  export type Props = NumberFieldRootProps;
  export type ChangeEventReason = NumberFieldRootChangeEventReason;
  export type ChangeEventDetails = NumberFieldRootChangeEventDetails;
  export type CommitEventReason = NumberFieldRootCommitEventReason;
  export type CommitEventDetails = NumberFieldRootCommitEventDetails;
}
