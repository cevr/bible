// Fixtures the hydration cases serve (`hydration.test.ts`): each is rendered
// by Solid's server build into the page, and the browser hydrates it. A
// toggle group owned as the lab owns it (the owner takes every offer, logged
// as `value [<values>]`), with `two` pressed (`pressed`) or none
// (`unpressed`). Each toggle logs the `tabindex` the browser computes for it
// at hydration, and each change of it, as `tabindex <value> <tabindex>`. Before the group,
// an element with a spread whose ref factory is made in the body (as the
// server never evaluates such an element's `ref`, solidjs/solid#4081): its
// `onElement` setup logs `setup spread`. Nothing here reads a browser global
// while rendering, so the server can render it.
import type { JSX } from '@solidjs/web';
import { createRenderEffect, createSignal } from 'solid-js';

import type { HTMLProps } from '../../../src/internals/types.ts';
import { mix, onElement } from '../../../src/mix/mix.ts';
import { Toggle } from '../../../src/toggle/index.ts';
import { ToggleGroup } from '../../../src/toggle-group/index.ts';
import { log } from './log.ts';

/** A toggle whose element logs the `tabindex` the browser gives it, and each change of it. */
function Probed(props: { value: string }): JSX.Element {
  return (
    <Toggle
      id={props.value}
      value={props.value}
      render={(merged: HTMLProps) => {
        // The effect also runs when what the value is read from changes and the value does not.
        let logged: unknown = null;
        createRenderEffect(
          () => merged['tabindex'] as unknown,
          (tabindex) => {
            if (tabindex !== logged) {
              logged = tabindex;
              log(`tabindex ${props.value} ${String(tabindex)}`);
            }
          },
        );
        return <button {...merged} />;
      }}
    >
      {props.value}
    </Toggle>
  );
}

/** The group, its owner's value starting at `initial`, after the spread element. */
const group = (initial: ReadonlyArray<string>) =>
  function Group(): JSX.Element {
    const [value, setValue] = createSignal<readonly string[]>(initial);
    const behaviour = mix<HTMLDivElement>({
      get 'data-pressed-count'() {
        return String(value().length);
      },
      'aria-label': 'spread',
    });
    // Made in the body: the server never evaluates the `ref` of an element with a spread.
    const refs = [onElement<HTMLDivElement>((el) => log(`setup ${el.id}`))];
    return (
      <main>
        <div id="spread" {...behaviour} ref={refs} />
        <ToggleGroup
          id="group"
          value={value()}
          onValueChange={(next) => {
            log(`value [${next.join(',')}]`);
            setValue(next);
          }}
        >
          <Probed value="one" />
          <Probed value="two" />
          <Probed value="three" />
        </ToggleGroup>
      </main>
    );
  };

const Pressed = group(['two']);
const Unpressed = group([]);

export const fixtures: Record<string, () => JSX.Element> = {
  pressed: () => <Pressed />,
  unpressed: () => <Unpressed />,
};
