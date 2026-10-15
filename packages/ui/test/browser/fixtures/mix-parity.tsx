// The markup the server-render parity case renders twice: with Solid's server
// build into a string (`mix-ssr.test.ts`) and with its DOM build in the page
// (`mix.tsx`, fixture `parity`). It reads no browser global, so the server
// can load it. Prop mixins carry every attribute (`role`, ARIA, `tabindex`,
// `data-*`, `class`, `style`), one entry is falsy, and a toggle group's
// toggles carry the button mixin. The element has a spread, so its ref
// factories are made in the body: `report` hears each made (on both sides),
// and each ref callback and `onElement` setup (in the browser alone).
import type { JSX } from '@solidjs/web';
import { createSignal } from 'solid-js';

import { mix, type Mixin, onElement, type RefFactory } from '../../../src/mix/mix.ts';
import { Toggle } from '../../../src/toggle/index.ts';
import { ToggleGroup } from '../../../src/toggle-group/index.ts';

/** `role="switch"` state as ARIA and a data attribute. */
function switchable(on: () => boolean): Mixin<HTMLDivElement> {
  return {
    role: 'switch',
    tabindex: 0,
    get 'aria-checked'() {
      return on() ? 'true' : 'false';
    },
    get 'data-on'() {
      return on() ? '' : undefined;
    },
  };
}

/** A ref factory that reports being made (on both sides) and being called (in the browser). */
function reporting(report: (line: string) => void): RefFactory<HTMLDivElement> {
  report('made');
  return (el) => report(`ref ${el.id}`);
}

export function Parity(props: { report: (line: string) => void }): JSX.Element {
  const [on] = createSignal(true);
  const behaviour = mix<HTMLDivElement>(
    switchable(on),
    { class: 'base', style: { color: 'red' }, 'aria-label': 'parity', title: 'left' },
    false,
    { class: 'caller', style: 'margin: 1px', title: 'right', 'data-caller': 'yes' },
  );
  // Made in the body: the server never evaluates the `ref` of an element with a spread.
  const refs = [
    reporting(props.report),
    onElement<HTMLDivElement>((el) => props.report(`setup ${el.id}`)),
  ];
  return (
    <main>
      <div id="parity" {...behaviour} ref={refs} />
      <ToggleGroup id="group" value={['two']} onValueChange={() => undefined}>
        <Toggle id="one" value="one">
          One
        </Toggle>
        <Toggle id="two" value="two">
          Two
        </Toggle>
      </ToggleGroup>
    </main>
  );
}
