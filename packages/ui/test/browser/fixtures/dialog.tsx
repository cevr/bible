// Fixtures for the dialog. Every dialog is opened as a page opens one: its
// owner holds `open`, a plain button sets it, and the dialog's own closes
// reach the owner through `onOpenChange`. URL params for `dialog`: `modal`
// (`true`, `false`, `trap-focus`), `dismissal=disabled` for
// `disablePointerDismissal`, `initial=input|false|function` and
// `final=outside|false` for the popup's focus props, `backdrop=user` for a
// `Dialog.Backdrop`, `owner=keep` for an owner that keeps `open` true
// through a close request, `tall=true` for a page that scrolls.
import type { JSX } from '@solidjs/web';
import { createSignal } from 'solid-js';

import { Dialog, type DialogFocusTarget } from '../../../src/dialog/index.ts';
import { log, param } from './log.ts';

function modalParam(): boolean | 'trap-focus' {
  const value = param('modal');
  if (value === 'false') {
    return false;
  }
  if (value === 'trap-focus') {
    return 'trap-focus';
  }
  return true;
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

function BasicDialog(): JSX.Element {
  const owner = ownerOpen('open');
  const inputRef: { current: HTMLElement | null } = { current: null };
  const outsideRef: { current: HTMLElement | null } = { current: null };
  const initial = param('initial');
  const final = param('final');
  let initialFocus: DialogFocusTarget | undefined;
  if (initial === 'input') {
    initialFocus = inputRef;
  } else if (initial === 'false') {
    initialFocus = false;
  } else if (initial === 'function') {
    initialFocus = (type) => {
      log(`initialFocus "${type}"`);
      return inputRef.current;
    };
  }
  let finalFocus: DialogFocusTarget | undefined;
  if (final === 'outside') {
    finalFocus = outsideRef;
  } else if (final === 'false') {
    finalFocus = false;
  }
  return (
    <div style={{ padding: '20px', height: param('tall') === 'true' ? '3000px' : undefined }}>
      <button type="button" id="outside" ref={(el) => (outsideRef.current = el)}>
        outside
      </button>
      <owner.Opener>Open</owner.Opener>
      <Dialog.Root
        open={owner.open()}
        modal={modalParam()}
        disablePointerDismissal={param('dismissal') === 'disabled'}
        onOpenChange={(open, details) => {
          log(`open ${open} ${details.reason}`);
          if (param('owner') !== 'keep') {
            owner.setOpen(open);
          }
        }}
        onOpenChangeComplete={(open) => log(`complete ${open}`)}
      >
        <Dialog.Portal id="portal">
          {param('backdrop') === 'user' ? <Dialog.Backdrop id="backdrop" /> : null}
          <Dialog.Popup id="popup" initialFocus={initialFocus} finalFocus={finalFocus}>
            <Dialog.Title id="title">Title</Dialog.Title>
            <Dialog.Description id="description">Description</Dialog.Description>
            <button type="button" id="first">
              first
            </button>
            <input id="input" ref={(el) => (inputRef.current = el)} />
            <Dialog.Close id="close">Close</Dialog.Close>
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}

function NestedDialog(): JSX.Element {
  const parent = ownerOpen('open');
  const child = ownerOpen('child-open');
  const grandchild = ownerOpen('grandchild-open');
  return (
    <>
      <parent.Opener>Open</parent.Opener>
      <Dialog.Root
        open={parent.open()}
        onOpenChange={(open, details) => {
          log(`parent ${open} ${details.reason}`);
          parent.setOpen(open);
        }}
      >
        <Dialog.Portal>
          <Dialog.Backdrop id="parent-backdrop" />
          <Dialog.Popup id="parent-popup">
            <Dialog.Title>Parent</Dialog.Title>
            <child.Opener>Open child</child.Opener>
            <Dialog.Root
              open={child.open()}
              onOpenChange={(open, details) => {
                log(`child ${open} ${details.reason}`);
                child.setOpen(open);
              }}
            >
              <Dialog.Portal>
                <Dialog.Backdrop id="child-backdrop" />
                <Dialog.Popup id="child-popup">
                  <Dialog.Title>Child</Dialog.Title>
                  <grandchild.Opener>Open grandchild</grandchild.Opener>
                  <Dialog.Root
                    open={grandchild.open()}
                    onOpenChange={(open) => grandchild.setOpen(open)}
                  >
                    <Dialog.Portal>
                      <Dialog.Popup id="grandchild-popup">
                        <Dialog.Close id="grandchild-close">Close grandchild</Dialog.Close>
                      </Dialog.Popup>
                    </Dialog.Portal>
                  </Dialog.Root>
                  <Dialog.Close id="child-close">Close child</Dialog.Close>
                </Dialog.Popup>
              </Dialog.Portal>
            </Dialog.Root>
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}

/** Three dialogs side by side, each opened from the one before. */
function SideBySide(): JSX.Element {
  const first = ownerOpen('open');
  const [second, setSecond] = createSignal(false);
  const [third, setThird] = createSignal(false);
  return (
    <div>
      <first.Opener>Open base</first.Opener>
      <Dialog.Root open={first.open()} onOpenChange={(open) => first.setOpen(open)}>
        <Dialog.Portal>
          <Dialog.Popup id="level-1">
            <button type="button" id="open-2" onClick={() => setSecond(true)}>
              Open 2
            </button>
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
      <Dialog.Root open={second()} onOpenChange={(open) => setSecond(open)}>
        <Dialog.Portal>
          <Dialog.Popup id="level-2">
            <button type="button" id="open-3" onClick={() => setThird(true)}>
              Open 3
            </button>
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
      <Dialog.Root open={third()} onOpenChange={(open) => setThird(open)}>
        <Dialog.Portal>
          <Dialog.Popup id="level-3">Final</Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}

function Animated(): JSX.Element {
  const owner = ownerOpen('open');
  return (
    <div>
      <style>{`
        #popup { transition: opacity 200ms; }
        #popup[data-ending-style] { opacity: 0; }
      `}</style>
      <owner.Opener>Open</owner.Opener>
      <Dialog.Root
        open={owner.open()}
        onOpenChange={(open) => owner.setOpen(open)}
        onOpenChangeComplete={(open) => log(`complete ${open}`)}
      >
        <Dialog.Portal>
          <Dialog.Popup id="popup">
            <Dialog.Close id="close">Close</Dialog.Close>
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}

/**
 * A modal dialog's internal backdrop is a fixed layer over the page; the
 * popups are positioned so they stack above it, as any styled dialog does.
 */
function withPopupStyles(fixture: () => JSX.Element): () => JSX.Element {
  return () => (
    <>
      <style>{`[role="dialog"] { position: relative; }`}</style>
      {fixture()}
    </>
  );
}

export const fixtures: Record<string, () => JSX.Element> = {
  dialog: withPopupStyles(BasicDialog),
  nested: withPopupStyles(NestedDialog),
  'side-by-side': withPopupStyles(SideBySide),
  animated: withPopupStyles(Animated),
};
