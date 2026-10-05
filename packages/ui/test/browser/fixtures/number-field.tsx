// Fixtures for the number field: one field configured from the URL (bounds,
// steps, format, read-only, a canceled reason), a controlled field
// set from outside, a field committing on Enter, and a scrub area that
// unmounts mid-scrub.
// The field's `window.__set({ disabled, readOnly })` changes those later, applied
// at once (flushed), so a test can change them inside a press's own task.
// Every change and commit is logged as `change <value> <reason>` and
// `commit <value> <reason>`.
import type { JSX } from '@solidjs/web';
import { createSignal, flush, Show } from 'solid-js';

import { NumberField } from '../../../src/number-field/index.ts';
import type {
  NumberFieldRootChangeEventDetails,
  NumberFieldRootCommitEventDetails,
} from '../../../src/number-field/index.ts';
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

const onValueChange = (value: number | null, details: NumberFieldRootChangeEventDetails) => {
  log(`change ${value} ${details.reason}`);
  if (param('cancel') === details.reason) {
    details.cancel();
  }
};

const onValueCommitted = (value: number | null, details: NumberFieldRootCommitEventDetails) => {
  log(`commit ${value} ${details.reason}`);
};

interface FieldFlags {
  disabled?: boolean;
  readOnly?: boolean;
}

function Field(): JSX.Element {
  const step = param('step');
  const [disabled, setDisabled] = createSignal(flagParam('disabled'));
  const [readOnly, setReadOnly] = createSignal(flagParam('readOnly'));
  (window as unknown as { __set: (next: FieldFlags) => void }).__set = (next) => {
    if (next.disabled !== undefined) {
      setDisabled(next.disabled);
    }
    if (next.readOnly !== undefined) {
      setReadOnly(next.readOnly);
    }
    flush();
  };
  return (
    <NumberField.Root
      id="input"
      data-testid="root"
      defaultValue={numberParam('defaultValue')}
      min={numberParam('min')}
      max={numberParam('max')}
      step={step === 'any' ? 'any' : numberParam('step')}
      smallStep={numberParam('smallStep')}
      largeStep={numberParam('largeStep')}
      snapOnStep={flagParam('snapOnStep')}
      allowExpressions={flagParam('allowExpressions')}
      commitOnEnter={flagParam('commitOnEnter')}
      allowOutOfRange={flagParam('allowOutOfRange')}
      readOnly={readOnly()}
      disabled={disabled()}
      locale={param('locale') ?? undefined}
      format={formatParam()}
      onValueChange={onValueChange}
      onValueCommitted={onValueCommitted}
    >
      <NumberField.ScrubArea
        data-testid="scrub-area"
        direction={param('direction') === 'vertical' ? 'vertical' : undefined}
        pixelSensitivity={numberParam('pixelSensitivity')}
        style={{ display: 'inline-block', width: '120px', height: '24px', background: '#ddd' }}
        onClick={() => log('scrub-area click')}
      >
        <span>Amount</span>
      </NumberField.ScrubArea>
      <NumberField.Input aria-label="Amount" />
    </NumberField.Root>
  );
}

function Controlled(): JSX.Element {
  const [value, setValue] = createSignal<number | null>(5);
  const mirror = param('mirror') !== 'false';
  return (
    <>
      <NumberField.Root
        id="input"
        data-testid="root"
        value={value()}
        onValueChange={(next, details) => {
          onValueChange(next, details);
          if (mirror) {
            setValue(next);
          }
        }}
        onValueCommitted={onValueCommitted}
      >
        <NumberField.Input aria-label="Amount" />
      </NumberField.Root>
      <button id="set-42" onClick={() => setValue(42)}>
        42
      </button>
      <button id="set-null" onClick={() => setValue(null)}>
        null
      </button>
    </>
  );
}

/** Enter blurring the input, as a form-less page may compose it. */
function EnterCommits(): JSX.Element {
  return (
    <NumberField.Root
      id="input"
      defaultValue={1}
      onValueChange={onValueChange}
      onValueCommitted={onValueCommitted}
    >
      <NumberField.Input
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
  const [shown, setShown] = createSignal(true);
  return (
    <>
      <NumberField.Root id="input" data-testid="root" defaultValue={0}>
        <NumberField.Input aria-label="Amount" />
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
    </>
  );
}

export const fixtures: Record<string, () => JSX.Element> = {
  field: Field,
  controlled: Controlled,
  'enter-commits': EnterCommits,
  unmounting: Unmounting,
};
