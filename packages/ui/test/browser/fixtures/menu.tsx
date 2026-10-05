// Fixtures for the menu: one menu with plain items (one disabled, one that
// keeps the menu open), a separator and a group with a label. URL params:
// `modal=false` for a non-modal menu, `loop=false` to stop focus wrapping,
// `animated=true` for a popup that fades out over 300 ms.
import type { JSX } from '@solidjs/web';
import { Show } from 'solid-js';

import { Menu } from '../../../src/menu/index.ts';
import { log, param } from './log.ts';

function FullMenu(): JSX.Element {
  const modal = param('modal') !== 'false';
  const loopFocus = param('loop') !== 'false';
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
        modal={modal}
        loopFocus={loopFocus}
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
              <Menu.Item id="copy" disabled onClick={() => log('click copy')}>
                Copy
              </Menu.Item>
              <Menu.Item id="paste" closeOnClick={false} onClick={() => log('click paste')}>
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

export const fixtures: Record<string, () => JSX.Element> = {
  menu: () => <FullMenu />,
};
