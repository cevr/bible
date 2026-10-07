// Fixtures for the menu: one menu with plain items, a separator and a group
// with a label. URL param: `animated=true` for a popup that fades out over
// 300 ms. `sorted` is a menu of keyed rows that reverse while it is open.
import type { JSX } from '@solidjs/web';
import { createSignal, For, Show } from 'solid-js';

import { Menu } from '../../../src/menu/index.ts';
import { log, param } from './log.ts';

function FullMenu(): JSX.Element {
  return (
    <div style={{ padding: '40px' }}>
      <Show when={param('animated') === 'true'}>
        <style>{`
          #popup { transition: opacity 300ms; }
          #popup[data-ending-style] { opacity: 0; }
        `}</style>
      </Show>
      <button type="button" id="before">
        before
      </button>
      <Menu.Root
        onOpenChange={(open, details) => log(`open ${open} ${details.reason}`)}
        onOpenChangeComplete={(open) => log(`complete ${open}`)}
      >
        <Menu.Trigger id="trigger">Edit</Menu.Trigger>
        <Menu.Portal>
          <Menu.Positioner id="positioner" sideOffset={4} align="start">
            <Menu.Popup id="popup">
              <Menu.Item id="cut" onClick={() => log('click cut')}>
                Cut
              </Menu.Item>
              <Menu.Item id="copy" onClick={() => log('click copy')}>
                Copy
              </Menu.Item>
              <Menu.Item id="paste" onClick={() => log('click paste')}>
                Paste
              </Menu.Item>
              <Menu.Separator id="sep" />
              <Menu.Group id="view-group">
                <Menu.GroupLabel id="view-label">View</Menu.GroupLabel>
                <Menu.Item id="grid" onClick={() => log('click grid')}>
                  Grid
                </Menu.Item>
              </Menu.Group>
              <Menu.Item id="more" onClick={() => log('click more')}>
                More
              </Menu.Item>
            </Menu.Popup>
          </Menu.Positioner>
        </Menu.Portal>
      </Menu.Root>
      <button type="button" id="after">
        after
      </button>
    </div>
  );
}

/**
 * A menu whose items are a keyed list, as the lab's rows are:
 * `window.__reverse()` reverses the list while the menu is open, so the
 * items' elements move in the DOM.
 */
function SortedMenu(): JSX.Element {
  const [names, setNames] = createSignal(['alpha', 'bravo', 'charlie']);
  (window as unknown as { __reverse: () => void }).__reverse = () =>
    setNames((current) => [...current].reverse());
  return (
    <div style={{ padding: '40px' }}>
      <Menu.Root>
        <Menu.Trigger id="trigger">Rows</Menu.Trigger>
        <Menu.Portal>
          <Menu.Positioner id="positioner" sideOffset={4} align="start">
            <Menu.Popup id="popup">
              <For each={names()}>
                {(name) => (
                  <Menu.Item id={name} onClick={() => log(`click ${name}`)}>
                    {name}
                  </Menu.Item>
                )}
              </For>
            </Menu.Popup>
          </Menu.Positioner>
        </Menu.Portal>
      </Menu.Root>
    </div>
  );
}

export const fixtures: Record<string, () => JSX.Element> = {
  menu: () => <FullMenu />,
  sorted: () => <SortedMenu />,
};
