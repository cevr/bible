// Fixtures for the context menu: a 300×200 area that opens a menu with
// items, and a field in the area whose open the root declines;
// and the lab's shape, one root whose page trigger wraps target triggers (`nested`).
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

/**
 * The lab's shape: one root, the page's own trigger (`display: contents`)
 * wrapping two target triggers and a blank stretch. Each open logs the
 * target its event landed on (`page` for none). The items' text leads with
 * a key chord, so only their `label` starts with the name.
 */
function NestedTargets(): JSX.Element {
  const targetOf = (event: Event) =>
    (event.target as Element | null)?.closest('[data-target]')?.getAttribute('data-target') ??
    'page';
  return (
    <ContextMenu.Root
      onOpenChange={(open, details) =>
        log(open ? `open true ${targetOf(details.event)}` : `open false ${details.reason}`)
      }
    >
      <ContextMenu.Trigger id="page" style={{ display: 'contents' }}>
        <div style={{ padding: '40px' }}>
          <ContextMenu.Trigger
            id="target-a"
            data-target="a"
            style={{ width: '200px', height: '80px', background: '#ddd' }}
          >
            A
          </ContextMenu.Trigger>
          <ContextMenu.Trigger
            id="target-b"
            data-target="b"
            style={{ width: '200px', height: '80px', background: '#ccc' }}
          >
            B
          </ContextMenu.Trigger>
          <div id="blank" style={{ width: '200px', height: '120px' }}>
            blank
          </div>
        </div>
      </ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Positioner id="positioner">
          <ContextMenu.Popup id="popup">
            <ContextMenu.Item
              id="duplicate"
              label="Duplicate"
              onClick={() => log('click duplicate')}
            >
              <kbd>⌘D</kbd> Duplicate
            </ContextMenu.Item>
            <ContextMenu.Item id="rename" label="Rename" onClick={() => log('click rename')}>
              <kbd>F2</kbd> Rename
            </ContextMenu.Item>
          </ContextMenu.Popup>
        </ContextMenu.Positioner>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}

export const fixtures: Record<string, () => JSX.Element> = {
  area: () => <AreaMenu />,
  nested: () => <NestedTargets />,
};
