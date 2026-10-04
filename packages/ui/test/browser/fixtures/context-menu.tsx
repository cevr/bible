// Fixtures for the context menu: a 300×200 area that opens a menu with
// items and a submenu, a backdrop, a field in the area whose open the root
// declines, and a context menu inside a menu's item list (`nested`). URL params: `disabled=true` disables the root; `window.__setDisabled(bool)` changes it later.
import type { JSX } from '@solidjs/web';
import { createSignal } from 'solid-js';

import { ContextMenu } from '../../../src/context-menu/index.ts';
import { log, param } from './log.ts';

function AreaMenu(): JSX.Element {
  const [disabled, setDisabled] = createSignal(param('disabled') === 'true');
  (window as unknown as { __setDisabled: (next: boolean) => void }).__setDisabled = setDisabled;
  return (
    <ContextMenu.Root
      disabled={disabled()}
      onOpenChange={(open, details) => {
        // The field inside the area keeps its own menu: the open on it is declined.
        if (open && (details.event.target as Element | null)?.id === 'field') {
          details.cancel();
          log('open declined');
          return;
        }
        log(`open ${open} ${details.reason}`);
      }}
    >
      <ContextMenu.Trigger
        id="area"
        style={{ width: '300px', height: '200px', margin: '40px', background: '#eee' }}
      >
        Right click here
        <input id="field" style={{ display: 'block', width: '80px' }} />
      </ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Backdrop id="backdrop" />
        <ContextMenu.Positioner id="positioner">
          <ContextMenu.Popup id="popup">
            <ContextMenu.Item id="copy" onClick={() => log('click copy')}>
              Copy
            </ContextMenu.Item>
            <ContextMenu.Item id="paste" onClick={() => log('click paste')}>
              Paste
            </ContextMenu.Item>
            <ContextMenu.SubmenuRoot>
              <ContextMenu.SubmenuTrigger id="more">More</ContextMenu.SubmenuTrigger>
              <ContextMenu.Portal>
                <ContextMenu.Positioner id="sub-positioner">
                  <ContextMenu.Popup id="sub-popup">
                    <ContextMenu.Item id="rename" onClick={() => log('click rename')}>
                      Rename
                    </ContextMenu.Item>
                  </ContextMenu.Popup>
                </ContextMenu.Positioner>
              </ContextMenu.Portal>
            </ContextMenu.SubmenuRoot>
          </ContextMenu.Popup>
        </ContextMenu.Positioner>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}

export const fixtures: Record<string, () => JSX.Element> = {
  area: () => <AreaMenu />,
};
