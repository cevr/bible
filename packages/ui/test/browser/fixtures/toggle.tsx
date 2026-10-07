// Fixtures for ToggleGroup and its toggles, owned as the lab owns them: the
// owner holds `value` and takes every offer, unless `owner=keep-one` (the
// lab's mode trays: one value always pressed, an offered `[]` ignored) or
// `owner=decline` (it takes none). `value` seeds the owner's value; the
// `set-value` button sets it to `three`. Every offer is logged as
// `value [<values>]`.
import type { JSX } from '@solidjs/web';
import { createSignal } from 'solid-js';

import type { HTMLProps } from '../../../src/internals/types.ts';
import { Toggle } from '../../../src/toggle/index.ts';
import { ToggleGroup } from '../../../src/toggle-group/index.ts';
import { log, param } from './log.ts';

function Group() {
  const owner = param('owner');
  const initial = param('value');
  const [value, setValue] = createSignal<readonly string[]>(initial ? [initial] : []);
  return (
    <>
      <button id="before">before</button>
      <ToggleGroup
        id="group"
        value={value()}
        onValueChange={(next) => {
          log(`value [${next.join(',')}]`);
          if (owner === 'decline' || (owner === 'keep-one' && next.length === 0)) {
            return;
          }
          setValue(next);
        }}
      >
        <Toggle id="one" value="one">
          One
        </Toggle>
        <Toggle id="two" value="two">
          Two
        </Toggle>
        <Toggle
          id="three"
          value="three"
          render={(props: HTMLProps) => <button {...props} data-rendered="" />}
        >
          Three
        </Toggle>
      </ToggleGroup>
      <button id="set-value" onClick={() => setValue(['three'])}>
        set
      </button>
    </>
  );
}

export const fixtures: Record<string, () => JSX.Element> = {
  group: () => <Group />,
};
