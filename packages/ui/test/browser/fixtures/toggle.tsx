// Fixtures for Toggle and ToggleGroup: a lone toggle (uncontrolled or
// controlled), and a toggle group whose orientation, direction, multiple,
// value ownership, disabled state and cancellation come from URL params.
import type { JSX } from '@solidjs/web';
import { createSignal } from 'solid-js';

import { DirectionProvider } from '../../../src/direction-provider/index.ts';
import type { HTMLProps } from '../../../src/internals/types.ts';
import { Toggle } from '../../../src/toggle/index.ts';
import { ToggleGroup } from '../../../src/toggle-group/index.ts';
import { log, param } from './log.ts';

function LoneToggle() {
  const cancel = param('cancel') === 'true';
  const [pressed, setPressed] = createSignal(false);
  return (
    <>
      <Toggle
        id="uncontrolled"
        disabled={param('disabled') === 'true'}
        onPressedChange={(next, details) => {
          log(`pressed ${next} ${details.reason}`);
          if (cancel) {
            details.cancel();
          }
        }}
      >
        Bold
      </Toggle>
      <Toggle
        id="controlled"
        pressed={pressed()}
        onPressedChange={(next) => log(`controlled ${next}`)}
      >
        Italic
      </Toggle>
      <button id="external" onClick={() => setPressed((value) => !value)}>
        flip
      </button>
    </>
  );
}

function Group() {
  const orientation = param('orientation') === 'vertical' ? 'vertical' : 'horizontal';
  const direction = param('direction') === 'rtl' ? 'rtl' : 'ltr';
  const controlled = param('controlled') === 'true';
  const cancel = param('cancel');
  const disabledItem = param('disabledItem');
  const defaultValue = param('defaultValue');
  const [multiple, setMultiple] = createSignal(param('multiple') === 'true');
  const [value, setValue] = createSignal<readonly string[]>([]);
  const [disabled, setDisabled] = createSignal(param('disabled') === 'true');
  return (
    <DirectionProvider direction={direction}>
      <button id="before">before</button>
      <ToggleGroup
        id="group"
        orientation={orientation}
        multiple={multiple()}
        disabled={disabled()}
        loopFocus={param('loop') !== 'false'}
        defaultValue={defaultValue ? defaultValue.split(',') : undefined}
        value={controlled ? value() : undefined}
        onValueChange={(next, details) => {
          log(`value [${next.join(',')}] ${details.reason}`);
          if (cancel === 'group') {
            details.cancel();
          }
        }}
      >
        <Toggle id="one" value="one" disabled={disabledItem === 'one'}>
          One
        </Toggle>
        <Toggle
          id="two"
          value="two"
          disabled={disabledItem === 'two'}
          onPressedChange={(_, details) => {
            if (cancel === 'toggle') {
              details.cancel();
            }
          }}
        >
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
      <button id="multiple" onClick={() => setMultiple((m) => !m)}>
        multiple
      </button>
      <button id="disable" onClick={() => setDisabled((d) => !d)}>
        disable
      </button>
    </DirectionProvider>
  );
}

function MissingValues() {
  return (
    <ToggleGroup multiple={param('multiple') === 'true'}>
      <Toggle id="first">first</Toggle>
      <Toggle id="second" value="">
        second
      </Toggle>
    </ToggleGroup>
  );
}

export const fixtures: Record<string, () => JSX.Element> = {
  toggle: () => <LoneToggle />,
  group: () => <Group />,
  'missing-values': () => <MissingValues />,
};
