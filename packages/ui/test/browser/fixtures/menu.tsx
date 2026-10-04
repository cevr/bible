// Fixtures for the menu: one menu with plain items (one disabled), a group
// with a label, checkbox and radio items with indicators, a separator and a
// submenu. URL params: `modal=false` for a non-modal menu, `hover=true` for a
// trigger that opens on hover, `loop=false` to stop focus wrapping. Also a
// menu inside a toolbar.
import type { JSX } from '@solidjs/web';

import { Menu } from '../../../src/menu/index.ts';
import { Toolbar } from '../../../src/toolbar/index.ts';
import { log, param } from './log.ts';

function FullMenu(): JSX.Element {
  const modal = param('modal') !== 'false';
  const openOnHover = param('hover') === 'true';
  const loopFocus = param('loop') !== 'false';
  return (
    <div style={{ padding: '40px' }}>
      <button type="button" id="before">
        before
      </button>
      <Menu.Root
        modal={modal}
        loopFocus={loopFocus}
        onOpenChange={(open, details) => log(`open ${open} ${details.reason}`)}
      >
        <Menu.Trigger id="trigger" openOnHover={openOnHover} delay={0}>
          Edit
        </Menu.Trigger>
        <Menu.Portal>
          <Menu.Backdrop id="backdrop" />
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
                <Menu.CheckboxItem id="grid" onCheckedChange={(checked) => log(`grid ${checked}`)}>
                  <Menu.CheckboxItemIndicator id="grid-indicator">✓</Menu.CheckboxItemIndicator>
                  Grid
                </Menu.CheckboxItem>
              </Menu.Group>
              <Menu.RadioGroup
                id="zoom"
                defaultValue="fit"
                onValueChange={(value) => log(`zoom ${String(value)}`)}
              >
                <Menu.RadioItem id="zoom-fit" value="fit">
                  <Menu.RadioItemIndicator id="fit-indicator">•</Menu.RadioItemIndicator>
                  Fit
                </Menu.RadioItem>
                <Menu.RadioItem id="zoom-full" value="full">
                  <Menu.RadioItemIndicator id="full-indicator">•</Menu.RadioItemIndicator>
                  Full
                </Menu.RadioItem>
              </Menu.RadioGroup>
              <Menu.SubmenuRoot
                onOpenChange={(open, details) => log(`sub ${open} ${details.reason}`)}
              >
                <Menu.SubmenuTrigger id="more">More</Menu.SubmenuTrigger>
                <Menu.Portal>
                  <Menu.Positioner id="sub-positioner">
                    <Menu.Popup id="sub-popup">
                      <Menu.Item id="rename" onClick={() => log('click rename')}>
                        Rename
                      </Menu.Item>
                      <Menu.Item id="remove" onClick={() => log('click remove')}>
                        Remove
                      </Menu.Item>
                    </Menu.Popup>
                  </Menu.Positioner>
                </Menu.Portal>
              </Menu.SubmenuRoot>
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

/** A menu inside a toolbar; the wrapper logs every keydown that reaches the toolbar. */
function InToolbar(): JSX.Element {
  return (
    <div style={{ padding: '40px' }} onKeyDown={(event) => log(`toolbar key ${event.key}`)}>
      <Toolbar.Root id="toolbar">
        <Toolbar.Button id="first">first</Toolbar.Button>
        <Menu.Root>
          <Menu.Trigger id="trigger">Edit</Menu.Trigger>
          <Menu.Portal>
            <Menu.Positioner id="positioner" sideOffset={4} align="start">
              <Menu.Popup id="popup">
                <Menu.Item id="cut">Cut</Menu.Item>
                <Menu.Item id="paste">Paste</Menu.Item>
              </Menu.Popup>
            </Menu.Positioner>
          </Menu.Portal>
        </Menu.Root>
        <Toolbar.Button id="last">last</Toolbar.Button>
      </Toolbar.Root>
    </div>
  );
}

export const fixtures: Record<string, () => JSX.Element> = {
  menu: () => <FullMenu />,
  'in-toolbar': () => <InToolbar />,
};
