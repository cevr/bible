// Fixtures for the foundations: `useRender`, state attributes, the render
// prop, refs, `enabled`, and the direction provider.
import type { JSX } from '@solidjs/web';
import { createSignal, omit } from 'solid-js';

import { DirectionProvider, useDirection } from '../../../src/direction-provider/index.ts';
import type { BaseUIEvent, HTMLProps } from '../../../src/internals/types.ts';
import { useRenderElement } from '../../../src/internals/useRenderElement.tsx';
import { useRender } from '../../../src/use-render/index.ts';
import { log } from './log.ts';

function Defaults() {
  return (
    <>
      {useRender({ props: { id: 'plain', children: 'plain' } })}
      {useRender({ defaultTagName: 'span', props: { id: 'span', children: 'span' } })}
      {useRender({
        defaultTagName: 'span',
        render: (props) => <b {...props} />,
        props: { id: 'rendered', children: 'rendered' },
      })}
      {useRender({ defaultTagName: 'button', props: { id: 'button', children: 'button' } })}
    </>
  );
}

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
      {useRender({
        state,
        props: [{ id: 'state', 'data-extra': 'yes', 'data-orientation': 'vertical' }],
      })}
      {useRender({
        state: { checkedState: true },
        stateAttributesMapping: {
          checkedState: (value: boolean) => (value ? { 'data-checked-state': 'on' } : null),
        },
        props: { id: 'mapped' },
      })}
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
      {useRender({
        ref: (el: HTMLElement) => {
          fromParams = el;
          log(`params ref ${el.tagName.toLowerCase()}`);
        },
        props: {
          id: 'with-ref',
          ref: (el: HTMLElement) => log(`props ref ${el.tagName.toLowerCase()}`),
        },
      })}
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
      {useRender({
        get enabled() {
          return enabled();
        },
        props: { id: 'toggled', children: 'here' },
      })}
      <button id="toggle" onClick={() => setEnabled((value) => !value)}>
        toggle
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

export const foundations: Record<string, () => JSX.Element> = {
  defaults: () => <Defaults />,
  'state-attributes': () => <StateAttributes />,
  'class-style': () => <ClassStyle />,
  refs: () => <Refs />,
  enabled: () => <Enabled />,
  direction: () => <Direction />,
};
