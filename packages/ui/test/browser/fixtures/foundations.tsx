// Fixtures for the foundations: `useRenderElement` (state attributes, the
// render prop, refs, `enabled`, live params), a late `children` key, and the
// direction provider.
import type { JSX } from '@solidjs/web';
import { createSignal, createStore, omit } from 'solid-js';

import { DirectionProvider, useDirection } from '../../../src/direction-provider/index.ts';
import type { BaseUIEvent, HTMLProps } from '../../../src/internals/types.ts';
import { useRenderElement } from '../../../src/internals/useRenderElement.tsx';
import { mergeProps } from '../../../src/merge-props/index.ts';
import { log } from './log.ts';

function StateAttributes() {
  const [count, setCount] = createSignal(0);
  const state = {
    get active() {
      return count() % 2 === 1;
    },
    get count() {
      return count();
    },
    missing: undefined,
    get orientation() {
      return 'horizontal';
    },
    camelCase: true,
  };
  return (
    <>
      {useRenderElement(
        'div',
        {},
        {
          state,
          props: [{ id: 'state', 'data-extra': 'yes', 'data-orientation': 'vertical' }],
        },
      )}
      <button id="bump" onClick={() => setCount((c) => c + 1)}>
        bump
      </button>
    </>
  );
}

interface PartProps {
  class?: string | ((state: { on: boolean }) => string | undefined);
  style?: JSX.CSSProperties | ((state: { on: boolean }) => JSX.CSSProperties | undefined);
  render?: (props: HTMLProps, state: { on: boolean }) => JSX.Element;
  id?: string;
  onClick?: (event: BaseUIEvent<MouseEvent>) => void;
  children?: JSX.Element;
}

/** A part as the ported ones are built: internal props under the user's. */
function Part(props: PartProps) {
  const [on, setOn] = createSignal(false);
  const state = {
    get on() {
      return on();
    },
  };
  return useRenderElement('div', props, {
    state,
    props: [
      {
        class: 'internal',
        style: { color: 'blue' },
        onClick() {
          log('internal click');
          setOn((value) => !value);
        },
      },
      omit(props, 'class', 'style', 'render') as HTMLProps,
    ],
  });
}

function ClassStyle() {
  return (
    <>
      <Part id="fn-class" class={(state) => (state.on ? 'on' : 'off')} style={{ margin: '1px' }}>
        class
      </Part>
      <Part
        id="fn-style"
        style={(state) => (state.on ? { 'font-weight': '700' } : undefined)}
        class={() => undefined}
      >
        style
      </Part>
      <Part
        id="prevent"
        onClick={(event) => {
          log('user click');
          event.preventBaseUIHandler();
        }}
      >
        prevent
      </Part>
      <Part
        id="render-part"
        render={(props, state) => <section {...props} data-on={String(state.on)} />}
      >
        render
      </Part>
    </>
  );
}

function Refs() {
  let fromParams: HTMLElement | undefined;
  return (
    <>
      {useRenderElement(
        'div',
        {},
        {
          ref: (el: HTMLElement) => {
            fromParams = el;
            log(`params ref ${el.tagName.toLowerCase()}`);
          },
          props: {
            id: 'with-ref',
            ref: (el: HTMLElement) => log(`props ref ${el.tagName.toLowerCase()}`),
          },
        },
      )}
      <button id="check" onClick={() => log(`same ${fromParams?.id}`)}>
        check
      </button>
    </>
  );
}

function Enabled() {
  const [enabled, setEnabled] = createSignal(true);
  return (
    <>
      {useRenderElement(
        'div',
        {},
        {
          get enabled() {
            return enabled();
          },
          props: { id: 'toggled', children: 'here' },
        },
      )}
      <button id="toggle" onClick={() => setEnabled((value) => !value)}>
        toggle
      </button>
    </>
  );
}

/** `params.props` and `params.state` as getters returning a fresh record each time. */
function LiveParams() {
  const [count, setCount] = createSignal(0);
  const params = (id: string) => ({
    get state() {
      return { value: count() };
    },
    get props() {
      return { id, disabled: count() > 0 };
    },
  });
  // Built once, outside the JSX, so only the views can bring the new values.
  const plain = useRenderElement('button', {}, params('getter-props'));
  const rendered = useRenderElement(
    'button',
    {
      render: (props: HTMLProps, state: { value: number }) => (
        <button {...props} data-render-value={String(state.value)} />
      ),
    },
    params('getter-render'),
  );
  return (
    <>
      {plain}
      {rendered}
      <button id="bump" onClick={() => setCount((c) => c + 1)}>
        bump
      </button>
    </>
  );
}

/** A merged store whose `children` key is absent until the button adds it. */
function LateChildren() {
  const [store, setStore] = createStore<{ children?: string }>({});
  // The spread alone, as a part spreads its merged props.
  const merged = mergeProps({ id: 'late' }, store);
  return (
    <>
      <div {...merged} />
      <button
        id="add"
        onClick={() =>
          setStore((draft) => {
            draft.children = 'added';
          })
        }
      >
        add
      </button>
    </>
  );
}

function DirectionProbe(props: { id: string }) {
  return <span id={props.id}>{useDirection()}</span>;
}

function Direction() {
  const [direction, setDirection] = createSignal<'ltr' | 'rtl'>('rtl');
  return (
    <>
      <DirectionProbe id="outside" />
      <DirectionProvider direction={direction()}>
        <DirectionProbe id="inside" />
      </DirectionProvider>
      <button id="flip" onClick={() => setDirection((d) => (d === 'rtl' ? 'ltr' : 'rtl'))}>
        flip
      </button>
    </>
  );
}

export const fixtures: Record<string, () => JSX.Element> = {
  'state-attributes': () => <StateAttributes />,
  'class-style': () => <ClassStyle />,
  refs: () => <Refs />,
  enabled: () => <Enabled />,
  direction: () => <Direction />,
  'live-params': () => <LiveParams />,
  'late-children': () => <LateChildren />,
};
