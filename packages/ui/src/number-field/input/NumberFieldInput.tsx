// Upstream: packages/react/src/number-field/input/NumberFieldInput.tsx
//
// The text input of the number field. Typing accepts digits (in any numeral
// system the parser reads) and the symbols the locale and format render;
// each parseable keystroke changes the value, and the text is formatted and
// committed on blur. ArrowUp/ArrowDown step (Shift: `largeStep`, Alt:
// `smallStep`), Home/End jump to `min`/`max` when set, and each such key
// commits at once. A paste is inserted at the caret.
// Not in upstream: with the root's `commitOnEnter`, Enter commits typed text
// as blur does; with `allowExpressions`, typed arithmetic (`0.42*2`, `+0.1`)
// stays as text while typing and is read on commit (see `utils/expression.ts`),
// relative to the value the field held when typing began.
// Renders an `<input>`.
import type { JSX } from '@solidjs/web';
import { omit, onCleanup, untrack } from 'solid-js';

import { createGenericEventDetails } from '../../internals/createBaseUIEventDetails.ts';
import { REASONS } from '../../internals/reasons.ts';
import type { BaseUIComponentProps, HTMLProps } from '../../internals/types.ts';
import { useRenderElement } from '../../internals/useRenderElement.tsx';
import {
  type NumberFieldRootContextValue,
  useNumberFieldRootContext,
} from '../root/NumberFieldRootContext.ts';
import type { NumberFieldRootState } from '../root/NumberFieldRootState.ts';
import {
  ANY_MINUS_DETECT_RE,
  ANY_MINUS_RE,
  ANY_PLUS_DETECT_RE,
  ANY_PLUS_RE,
  FORMAT_CONTROL_DETECT_RE,
  getNumberLocaleDetails,
  isNumeralChar,
  parseNumber,
} from '../utils/parse.ts';
import { EXPRESSION_KEYS, evaluateExpression, isExpression } from '../utils/expression.ts';
import { stateAttributesMapping } from '../utils/stateAttributesMapping.ts';
import { hasNumberFormatRoundingOptions, removeFloatingPointErrors } from '../utils/validate.ts';

const NAVIGATE_KEYS = new Set([
  'Backspace',
  'Delete',
  'ArrowLeft',
  'ArrowRight',
  'Tab',
  'Enter',
  'Escape',
]);

export interface NumberFieldInputState extends NumberFieldRootState {}

export interface NumberFieldInputProps extends BaseUIComponentProps<
  'input',
  NumberFieldInputState
> {
  /**
   * The role description assistive technology announces (not the accessible
   * name: give it a label or `aria-label`).
   * @default 'Number field'
   */
  'aria-roledescription'?: string | undefined;
}

type InputEvent<E extends Event> = E & { currentTarget: HTMLInputElement };

/** Whether every character of typed text is one the field accepts. */
function isValidCharacterString(text: string, allowed: Set<string>) {
  return Array.from(text).every(
    (ch) =>
      isNumeralChar(ch) ||
      ANY_MINUS_DETECT_RE.test(ch) ||
      allowed.has(ch) ||
      // Bidi and format controls are stripped by the parser (RTL locales put
      // them around exponent and currency signs).
      FORMAT_CONTROL_DETECT_RE.test(ch),
  );
}

