// Fixtures for the field: a number field with a label, a description and an
// error. URL params: `disabled=true` disables the field, `invalid=true` makes
// it invalid, `name` names it, `describedby` gives the input its own
// `aria-describedby`, `match=true` shows the error whatever the state.
// `window.__set({ invalid })` changes `invalid` later.
import type { JSX } from '@solidjs/web';
import { createSignal, flush } from 'solid-js';

import { Field } from '../../../src/field/index.ts';
import { NumberField } from '../../../src/number-field/index.ts';
import { param } from './log.ts';

function LabelledNumber(): JSX.Element {
  const [invalid, setInvalid] = createSignal(param('invalid') === 'true');
  (window as unknown as { __set: (next: { invalid: boolean }) => void }).__set = (next) => {
    setInvalid(next.invalid);
    flush();
  };
  return (
    <form id="form">
      <Field.Root
        id="field"
        disabled={param('disabled') === 'true'}
        invalid={invalid()}
        name={param('name') ?? undefined}
      >
        <Field.Label id="label">Offset</Field.Label>
        <NumberField.Root id="input" defaultValue={0.42} step="any">
          <NumberField.Input aria-describedby={param('describedby') ?? undefined} />
        </NumberField.Root>
        <Field.Description id="description">Seconds from the scene start</Field.Description>
        <Field.Error id="error" match={param('match') === 'true' ? true : undefined}>
          Past the scene end
        </Field.Error>
      </Field.Root>
    </form>
  );
}

export const fixtures: Record<string, () => JSX.Element> = {
  field: () => <LabelledNumber />,
};
