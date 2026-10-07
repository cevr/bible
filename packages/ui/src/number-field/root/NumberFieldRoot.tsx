// Upstream: packages/react/src/number-field/root/NumberFieldRoot.tsx
//
// Groups the number field's parts. The owner holds the value and hears only
// commits: a change of the field's own (typed, stepped, scrubbed) is
// validated (clamped, cleaned of float noise), shown and held until its
// commit, which reports it; the field then shows the owner's value again, so
// a value the owner takes stays and one it declines goes back. An edit that
// ends without a commit (a scrub cancelled or unmounted, the field disabled,
// typed text that does not read) drops its change the same way. Typed text
// stays as typed until it is committed on blur; steps (keys, scrub) rewrite
// it at once.
// Upstream's uncontrolled mode, `onValueChange`, the hidden
// `<input type="number">` for forms, its stepper buttons and its wheel
// stepping are left out. Renders a `<div>`.
import type { JSX } from '@solidjs/web';
import { createEffect, createSignal, omit, untrack } from 'solid-js';

import type { BaseUIComponentProps } from '../../internals/types.ts';
import { useRenderElement } from '../../internals/useRenderElement.tsx';
import { formatNumber } from '../../utils/formatNumber.ts';
import { platform } from '../../utils/platform.ts';
import { stateAttributesMapping } from '../utils/stateAttributesMapping.ts';
import type {
  EventWithOptionalKeyState,
  IncrementValueParameters,
  ValueChange,
} from '../utils/types.ts';
import { toValidatedNumber } from '../utils/validate.ts';
import { getAllowedNonNumericKeys } from './allowedNonNumericKeys.ts';
import {
  type InputMode,
  NumberFieldRootContext,
  type NumberFieldRootContextValue,
} from './NumberFieldRootContext.ts';
import type {
  NumberFieldRootCommitEventDetails,
  NumberFieldRootState,
} from './NumberFieldRootState.ts';

export interface NumberFieldRootProps extends Omit<
  BaseUIComponentProps<'div', NumberFieldRootState>,
  'onChange'
> {
  /** The owner's value, shown whenever the field holds no uncommitted change. */
  value: number | null;
  /** The minimum value. */
  min?: number | undefined;
  /** The maximum value. */
  max?: number | undefined;
  /** The step while Alt is held. @default 0.1 */
  smallStep?: number | undefined;
  /** The step of the arrow keys and scrub area. @default 1 */
  step?: number | undefined;
  /** The step while Shift is held. @default 10 */
  largeStep?: number | undefined;
  /** Whether the field ignores user interaction. @default false */
  disabled?: boolean | undefined;
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
  'value',
  'min',
  'max',
  'smallStep',
  'step',
  'largeStep',
  'disabled',
  'allowExpressions',
  'commitOnEnter',
  'format',
  'locale',
  'onValueCommitted',
] as const;

/** The change an edit (a scrub, typing, a step) holds until it ends. */
interface Pending {
  readonly value: number | null;
}

export function NumberFieldRoot(props: NumberFieldRootProps): JSX.Element {
  const disabled = () => props.disabled ?? false;
  const minWithDefault = () => props.min ?? Number.MIN_SAFE_INTEGER;
  const maxWithDefault = () => props.max ?? Number.MAX_SAFE_INTEGER;

  const [pending, setPending] = createSignal<Pending | undefined>(undefined, {
    ownedWrite: true,
  });
  const value = (): number | null => {
    const held = pending();
    return held === undefined ? props.value : held.value;
  };
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

  // Steps start from the value the field last rendered.
  createEffect(value, (next) => {
    valueRef.current = next;
  });

  // Typed text that never read, kept after its edit ended: the owner's value it
  // was left over, shown again once that value changes.
  let keptText: { readonly over: number | null } | null = null;

  // Every edit ends here, committed or discarded: its held change goes, and the
  // field shows the owner's value again.
  const endEdit = () => {
    allowInputSyncRef.current = true;
    keptText = null;
    setPending(undefined);
  };

  const discardEdit = (options?: { readonly keepText?: boolean }) => {
    endEdit();
    if (options?.keepText) {
      keptText = { over: untrack(() => props.value) };
    }
  };

  const onValueCommitted = (
    next: number | null,
    details: NumberFieldRootCommitEventDetails,
  ): void => {
    endEdit();
    untrack(() => props.onValueCommitted)?.(next, details);
  };

  // A field disabled mid-edit drops the edit: a disabled field commits nothing.
  createEffect(disabled, (isDisabled) => {
    if (isDisabled) {
      endEdit();
    }
  });

  const getStepAmount = (event?: EventWithOptionalKeyState): number =>
    untrack(() => {
      if (event?.altKey) {
        return props.smallStep ?? 0.1;
      }
      if (event?.shiftKey) {
        return props.largeStep ?? 10;
      }
      return props.step ?? 1;
    });

  const setValue = (unvalidatedValue: number | null, change: ValueChange): boolean =>
    untrack(() => {
      const isInputReason = change.reason.startsWith('input-');
      const current = value();

      const validatedValue = toValidatedNumber(
        unvalidatedValue,
        change.direction !== undefined,
        minWithDefault(),
        maxWithDefault(),
        props.format,
      );

      // Text entry holds even an unchanged number: the typed text may have
      // clamped back to it.
      const changed =
        validatedValue !== current ||
        (isInputReason && (unvalidatedValue !== current || !allowInputSyncRef.current));

      if (changed) {
        setPending({ value: validatedValue });
      }

      lastChangedValueRef.current = validatedValue;

      // Step changes show at once; typed text stays until it is committed.
      if (allowInputSyncRef.current) {
        setInputValue(formatNumber(validatedValue, props.locale, props.format));
      }
      return changed;
    });

  const incrementValue = (amount: number, params: IncrementValueParameters): boolean => {
    const prevValue = params.currentValue == null ? valueRef.current : params.currentValue;
    if (typeof prevValue !== 'number') {
      // An empty field is seeded with 0, clamped into range; the seed is not a step.
      return setValue(0, { reason: params.reason, event: params.event });
    }
    return setValue(prevValue + amount * params.direction, {
      reason: params.reason,
      event: params.event,
      direction: params.direction,
    });
  };

  // The input shows the formatted value whenever it changes from outside,
  // unless the person is typing (the text then waits for blur) or the text
  // that never read is kept over that same value.
  createEffect(
    () => [value(), inputValue(), props.locale, props.format] as const,
    ([next, text, locale, format]) => {
      if (!allowInputSyncRef.current) {
        return;
      }
      if (keptText) {
        if (next === keptText.over) {
          return;
        }
        keptText = null;
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
        }),
      ),
    setInputValue: (text) => setInputValue(text),
    setInputElement: (element) => setInputElement(() => element),
    inputElement,
    focusInput,
    setScrubbing: (scrubbing) => setScrubbing(scrubbing),
    onValueCommitted,
    discardEdit,
    allowInputSyncRef,
    valueRef,
    lastChangedValueRef,
    hasPendingCommit: () => untrack(pending) !== undefined,
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
