// Fixtures for the behaviour mixins (`src/mix/mix.ts`). `#toggle` mounts and
// unmounts the element under test.
// - `on-element`: a `<div>` spread with a prop mixin's attributes, a dynamic
//   `title` and an `onElement` ref factory, which logs what its setup sees
//   and its cleanup.
// - `state`: a counter mixin built in the body, spread with a title the
//   `#relabel` button changes; a press on `#counter` counts.
// - `listen`: a `<div>` with `listen` ref factories on the document (keydown)
//   and on itself (a non-passive wheel listener that prevents the scroll).
// - `parity`: the server-render parity markup (`mix-parity.tsx`).
import type { JSX } from '@solidjs/web';
import { createSignal, Show } from 'solid-js';

import { listen, mix, type Mixin, onElement } from '../../../src/mix/mix.ts';
import { log } from './log.ts';
import { Parity } from './mix-parity.tsx';

function Mounted(props: { children: JSX.Element }) {
  const [shown, setShown] = createSignal(true);
  return (
    <>
      <button id="toggle" onClick={() => setShown((s) => !s)}>
        toggle
      </button>
      <Show when={shown()}>{props.children}</Show>
    </>
  );
}

function OnElement() {
  const [title] = createSignal('dynamic');
  const behaviour = mix<HTMLDivElement>({ 'data-mixed': 'yes', class: 'mixed' });
  // Made in the body: the element has a spread, whose `ref` the server never evaluates.
  const setup = onElement<HTMLDivElement>((el) => {
    log(
      `setup connected=${el.isConnected} mixed=${el.getAttribute('data-mixed')} title=${el.title}`,
    );
    return () => log('cleanup');
  });
  return <div id="probe" {...behaviour} title={title()} ref={setup} />;
}

/** Counts presses in a signal of its own, shown as `data-count`. */
function counter(): Mixin<HTMLButtonElement> {
  const [count, setCount] = createSignal(0);
  return {
    get 'data-count'() {
      return String(count());
    },
    onClick: () => setCount((c) => c + 1),
  };
}

function State() {
  const [label, setLabel] = createSignal('first');
  const behaviour = mix<HTMLButtonElement>(counter(), {
    get title() {
      return label();
    },
  });
  return (
    <>
      <button id="counter" {...behaviour}>
        count
      </button>
      <button id="relabel" onClick={() => setLabel((l) => `${l}+`)}>
        relabel
      </button>
    </>
  );
}

function Listen() {
  return (
    <div
      id="scroller"
      style={{ height: '100px', overflow: 'auto' }}
      ref={[
        listen('document', 'keydown', (event) => log(`key ${event.key}`)),
        listen(
          'element',
          'wheel',
          (event) => {
            event.preventDefault();
            log(`wheel prevented=${event.defaultPrevented}`);
          },
          { passive: false },
        ),
      ]}
    >
      <div style={{ height: '1000px' }} />
    </div>
  );
}

export const fixtures: Record<string, () => JSX.Element> = {
  'on-element': () => (
    <Mounted>
      <OnElement />
    </Mounted>
  ),
  state: () => <State />,
  listen: () => (
    <Mounted>
      <Listen />
    </Mounted>
  ),
  parity: () => <Parity report={log} />,
};
