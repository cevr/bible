// Fixtures for the context menu: a 300×200 area that opens a menu with
// items, a backdrop, and a field in the area whose open the root declines.
// URL params: `disabled=true` disables the root; `window.__setDisabled(bool)`
// changes it later; `under=true` opens the menu over the point it opens at,
// its first item under it (as a menu kept on a phone's screen lands under the finger).
import type { JSX } from '@solidjs/web';
import { createSignal } from 'solid-js';

import { ContextMenu } from '../../../src/context-menu/index.ts';
import { log, param } from './log.ts';

/**
 * The area menu's positioner: with `under=true`, over the point the menu
 * opens at (its first item under it), else at the root's own offsets.
 */
function Positioner(props: { readonly children: JSX.Element }): JSX.Element {
  if (param('under') === 'true') {
    return (
      <ContextMenu.Positioner id="positioner" sideOffset={-20} alignOffset={-20}>
        {props.children}
      </ContextMenu.Positioner>
    );
  }
  return <ContextMenu.Positioner id="positioner">{props.children}</ContextMenu.Positioner>;
}

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
        <Positioner>
          <ContextMenu.Popup id="popup">
            <ContextMenu.Item id="copy" onClick={() => log('click copy')}>
              Copy
            </ContextMenu.Item>
            <ContextMenu.Item id="paste" onClick={() => log('click paste')}>
              Paste
            </ContextMenu.Item>
          </ContextMenu.Popup>
        </Positioner>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}

export const fixtures: Record<string, () => JSX.Element> = {
  area: () => <AreaMenu />,
};
