// Upstream: packages/react/src/number-field/root/NumberFieldRoot.tsx
//
// Groups the number field's parts. The owner holds the value and hears only
// commits: a change of the field's own (typed, stepped, scrubbed) is
// validated (clamped, cleaned of float noise), shown and held until its
// commit, which reports it; the field then shows the owner's value again, so
// a value the owner takes stays and one it declines goes back. An edit that
// ends without a commit (a scrub cancelled, the field disabled, typed text
// that does not read, the part holding the edit unmounted) drops its change
// the same way. Typed text
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

interface NumberFieldRootProps extends Omit<
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

/**
 * What the field holds of its own. `none`: it shows the owner's value.
 * `editing`: an edit in progress (a scrub, typing, a step), with the change it
 * holds until it ends (`held`: none yet while typed text has not read as a
 * number) and the text the person typed (`typed`: none while stepping, the
 * held value shown formatted). `kept`: typed text that never read, kept after
 * its edit ended over the owner's value `over`, until that value changes.
 */
type Edit =
  | { readonly kind: 'none' }
  | {
      readonly kind: 'editing';
      readonly held: { readonly value: number | null } | undefined;
      readonly typed: string | undefined;
    }
  | { readonly kind: 'kept'; readonly text: string; readonly over: number | null };

const NO_EDIT: Edit = { kind: 'none' };

export function NumberFieldRoot(props: NumberFieldRootProps): JSX.Element {
  const disabled = () => props.disabled ?? false;
  const minWithDefault = () => props.min ?? Number.MIN_SAFE_INTEGER;
  const maxWithDefault = () => props.max ?? Number.MAX_SAFE_INTEGER;

  // The edit, read by the handlers as written (a write shows in the signal
  // only at the next flush) and mirrored into a signal for what renders.
  let edit: Edit = NO_EDIT;
  const [editShown, setEditShown] = createSignal<Edit>(NO_EDIT, { ownedWrite: true });
  const setEdit = (next: Edit) => {
    edit = next;
    setEditShown(() => next);
  };

  const valueOf = (of: Edit): number | null =>
    of.kind === 'editing' && of.held !== undefined ? of.held.value : props.value;
  const value = (): number | null => valueOf(editShown());
  // The value the field holds now, as the handlers last wrote it: the change
  // an edit holds, else the owner's value.
  const currentValue = (): number | null => untrack(() => valueOf(edit));
  // The text typed stays as typed; otherwise the input shows the value formatted.
  const inputValue = (): string => {
    const shown = editShown();
    if (shown.kind === 'editing' && shown.typed !== undefined) {
      return shown.typed;
    }
    if (shown.kind === 'kept' && props.value === shown.over) {
      return shown.text;
    }
    return formatNumber(value(), props.locale, props.format);
  };
  const [isScrubbing, setScrubbing] = createSignal(false, { ownedWrite: true });
  const [inputElement, setInputElement] = createSignal<HTMLInputElement | null>(null, {
    ownedWrite: true,
  });

  // Kept text gives way to the owner's next value for good.
  createEffect(
    () => props.value,
    (ownerValue) => {
      if (edit.kind === 'kept' && ownerValue !== edit.over) {
        setEdit(NO_EDIT);
      }
    },
  );

  const isTyping = () => edit.kind === 'editing' && edit.typed !== undefined;

  /** Typed text: the edit becomes (or stays) typing, its held change kept. */
  const setTypedText = (text: string) => {
    setEdit({
      kind: 'editing',
      held: edit.kind === 'editing' ? edit.held : undefined,
      typed: text,
    });
  };

  /** Typing stops (a step, a scrub, a commit begins): the held change shows formatted. */
  const stopTyping = () => {
    if (edit.kind !== 'editing' || edit.typed === undefined) {
      return;
    }
    setEdit(
      edit.held === undefined ? NO_EDIT : { kind: 'editing', held: edit.held, typed: undefined },
    );
  };

  // Every edit ends here, committed or discarded: what it held goes, and the
  // field shows the owner's value again.
  const endEdit = () => {
    setEdit(NO_EDIT);
  };

  const discardEdit = (options?: { readonly keepText?: string }) => {
    if (options?.keepText === undefined) {
      endEdit();
      return;
    }
    setEdit({ kind: 'kept', text: options.keepText, over: untrack(() => props.value) });
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
      const current = currentValue();

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
        (isInputReason && (unvalidatedValue !== current || isTyping()));

      // Step changes show at once (formatted); typed text stays until it is committed.
      if (changed) {
        setEdit({
          kind: 'editing',
          held: { value: validatedValue },
          typed: edit.kind === 'editing' ? edit.typed : undefined,
        });
      } else if (edit.kind === 'kept') {
        // A step that changes nothing still shows the value in place of kept text.
        endEdit();
      }

      return changed;
    });

  const incrementValue = (amount: number, params: IncrementValueParameters): boolean => {
    const prevValue = params.currentValue == null ? currentValue() : params.currentValue;
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
    setTypedText,
    stopTyping,
    isTyping,
    setInputElement: (element) => setInputElement(() => element),
    inputElement,
    focusInput,
    setScrubbing: (scrubbing) => setScrubbing(scrubbing),
    onValueCommitted,
    discardEdit,
    currentValue,
    hasPendingCommit: () => edit.kind === 'editing' && edit.held !== undefined,
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
