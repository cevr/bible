// Fixtures for the drawer. Every drawer is opened as a page opens one: its
// owner holds `open`, a plain button sets it, and the drawer's own opens and
// closes reach the owner through `onOpenChange`. URL params for `drawer`:
// `direction` (the root's `swipeDirection`: `down` by default, or `right`
// for a side sheet), `modal=false`, `owner=cancel` for an owner that cancels
// every close, `initial=first|false` for an `initialFocus` that returns the
// first button or `false`. `async-owner` is the studio's shape: an
// `open` that stays true, under a page that drops the drawer later.
//
// The bottom sheet is 300px tall on an 800x600 page (its top edge at y=300);
// the side sheet is 300px wide (its left edge at x=500). Their transforms
// read the drawer's CSS variables, as a styled drawer's do. The sheet's first
// button is 100px tall, so a drag can stay on it.
import type { JSX } from '@solidjs/web';
import { createSignal, Show } from 'solid-js';

import { Drawer } from '../../../src/drawer/index.ts';
import type { DrawerSwipeDirection } from '../../../src/drawer/index.ts';
import { log, param } from './log.ts';

const STYLES = `
  .viewport { position: fixed; inset: 0; }
  .popup {
    position: fixed; left: 0; right: 0; bottom: 0; height: 300px; background: #ddd;
    transform: translateY(var(--drawer-swipe-movement-y));
  }
  .popup[data-swipe-direction="right"] {
    left: auto; top: 0; height: auto; width: 300px;
    transform: translateX(var(--drawer-swipe-movement-x));
  }
`;

function directionParam(): DrawerSwipeDirection {
  return param('direction') === 'right' ? 'right' : 'down';
}

/** An owner's open state and the plain button that opens it. */
function ownerOpen(id: string) {
  const [open, setOpen] = createSignal(false);
  const Opener = (props: { children: JSX.Element }) => (
    <button type="button" id={id} onClick={() => setOpen(true)}>
      {props.children}
    </button>
  );
  return { open, setOpen, Opener };
}

function BasicDrawer(): JSX.Element {
  const owner = ownerOpen('open');
  const direction = directionParam();
  let first: HTMLElement | undefined;
  const initial = param('initial');
  const initialFocus =
    initial === 'first' ? () => first ?? true : initial === 'false' ? () => false : undefined;
  return (
    <div>
      <style>{STYLES}</style>
      <button type="button" id="outside">
        outside
      </button>
      <owner.Opener>Open</owner.Opener>
      <Drawer.Root
        open={owner.open()}
        swipeDirection={direction}
        modal={param('modal') !== 'false'}
        onOpenChange={(open, details) => {
          log(`open ${open} ${details.reason}`);
          if (!open && param('owner') === 'cancel') {
            details.cancel();
            return;
          }
          owner.setOpen(open);
        }}
      >
        <Drawer.Portal>
          <Drawer.Viewport id="viewport" class="viewport">
            <Drawer.Popup id="popup" class="popup" initialFocus={initialFocus}>
              <Drawer.Title id="title">Sheet</Drawer.Title>
              <Drawer.Content id="content">Selectable text</Drawer.Content>
              <button
                type="button"
                id="first"
                ref={(el) => (first = el)}
                style={{ height: '100px' }}
              >
                first
              </button>
              <Drawer.Close id="close">Close</Drawer.Close>
            </Drawer.Popup>
          </Drawer.Viewport>
        </Drawer.Portal>
      </Drawer.Root>
    </div>
  );
}

/**
 * The studio's phone sheet: the drawer's `open` is always true and the page
 * shows or drops the whole drawer. A close request reaches the page, which
 * drops it a little later (as a `history.back()` lands on `popstate`).
 */
function AsyncOwnerDrawer(): JSX.Element {
  const [shown, setShown] = createSignal(false);
  return (
    <div>
      <style>{STYLES}</style>
      <button type="button" id="open" onClick={() => setShown(true)}>
        Open
      </button>
      <Show when={shown()}>
        <Drawer.Root
          open
          onOpenChange={(open, details) => {
            log(`open ${open} ${details.reason}`);
            if (!open) {
              setTimeout(() => setShown(false), 100);
            }
          }}
        >
          <Drawer.Portal>
            <Drawer.Viewport id="viewport" class="viewport">
              <Drawer.Popup id="popup" class="popup">
                <Drawer.Title id="title">Sheet</Drawer.Title>
              </Drawer.Popup>
            </Drawer.Viewport>
          </Drawer.Portal>
        </Drawer.Root>
      </Show>
    </div>
  );
}

export const fixtures: Record<string, () => JSX.Element> = {
  drawer: BasicDrawer,
  'async-owner': AsyncOwnerDrawer,
};
