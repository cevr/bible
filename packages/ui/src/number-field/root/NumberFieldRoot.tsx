// Upstream: packages/react/src/number-field/root/NumberFieldRoot.tsx
//
// Groups the number field's parts and owns its value: controlled or not,
// validated (snapped, clamped, cleaned of float noise) on every change, and
// shown as formatted text in the input. Typed text stays as typed until it
// is committed on blur; step changes (keys, scrub) rewrite it at once.
// Upstream's hidden `<input type="number">` for forms, its stepper buttons
// and its wheel stepping are left out: a field here commits through
// `onValueCommitted`, not a form. Renders a `<div>`.
import type { JSX } from '@solidjs/web';
import { createEffect, createSignal, createUniqueId, omit, untrack } from 'solid-js';

import { createChangeEventDetails } from '../../internals/createBaseUIEventDetails.ts';
import type { BaseUIComponentProps } from '../../internals/types.ts';
import { useRenderElement } from '../../internals/useRenderElement.tsx';
import { formatNumber } from '../../utils/formatNumber.ts';
import { platform } from '../../utils/platform.ts';
import { useControlled } from '../../utils/useControlled.ts';
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
  NumberFieldRootCommitEventDetails,
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
   * The step of the arrow keys and scrub area. `'any'` turns off step
   * validation; interactive steps then use 1.
   * @default 1
   */
  step?: number | 'any' | undefined;
  /** The step while Shift is held. @default 10 */
  largeStep?: number | undefined;
  /** Whether the field ignores user interaction. @default false */
  disabled?: boolean | undefined;
  /** Whether the user cannot change the value. @default false */
  readOnly?: boolean | undefined;
  /** The value (controlled). */
  value?: number | null | undefined;
  /** The value when first rendered (uncontrolled). */
  defaultValue?: number | undefined;
  /** Whether stepping snaps to the nearest multiple of the step. @default false */
  snapOnStep?: boolean | undefined;
  /**
   * Whether typed arithmetic is read on commit: `0.42*2`, `(1+2)/4`, and text
   * opening with `+`, `*` or `/` applied to the value before editing (`+0.1`,
   * `*2`). Not in upstream. @default false
   */
  allowExpressions?: boolean | undefined;
  /**
   * Whether Enter commits typed text as blur does (reported as `keyboard`); a
   * form still submits. Not in upstream. @default false
   */
  commitOnEnter?: boolean | undefined;
  /** The options the value is formatted with. */
  format?: Intl.NumberFormatOptions | undefined;
  /** The locale the value is formatted and parsed in; the runtime's by default. */
  locale?: Intl.LocalesArgument | undefined;
  /**
   * Called when the value changes. `details.reason` is `input-change`,
   * `input-clear`, `input-blur`, `input-paste`, `keyboard` or `scrub`.
   */
  onValueChange?:
    | ((value: number | null, details: NumberFieldRootChangeEventDetails) => void)
    | undefined;
  /**
   * Called when the value is committed: on blur after typing, on release after
   * scrubbing, and with each keyboard step.
   */
  onValueCommitted?:
    | ((value: number | null, details: NumberFieldRootCommitEventDetails) => void)
    | undefined;
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
  'disabled',
  'readOnly',
  'value',
  'defaultValue',
  'snapOnStep',
  'allowExpressions',
  'commitOnEnter',
  'format',
  'locale',
  'onValueChange',
  'onValueCommitted',
] as const;

export function NumberFieldRoot(props: NumberFieldRootProps): JSX.Element {
  const generatedId = createUniqueId();
  const disabled = () => props.disabled ?? false;
  const readOnly = () => props.readOnly ?? false;
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
      // Direct text entry (typing, paste, clear) behaves natively; steps
      // (keys, scrub) do not.
      const isInputReason = details.reason.startsWith('input-');
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

  const state: NumberFieldRootState = {
    get disabled() {
      return disabled();
    },
    get readOnly() {
      return readOnly();
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
    get inputMode() {
      return inputMode();
    },
    get locale() {
      return props.locale;
    },
    get format() {
      return props.format;
    },
    get allowExpressions() {
      return props.allowExpressions ?? false;
    },
    get commitOnEnter() {
      return props.commitOnEnter ?? false;
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

  return (
    <NumberFieldRootContext value={context}>
      <RootElement />
    </NumberFieldRootContext>
  );
}