/** Whether a symbol key may be typed: the input allows one of each, unless replacing it. */
function isAllowedSymbolKey(
  ctx: NumberFieldRootContextValue,
  event: KeyboardEvent,
  input: HTMLInputElement,
  inputValue: string,
): boolean {
  const allowed = ctx.getAllowedNonNumericKeys();
  let isAllowed = allowed.has(event.key);
  const { decimal, currency, percentSign } = getNumberLocaleDetails(ctx.locale, ctx.format);
  const selectionStart = input.selectionStart;
  const selectionEnd = input.selectionEnd;
  const isAllSelected = selectionStart === 0 && selectionEnd === inputValue.length;
  const selectionContainsIndex = (index: number) =>
    selectionStart != null &&
    selectionEnd != null &&
    index >= selectionStart &&
    index < selectionEnd;

  // One sign character: allowed when there is none yet, when all the text is
  // selected, or when the selection covers the sign it replaces.
  const signGroups = [
    [ANY_MINUS_DETECT_RE, ANY_MINUS_RE],
    [ANY_PLUS_DETECT_RE, ANY_PLUS_RE],
  ] as const;
  for (const [detectRe, globalRe] of signGroups) {
    if (detectRe.test(event.key) && Array.from(allowed).some((k) => detectRe.test(k))) {
      const existingIndex = inputValue.search(globalRe);
      const isReplacingExisting = existingIndex !== -1 && selectionContainsIndex(existingIndex);
      isAllowed =
        !(ANY_MINUS_DETECT_RE.test(inputValue) || ANY_PLUS_DETECT_RE.test(inputValue)) ||
        isAllSelected ||
        isReplacingExisting;
    }
  }

  // One of each symbol.
  for (const symbol of [decimal, currency, percentSign]) {
    if (event.key === symbol) {
      const symbolIndex = inputValue.indexOf(symbol);
      isAllowed = symbolIndex === -1 || isAllSelected || selectionContainsIndex(symbolIndex);
    }
  }
  return isAllowed;
}

