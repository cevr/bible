// Fixtures for the number field. Every field is owned as the lab owns one:
// the owner holds `value` and takes each commit, unless `mirror=false` (an
// owner that declines every commit). `field` reads its value, bounds, steps,
// format, locale and flags from the URL; its buttons set the owner's value
// to 42 or null. `enter-commits` blurs on Enter, `unmounting` drops its
// scrub area mid-scrub, and `unmounting-parts` drops its input or its root
// when the test asks.
// `window.__set({ disabled })` changes the field's `disabled` later, applied
// at once (flushed), so a test can change it inside a press's own task;
// `window.__flush()` applies pending writes, so a test can read the input
// right after an event it dispatches.
// Every commit is logged as `commit <value> <reason>`.
import type { JSX } from '@solidjs/web';
import { createSignal, flush, Show } from 'solid-js';

import { NumberField } from '../../../src/number-field/index.ts';
import type { NumberFieldRootCommitEventDetails } from '../../../src/number-field/index.ts';
import { log, param } from './log.ts';

const numberParam = (name: string): number | undefined => {
  const value = param(name);
  return value === null ? undefined : Number(value);
};

const flagParam = (name: string): boolean | undefined => {
  const value = param(name);
  return value === null ? undefined : value === 'true';
};

const formatParam = (): Intl.NumberFormatOptions | undefined => {
  const value = param('format');
  return value === null ? undefined : (JSON.parse(value) as Intl.NumberFormatOptions);
};

interface FieldFlags {
  disabled?: boolean;
}

const testWindow = window as unknown as {
  __set: (next: FieldFlags) => void;
  __flush: () => void;
};

/** The owner's value, which takes each commit unless `mirror=false`. */
function owner(initial: number | null) {
  const [value, setValue] = createSignal<number | null>(initial);
  const mirror = param('mirror') !== 'false';
  const onValueCommitted = (next: number | null, details: NumberFieldRootCommitEventDetails) => {
    log(`commit ${next} ${details.reason}`);
    if (mirror) {
      setValue(next);
    }
  };
  return { value, setValue, onValueCommitted };
}

function Field(): JSX.Element {
  const held = owner(numberParam('value') ?? null);
  const [disabled, setDisabled] = createSignal(flagParam('disabled'));
  testWindow.__set = (next) => {
    if (next.disabled !== undefined) {
      setDisabled(next.disabled);
    }
    flush();
  };
  testWindow.__flush = flush;
  return (
    <>
      <NumberField.Root
        data-testid="root"
        value={held.value()}
        min={numberParam('min')}
        max={numberParam('max')}
        step={numberParam('step')}
        smallStep={numberParam('smallStep')}
        largeStep={numberParam('largeStep')}
        allowExpressions={flagParam('allowExpressions')}
        commitOnEnter={flagParam('commitOnEnter')}
        disabled={disabled()}
        locale={param('locale') ?? undefined}
        format={formatParam()}
        onValueCommitted={held.onValueCommitted}
      >
        <NumberField.ScrubArea
          data-testid="scrub-area"
          style={{ display: 'inline-block', width: '120px', height: '24px', background: '#ddd' }}
          onClick={() => log('scrub-area click')}
        >
          <span>Amount</span>
        </NumberField.ScrubArea>
        <NumberField.Input id="input" aria-label="Amount" />
      </NumberField.Root>
      <button id="set-42" onClick={() => held.setValue(42)}>
        42
      </button>
      <button id="set-null" onClick={() => held.setValue(null)}>
        null
      </button>
    </>
  );
}

/** Enter blurring the input, as a form-less page may compose it. */
function EnterCommits(): JSX.Element {
  const held = owner(1);
  return (
    <NumberField.Root value={held.value()} onValueCommitted={held.onValueCommitted}>
      <NumberField.Input
        id="input"
        aria-label="Amount"
        onKeyDown={(event: KeyboardEvent & { currentTarget: HTMLInputElement }) => {
          if (event.key === 'Enter') {
            event.currentTarget.blur();
          }
        }}
      />
    </NumberField.Root>
  );
}

function Unmounting(): JSX.Element {
  const held = owner(0);
  const [shown, setShown] = createSignal(true);
  return (
    <NumberField.Root
      data-testid="root"
      value={held.value()}
      onValueCommitted={held.onValueCommitted}
    >
      <NumberField.Input id="input" aria-label="Amount" />
      <Show when={shown()}>
        <NumberField.ScrubArea
          data-testid="scrub-area"
          style={{ display: 'inline-block', width: '120px', height: '24px' }}
          onPointerMove={(event: PointerEvent) => {
            if (event.buttons !== 0) {
              setShown(false);
            }
          }}
        >
          scrub
        </NumberField.ScrubArea>
      </Show>
    </NumberField.Root>
  );
}

/**
 * A field (with the URL's `format` and `allowExpressions`) whose input, or whole root, the page
 * drops and brings back: `window.__show({ input, root })`, applied at once.
 */
function UnmountingParts(): JSX.Element {
  const held = owner(5);
  const [input, setInput] = createSignal(true);
  const [root, setRoot] = createSignal(true);
  (window as unknown as { __show: (next: { input?: boolean; root?: boolean }) => void }).__show = (
    next,
  ) => {
    if (next.input !== undefined) {
      setInput(next.input);
    }
    if (next.root !== undefined) {
      setRoot(next.root);
    }
    flush();
  };
  return (
    <Show when={root()}>
      <NumberField.Root
        value={held.value()}
        format={formatParam()}
        allowExpressions={flagParam('allowExpressions')}
        onValueCommitted={held.onValueCommitted}
      >
        <Show when={input()}>
          <NumberField.Input id="input" aria-label="Amount" />
        </Show>
      </NumberField.Root>
    </Show>
  );
}

export const fixtures: Record<string, () => JSX.Element> = {
  field: Field,
  'enter-commits': EnterCommits,
  unmounting: Unmounting,
  'unmounting-parts': UnmountingParts,
};
