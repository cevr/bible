// Fixtures for Toolbar: roving focus per orientation and direction, disabled
// items (focusable or not), the text input's caret, a custom-element button,
// toggle groups inside a toolbar, and the separator.
import type { JSX } from '@solidjs/web';
import { createSignal } from 'solid-js';

import { DirectionProvider } from '../../../src/direction-provider/index.ts';
import type { HTMLProps } from '../../../src/internals/types.ts';
import { Toggle } from '../../../src/toggle/index.ts';
import { ToggleGroup } from '../../../src/toggle-group/index.ts';
import { Toolbar } from '../../../src/toolbar/index.ts';
import { log, param } from './log.ts';

const orientationParam = () => (param('orientation') === 'vertical' ? 'vertical' : 'horizontal');
const directionParam = () => (param('direction') === 'rtl' ? 'rtl' : 'ltr');

function Navigation() {
  return (
    <DirectionProvider direction={directionParam()}>
      <button id="before">before</button>
      <Toolbar.Root
        id="toolbar"
        orientation={orientationParam()}
        loopFocus={param('loop') !== 'false'}
      >
        <Toolbar.Button id="one">one</Toolbar.Button>
        <Toolbar.Separator id="sep" />
        <Toolbar.Link id="two" href="#two">
          two
        </Toolbar.Link>
        <Toolbar.Button id="three">three</Toolbar.Button>
      </Toolbar.Root>
      <button id="after">after</button>
    </DirectionProvider>
  );
}

function DisabledToolbar() {
  return (
    <Toolbar.Root disabled>
      <Toolbar.Button id="button">b</Toolbar.Button>
      <Toolbar.Link id="link" href="#a">
        Link
      </Toolbar.Link>
      <Toolbar.Input id="input" value="" />
      <Toolbar.Group id="group">
        <Toolbar.Button id="g-button">b</Toolbar.Button>
        <Toolbar.Link id="g-link" href="#b">
          Link
        </Toolbar.Link>
        <Toolbar.Input id="g-input" value="" />
      </Toolbar.Group>
    </Toolbar.Root>
  );
}

function FocusableWhenDisabled() {
  const individual = param('individual') === 'true';
  return (
    <>
      <button id="before">before</button>
      <Toolbar.Root>
        <Toolbar.Button id="b1" disabled>
          b1
        </Toolbar.Button>
        <Toolbar.Group>
          <Toolbar.Button id="g1" disabled>
            g1
          </Toolbar.Button>
          <Toolbar.Button id="g2" disabled focusableWhenDisabled={!individual}>
            g2
          </Toolbar.Button>
        </Toolbar.Group>
        <Toolbar.Input id="input" value="" disabled />
      </Toolbar.Root>
    </>
  );
}

function DisabledFirst() {
  const enabledButUnfocusable = param('enabled') === 'true';
  return (
    <>
      <button id="before">before</button>
      <Toolbar.Root>
        <Toolbar.Button id="b1" disabled={!enabledButUnfocusable} focusableWhenDisabled={false}>
          b1
        </Toolbar.Button>
        <Toolbar.Button id="b2">b2</Toolbar.Button>
        <Toolbar.Button id="b3">b3</Toolbar.Button>
      </Toolbar.Root>
    </>
  );
}

function DisabledButton() {
  return (
    <Toolbar.Root>
      <Toolbar.Button
        id="button"
        disabled
        focusableWhenDisabled={param('focusable') !== 'false'}
        onClick={() => log('click')}
        onMouseDown={() => log('mousedown')}
        onPointerDown={() => log('pointerdown')}
        onKeyDown={() => log('keydown')}
        onMouseMove={() => log('mousemove')}
      >
        b
      </Toolbar.Button>
    </Toolbar.Root>
  );
}

function CustomElementButton() {
  return (
    <div onClick={() => log('ancestor click')}>
      <button id="before">before</button>
      <Toolbar.Root>
        <Toolbar.Button
          id="save"
          nativeButton={false}
          render={(props: HTMLProps) => <span {...props} />}
          onClick={() => log('click')}
        >
          Save
        </Toolbar.Button>
      </Toolbar.Root>
    </div>
  );
}

function Input() {
  const [disabled, setDisabled] = createSignal(param('disabled') === 'true');
  return (
    <DirectionProvider direction={directionParam()}>
      <button id="before">before</button>
      <Toolbar.Root orientation={orientationParam()}>
        <Toolbar.Button id="b1">b1</Toolbar.Button>
        <Toolbar.Input
          id="input"
          value="abcd"
          disabled={disabled()}
          focusableWhenDisabled={param('focusable') !== 'false'}
        />
        <Toolbar.Input
          id="checkbox"
          type="checkbox"
          disabled={disabled()}
          onChange={() => log('checkbox change')}
        />
        <Toolbar.Button id="b2">b2</Toolbar.Button>
      </Toolbar.Root>
      <button id="after">after</button>
      <button id="enable" tabindex={-1} onClick={() => setDisabled(false)}>
        enable
      </button>
    </DirectionProvider>
  );
}

function Toggles() {
  const controlled = param('controlled') === 'true';
  const [value, setValue] = createSignal<readonly string[]>([]);
  const [twoDisabled, setTwoDisabled] = createSignal(param('twoDisabled') === 'true');
  return (
    <>
      <button id="outside">outside</button>
      <Toolbar.Root>
        <Toolbar.Button id="before">before</Toolbar.Button>
        <Toolbar.Group disabled={param('groupDisabled') === 'true'}>
          <ToggleGroup
            id="group"
            multiple={param('multiple') === 'true'}
            defaultValue={controlled ? undefined : ['one']}
            value={controlled ? value() : undefined}
            onValueChange={(next) => {
              log(`value [${next.join(',')}]`);
              setValue(next);
            }}
          >
            <Toggle id="one" value="one">
              one
            </Toggle>
            <Toggle id="two" value="two" disabled={twoDisabled()}>
              two
            </Toggle>
            <Toggle id="three" value="three">
              three
            </Toggle>
          </ToggleGroup>
        </Toolbar.Group>
        <Toolbar.Button id="after">after</Toolbar.Button>
      </Toolbar.Root>
      <button id="disable-two" tabindex={-1} onClick={() => setTwoDisabled(true)}>
        disable two
      </button>
    </>
  );
}

function Separators() {
  return (
    <>
      <Toolbar.Root orientation="horizontal">
        <Toolbar.Separator id="in-horizontal" />
        <Toolbar.Separator id="overridden" orientation="horizontal" />
      </Toolbar.Root>
      <Toolbar.Root orientation="vertical">
        <Toolbar.Separator id="in-vertical" />
      </Toolbar.Root>
    </>
  );
}

export const fixtures: Record<string, () => JSX.Element> = {
  navigation: () => <Navigation />,
  disabled: () => <DisabledToolbar />,
  'focusable-when-disabled': () => <FocusableWhenDisabled />,
  'disabled-first': () => <DisabledFirst />,
  'disabled-button': () => <DisabledButton />,
  'custom-element': () => <CustomElementButton />,
  input: () => <Input />,
  toggles: () => <Toggles />,
  separators: () => <Separators />,
};
