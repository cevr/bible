// Fixtures for ToggleGroup and its toggles, owned as the lab owns them: the
// owner holds `value` and takes every offer, unless `owner=keep-one` (the
// lab's mode trays: one value always pressed, an offered `[]` ignored) or
// `owner=decline` (it takes none). `value` seeds the owner's value; the
// `set-value` button sets it to `three`. Every offer is logged as
// `value [<values>]`; the field after the group logs `field blur`; `#grip`
// after it is an SVG control that takes focus (the Lab's wipe grip).
// `in-dialog` puts all of it in a popup that takes focus (`tabindex="-1"`),
// as the lab's sheets are; `in-details` in an open `<details>` given a
// `tabindex`; `later` mounts it when `#show` is pressed.
import type { JSX } from '@solidjs/web';
import { createSignal, Show } from 'solid-js';

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
      <input id="field" aria-label="field" onBlur={() => log('field blur')} />
      <svg width="20" height="20" aria-label="wipe">
        <circle
          id="grip"
          cx="10"
          cy="10"
          r="10"
          role="slider"
          tabindex="0"
          aria-label="grip"
          aria-valuenow={50}
        />
      </svg>
    </>
  );
}

function Later() {
  const [shown, setShown] = createSignal(false);
  return (
    <>
      <button id="show" onClick={() => setShown(true)}>
        show
      </button>
      <Show when={shown()}>
        <Group />
      </Show>
    </>
  );
}

export const fixtures: Record<string, () => JSX.Element> = {
  group: () => <Group />,
  'in-dialog': () => (
    <div id="dialog" role="dialog" aria-label="sheet" tabindex="-1">
      <Group />
    </div>
  ),
  'in-details': () => (
    <details id="details" open tabindex="-1">
      <summary>details</summary>
      <Group />
    </details>
  ),
  later: () => <Later />,
};
