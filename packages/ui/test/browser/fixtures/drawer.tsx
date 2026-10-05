// Fixtures for the drawer. Every drawer is opened as a page opens one: its
// owner holds `open`, a plain button sets it, and the drawer's own opens and
// closes reach the owner through `onOpenChange`. URL params for `drawer`:
// `direction` (the root's `swipeDirection`: `down` by default, or `right`
// for a side sheet), `snap=true` for snap points `['100px', 1]`,
// `modal=false`, `area=true` for a swipe area along the edge the drawer
// comes in from (`window.__removeArea()` unmounts it).
//
// The bottom sheet is 300px tall on an 800x600 page (its top edge at y=300);
// the side sheet is 300px wide (its left edge at x=500). Their transforms
// read the drawer's CSS variables, as a styled drawer's do.
import type { JSX } from '@solidjs/web';
import { createSignal, Show } from 'solid-js';

import { Drawer } from '../../../src/drawer/index.ts';
import type { DrawerSwipeDirection } from '../../../src/drawer/index.ts';
import { log, param } from './log.ts';

const STYLES = `
  .viewport { position: fixed; inset: 0; }
  .popup {
    position: fixed; left: 0; right: 0; bottom: 0; height: 300px; background: #ddd;
    transform: translateY(calc(var(--drawer-snap-point-offset) + var(--drawer-swipe-movement-y)));
  }
  .popup[data-swipe-direction="right"] {
    left: auto; top: 0; height: auto; width: 300px;
    transform: translateX(var(--drawer-swipe-movement-x));
  }
  .backdrop { position: fixed; inset: 0; background: rgb(0 0 0 / 0.2); }
  .area-bottom { position: fixed; left: 0; right: 0; bottom: 0; height: 24px; }
  .area-right { position: fixed; top: 0; bottom: 0; right: 0; width: 24px; }
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
  const [areaShown, setAreaShown] = createSignal(param('area') === 'true');
  (window as unknown as { __removeArea: () => void }).__removeArea = () => setAreaShown(false);
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
        snapPoints={param('snap') === 'true' ? ['100px', 1] : undefined}
        onOpenChange={(open, details) => {
          log(`open ${open} ${details.reason}`);
          owner.setOpen(open);
        }}
        onSnapPointChange={(snapPoint, details) => log(`snap ${snapPoint} ${details.reason}`)}
      >
        <Show when={areaShown()}>
          <Drawer.SwipeArea
            id="area"
            class={direction === 'right' ? 'area-right' : 'area-bottom'}
          />
        </Show>
        <Drawer.Portal>
          <Drawer.Backdrop id="backdrop" class="backdrop" />
          <Drawer.Viewport id="viewport" class="viewport">
            <Drawer.Popup id="popup" class="popup">
              <Drawer.Title id="title">Sheet</Drawer.Title>
              <Drawer.Description id="description">Swipe to close</Drawer.Description>
              <Drawer.Content id="content">Selectable text</Drawer.Content>
              <button type="button" id="first">
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

function NestedDrawer(): JSX.Element {
  const parent = ownerOpen('open');
  const child = ownerOpen('child-open');
  return (
    <div>
      <style>{STYLES}</style>
      <parent.Opener>Open</parent.Opener>
      <Drawer.Root
        open={parent.open()}
        onOpenChange={(open, details) => {
          log(`parent ${open} ${details.reason}`);
          parent.setOpen(open);
        }}
      >
        <Drawer.Portal>
          <Drawer.Viewport class="viewport">
            <Drawer.Popup id="parent-popup" class="popup">
              <child.Opener>Open child</child.Opener>
              <Drawer.Root
                open={child.open()}
                onOpenChange={(open, details) => {
                  log(`child ${open} ${details.reason}`);
                  child.setOpen(open);
                }}
              >
                <Drawer.Portal>
                  <Drawer.Viewport class="viewport">
                    <Drawer.Popup id="child-popup" class="popup" style={{ height: '200px' }}>
                      <Drawer.Close id="child-close">Close child</Drawer.Close>
                    </Drawer.Popup>
                  </Drawer.Viewport>
                </Drawer.Portal>
              </Drawer.Root>
            </Drawer.Popup>
          </Drawer.Viewport>
        </Drawer.Portal>
      </Drawer.Root>
    </div>
  );
}

function ProviderDrawer(): JSX.Element {
  const owner = ownerOpen('open');
  return (
    <Drawer.Provider>
      <style>{STYLES}</style>
      <Drawer.IndentBackground id="indent-background" />
      <Drawer.Indent id="indent">
        <owner.Opener>Open</owner.Opener>
        <Drawer.Root open={owner.open()} onOpenChange={(open) => owner.setOpen(open)}>
          <Drawer.Portal>
            <Drawer.Viewport class="viewport">
              <Drawer.Popup id="popup" class="popup">
                <Drawer.Close id="close">Close</Drawer.Close>
              </Drawer.Popup>
            </Drawer.Viewport>
          </Drawer.Portal>
        </Drawer.Root>
      </Drawer.Indent>
    </Drawer.Provider>
  );
}

export const fixtures: Record<string, () => JSX.Element> = {
  drawer: BasicDrawer,
  nested: NestedDrawer,
  provider: ProviderDrawer,
};