export function NumberFieldInput(componentProps: NumberFieldInputProps): JSX.Element {
  const ctx = useNumberFieldRootContext();
  const state = ctx.state;
  const elementProps = omit(componentProps, 'class', 'style', 'render');
  // The value relative expressions apply to: the one held when typing began.
  let editBase: number | null = null;

  /** Marks the text as typed, keeping the value it was typed over. */
  const startTyping = () => {
    if (!ctx.isTyping()) {
      editBase = state.value;
      ctx.setTypedText(state.inputValue);
    }
  };

  // Unmounted mid-typing: the typed edit is dropped, not committed. A browser
  // that blurs the input as it leaves the page blurs it after this.
  let unmounted = false;
  onCleanup(() => {
    unmounted = true;
    if (ctx.isTyping()) {
      ctx.discardEdit();
    }
  });

  const typedExpression = (text: string) => ctx.allowExpressions && isExpression(text);

  /**
   * The number typed text reads as: arithmetic when allowed, else one number.
   * Arithmetic that does not read is `null` (the text stays for fixing), not
   * the number its first digits make.
   */
  const readTyped = (text: string): number | null =>
    typedExpression(text)
      ? evaluateExpression(text, editBase, ctx.locale, ctx.format)
      : parseNumber(text, ctx.locale, ctx.format);

  const commitTyped = (
    event: Event,
    changeReason: typeof REASONS.inputBlur | typeof REASONS.keyboard,
  ) => {
    const hadManualInput = ctx.isTyping();
    const hadPendingChange = ctx.hasPendingCommit();
    const value = state.value;
    const inputValue = state.inputValue;
    ctx.stopTyping();

    if (inputValue.trim() === '') {
      ctx.setValue(null, { reason: REASONS.inputClear, event });
      // An untouched empty field that nothing changed has nothing to commit.
      if (hadManualInput || hadPendingChange || value !== null) {
        ctx.onValueCommitted(null, createGenericEventDetails(REASONS.inputClear, event));
      }
      return;
    }

    const formatOptions = ctx.format;
    const parsedValue = readTyped(inputValue);
    // Text that does not read commits nothing: the edit ends, the text stays for fixing.
    if (parsedValue === null) {
      ctx.discardEdit({ keepText: inputValue });
      return;
    }

    // Intl's default precision applies only when the format asks for rounding.
    const hasRoundingOptions = hasNumberFormatRoundingOptions(formatOptions);
    let committed: number | null;
    if (!hadManualInput && !hasRoundingOptions) {
      // Untouched text is only the formatted display: keep the exact value.
      committed = value;
    } else if (hasRoundingOptions) {
      committed = removeFloatingPointErrors(parsedValue, formatOptions);
    } else {
      committed = parsedValue;
    }

    const shouldUpdateValue = value !== committed;
    const shouldCommit = hadManualInput || shouldUpdateValue || hadPendingChange;

    // Commit what `setValue` stored (clamped), not the raw text.
    let committedValue = committed;
    if (shouldUpdateValue) {
      ctx.setValue(committed, { reason: changeReason, event });
      committedValue = ctx.currentValue();
    }
    // The edit ends with the commit, and the input shows the value formatted.
    if (shouldCommit) {
      ctx.onValueCommitted(committedValue, createGenericEventDetails(changeReason, event));
    }
  };

  const onType = (event: InputEvent<Event>) => {
    const input = event.currentTarget;
    const targetValue = input.value;
    const previous = state.inputValue;
    startTyping();

    if (targetValue.trim() === '') {
      ctx.setTypedText(targetValue);
      ctx.setValue(null, { reason: REASONS.inputClear, event });
      return;
    }

    // Text that is not yet a number (a lone sign, an IME partial) is kept;
    // a parseable keystroke also reports its number.
    const allowed = ctx.getAllowedNonNumericKeys();
    if (ctx.allowExpressions) {
      for (const key of EXPRESSION_KEYS) {
        allowed.add(key);
      }
    }
    if (!isValidCharacterString(targetValue, allowed)) {
      // Rejected: put back the text the field holds, the caret where it was.
      const caret =
        (input.selectionStart ?? targetValue.length) - (targetValue.length - previous.length);
      input.value = previous;
      input.setSelectionRange(caret, caret);
      return;
    }

    // An expression waits for its commit to be read.
    if (typedExpression(targetValue)) {
      ctx.setTypedText(targetValue);
      return;
    }
    const parsedValue = parseNumber(targetValue, ctx.locale, ctx.format);
    ctx.setTypedText(targetValue);
    if (parsedValue !== null) {
      ctx.setValue(parsedValue, { reason: REASONS.inputChange, event });
    }
  };

  const onStepKey = (event: InputEvent<KeyboardEvent>) => {
    // Navigation keys and the like return without changing the value, so the
    // dirty state is read here and cleared only by the keys that change it.
    const hadManualInput = ctx.isTyping();
    const input = event.currentTarget;
    const inputValue = state.inputValue;
    // Alt + ArrowUp/ArrowDown picks `smallStep`, so Alt does not bypass them.
    const isStepKey = event.key === 'ArrowUp' || event.key === 'ArrowDown';
    const isComposing = event.isComposing || event.keyCode === 229;

    // Enter commits without stopping the event, so a form still submits.
    if (event.key === 'Enter' && ctx.commitOnEnter && !isComposing) {
      commitTyped(event, REASONS.keyboard);
      return;
    }

    if (
      // Composition (pinyin and the like); `isComposing` misses it in Safari.
      isComposing ||
      (event.altKey && !isStepKey) ||
      event.ctrlKey ||
      event.metaKey ||
      // An expression may repeat signs and separators across its numbers.
      (ctx.allowExpressions &&
        (EXPRESSION_KEYS.has(event.key) || ctx.getAllowedNonNumericKeys().has(event.key))) ||
      isAllowedSymbolKey(ctx, event, input, inputValue) ||
      isNumeralChar(event.key) ||
      NAVIGATE_KEYS.has(event.key)
    ) {
      return;
    }

    // Home/End jump to a bound, when it is defined.
    let boundaryValue: number | null = null;
    if (event.key === 'Home' && ctx.min != null) {
      boundaryValue = ctx.min;
    } else if (event.key === 'End' && ctx.max != null) {
      boundaryValue = ctx.max;
    }

    // Other named keys (PageUp, Insert, F-keys, Home/End without bounds) keep
    // their browser behaviour; other single characters are blocked below.
    if (event.key.length > 1 && !isStepKey && boundaryValue === null) {
      return;
    }

    // Unsaved typed text is the base of a step; otherwise the exact value is.
    const currentValue = hadManualInput ? readTyped(inputValue) : null;
    const amount = ctx.getStepAmount(event);

    // No text inserted, no caret moved.
    event.preventDefault();
    event.stopPropagation();

    let changed = false;
    if (isStepKey || boundaryValue !== null) {
      ctx.stopTyping();
    }
    if (isStepKey) {
      changed = ctx.incrementValue(amount, {
        direction: event.key === 'ArrowUp' ? 1 : -1,
        currentValue,
        event,
        reason: REASONS.keyboard,
      });
    } else if (boundaryValue !== null) {
      changed = ctx.setValue(boundaryValue, { reason: REASONS.keyboard, event });
    }

    // Commit the stored (clamped) value.
    if (changed) {
      ctx.onValueCommitted(ctx.currentValue(), createGenericEventDetails(REASONS.keyboard, event));
    }
  };

  const onPaste = (event: InputEvent<ClipboardEvent>) => {
    let pastedData = '';
    try {
      pastedData = event.clipboardData?.getData('text/plain') ?? '';
    } catch {
      // Unreadable clipboard text: the browser pastes as it would.
      return;
    }
    // No `input` event: the paste is spliced in here.
    event.preventDefault();

    // Inserted at the caret, replacing the selection, as a native paste would.
    const input = event.currentTarget;
    const inputValue = state.inputValue;
    const selectionStart = input.selectionStart ?? inputValue.length;
    const selectionEnd = input.selectionEnd ?? selectionStart;
    const nextText =
      inputValue.slice(0, selectionStart) + pastedData + inputValue.slice(selectionEnd);

    // A pasted expression is kept as text, like a typed one.
    const isTypedExpression = typedExpression(nextText);
    const parsedValue = isTypedExpression ? null : parseNumber(nextText, ctx.locale, ctx.format);
    if (parsedValue === null && !isTypedExpression) {
      return;
    }
    startTyping();
    if (parsedValue !== null) {
      ctx.setValue(parsedValue, { reason: REASONS.inputPaste, event });
    }
    ctx.setTypedText(nextText);
    // The caret goes just after the inserted text.
    input.value = nextText;
    const caret = selectionStart + pastedData.length;
    input.setSelectionRange(caret, caret);
  };

  const inputProps: HTMLProps = {
    get disabled() {
      return state.disabled;
    },
    get inputmode() {
      return ctx.inputMode;
    },
    get value() {
      return state.inputValue;
    },
    type: 'text',
    autocomplete: 'off',
    autocorrect: 'off',
    spellcheck: 'false',
    'aria-roledescription': 'Number field',
    ref: (element: HTMLInputElement) => ctx.setInputElement(element),
    onBlur(event: FocusEvent) {
      untrack(() => {
        if (event.defaultPrevented || state.disabled || unmounted) {
          return;
        }
        commitTyped(event, REASONS.inputBlur);
      });
    },
    onInput(event: InputEvent<Event>) {
      untrack(() => {
        if (event.defaultPrevented) {
          return;
        }
        onType(event);
      });
    },
    onKeyDown(event: InputEvent<KeyboardEvent>) {
      untrack(() => {
        if (event.defaultPrevented || state.disabled) {
          return;
        }
        onStepKey(event);
      });
    },
    onPaste(event: InputEvent<ClipboardEvent>) {
      untrack(() => {
        if (event.defaultPrevented || state.disabled) {
          return;
        }
        onPaste(event);
      });
    },
  };

  return useRenderElement('input', componentProps, {
    state,
    props: [inputProps, elementProps],
    stateAttributesMapping,
  });
}
