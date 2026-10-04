// Fixtures for Tabs: three tabs (values 0, 1, 2) with panels and an
// indicator. URL params set the orientation, direction, activation mode,
// value ownership, default value, disabled tabs, keepMounted panels and
// cancellation; buttons change the value, disable or remove tabs and resize
// one from outside.
import type { JSX } from '@solidjs/web';
import { For, createSignal } from 'solid-js';

import { DirectionProvider } from '../../../src/direction-provider/index.ts';
import type { HTMLProps } from '../../../src/internals/types.ts';
import { Tabs } from '../../../src/tabs/index.ts';
import { log, param } from './log.ts';

const parseValue = (raw: string | null): unknown => {
  if (raw === null) {
    return undefined;
  }
  if (raw === 'null') {
    return null;
  }
  return Number(raw);
};

function TabsDemo() {
  const controlled = param('controlled') === 'true';
  const cancel = param('cancel') === 'true';
  const keepMounted = param('keepMounted') === 'true';
  const anchors = param('anchors') === 'true';
  const defaultValue = parseValue(param('defaultValue'));
  const [value, setValue] = createSignal<unknown>(defaultValue ?? 0);
  const [disabled, setDisabled] = createSignal<ReadonlyArray<number>>(
    (param('disabled') ?? '').split(',').filter(Boolean).map(Number),
  );
  const [tabs, setTabs] = createSignal<ReadonlyArray<number>>([0, 1, 2]);
  const [wide, setWide] = createSignal(false);

  return (
    <DirectionProvider direction={param('direction') === 'rtl' ? 'rtl' : 'ltr'}>
      <button id="before">before</button>
      <Tabs.Root
        id="tabs-root"
        orientation={param('orientation') === 'vertical' ? 'vertical' : 'horizontal'}
        defaultValue={controlled ? undefined : defaultValue}
        value={controlled ? value() : undefined}
        onValueChange={(next, details) => {
          log(`value ${String(next)} ${details.reason} ${details.activationDirection}`);
          if (cancel && details.reason === 'none') {
            details.cancel();
          }
          if (controlled) {
            setValue(next);
          }
        }}
      >
        <Tabs.List
          id="list"
          aria-label="sections"
          activateOnFocus={param('activateOnFocus') === 'true'}
          loopFocus={param('loop') !== 'false'}
          style={{
            display: 'flex',
            'flex-direction': param('orientation') === 'vertical' ? 'column' : 'row',
            position: 'relative',
            padding: '0',
            margin: '0',
          }}
        >
          <For each={tabs()}>
            {(tab) => (
              <Tabs.Tab
                id={`tab-${tab}`}
                value={tab}
                disabled={disabled().includes(tab)}
                nativeButton={!anchors}
                render={anchors ? (props: HTMLProps) => <a {...props} /> : undefined}
                style={{
                  width: tab === 0 && wide() ? '150px' : '80px',
                  height: '30px',
                  margin: '0',
                  padding: '0',
                  border: '0',
                  'flex-shrink': '0',
                }}
              >
                Tab {tab}
              </Tabs.Tab>
            )}
          </For>
          <Tabs.Indicator id="indicator" />
        </Tabs.List>
        <For each={[0, 1, 2]}>
          {(panel) => (
            <Tabs.Panel id={`panel-${panel}`} value={panel} keepMounted={keepMounted}>
              Panel {panel}
            </Tabs.Panel>
          )}
        </For>
      </Tabs.Root>
      <button id="set-2" onClick={() => setValue(2)}>
        set 2
      </button>
      <button id="set-null" onClick={() => setValue(null)}>
        clear
      </button>
      <button id="disable-0" onClick={() => setDisabled((d) => [...d, 0])}>
        disable 0
      </button>
      <button id="remove-0" onClick={() => setTabs((t) => t.filter((tab) => tab !== 0))}>
        remove 0
      </button>
      <button id="remove-all" onClick={() => setTabs([])}>
        remove all
      </button>
      <button id="widen" onClick={() => setWide(true)}>
        widen
      </button>
    </DirectionProvider>
  );
}

export const fixtures: Record<string, () => JSX.Element> = {
  tabs: () => <TabsDemo />,
};
