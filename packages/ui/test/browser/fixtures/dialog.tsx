// Fixtures for the dialog and the alert dialog. URL params for `dialog`:
// `modal` (`true`, `false`, `trap-focus`), `dismissal=disabled` for
// `disablePointerDismissal`, `initial=input|false|function` and
// `final=outside|false` for the popup's focus props, `backdrop=user` for a
// `Dialog.Backdrop`, `cancel=open` to cancel opening in `onOpenChange`,
// `tall=true` for a page that scrolls.
import type { JSX } from '@solidjs/web';
import { createSignal } from 'solid-js';

import { AlertDialog } from '../../../src/alert-dialog/index.ts';
import {
  Dialog,
  type DialogFocusTarget,
  type DialogRootActions,
} from '../../../src/dialog/index.ts';
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

function BasicDialog(): JSX.Element {
  const inputRef: { current: HTMLElement | null } = { current: null };
  const outsideRef: { current: HTMLElement | null } = { current: null };
  const actionsRef: { current: DialogRootActions | null } = { current: null };
  const initial = param('initial');
  const final = param('final');
  let initialFocus: DialogFocusTarget | undefined;
  if (initial === 'input') {
    initialFocus = inputRef;
  } else if (initial === 'false') {
    initialFocus = false;
  } else if (initial === 'function') {
    initialFocus = (type) => {
      log(`initialFocus ${type}`);
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
      <button type="button" id="close-imperative" onClick={() => actionsRef.current?.close()}>
        close imperatively
      </button>
      <Dialog.Root
        modal={modalParam()}
        disablePointerDismissal={param('dismissal') === 'disabled'}
        actionsRef={actionsRef}
        onOpenChange={(open, details) => {
          log(`open ${open} ${details.reason}`);
          if (open && param('cancel') === 'open') {
            details.cancel();
          }
        }}
        onOpenChangeComplete={(open) => log(`complete ${open}`)}
      >
        <Dialog.Trigger id="trigger">Open</Dialog.Trigger>
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
  return (
    <Dialog.Root onOpenChange={(open, details) => log(`parent ${open} ${details.reason}`)}>
      <Dialog.Trigger id="trigger">Open</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Backdrop id="parent-backdrop" />
        <Dialog.Popup id="parent-popup">
          <Dialog.Title>Parent</Dialog.Title>
          <Dialog.Root onOpenChange={(open, details) => log(`child ${open} ${details.reason}`)}>
            <Dialog.Trigger id="child-trigger">Open child</Dialog.Trigger>
            <Dialog.Portal>
              <Dialog.Backdrop id="child-backdrop" />
              <Dialog.Popup id="child-popup">
                <Dialog.Title>Child</Dialog.Title>
                <Dialog.Root>
                  <Dialog.Trigger id="grandchild-trigger">Open grandchild</Dialog.Trigger>
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
          <AlertDialog.Root>
            <AlertDialog.Trigger id="alert-trigger">Open alert</AlertDialog.Trigger>
            <AlertDialog.Portal>
              <AlertDialog.Popup id="alert-popup">
                <AlertDialog.Close id="alert-close">Close alert</AlertDialog.Close>
              </AlertDialog.Popup>
            </AlertDialog.Portal>
          </AlertDialog.Root>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** Three dialogs side by side, each opened from the one before. */
function SideBySide(): JSX.Element {
  const [second, setSecond] = createSignal(false);
  const [third, setThird] = createSignal(false);
  return (
    <div>
      <Dialog.Root>
        <Dialog.Trigger id="trigger">Open base</Dialog.Trigger>
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

function KeepMounted(): JSX.Element {
  return (
    <Dialog.Root>
      <Dialog.Trigger id="trigger">Open</Dialog.Trigger>
      <Dialog.Portal keepMounted>
        <Dialog.Viewport id="viewport">
          <Dialog.Popup id="popup">
            <Dialog.Close id="close">Close</Dialog.Close>
          </Dialog.Popup>
        </Dialog.Viewport>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function Alert(): JSX.Element {
  return (
    <div>
      <button type="button" id="outside">
        outside
      </button>
      <AlertDialog.Root onOpenChange={(open, details) => log(`open ${open} ${details.reason}`)}>
        <AlertDialog.Trigger id="trigger">Delete</AlertDialog.Trigger>
        <AlertDialog.Portal>
          <AlertDialog.Backdrop id="backdrop" />
          <AlertDialog.Popup id="popup">
            <AlertDialog.Title id="title">Delete?</AlertDialog.Title>
            <AlertDialog.Close id="cancel">Cancel</AlertDialog.Close>
          </AlertDialog.Popup>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </div>
  );
}

function Animated(): JSX.Element {
  return (
    <div>
      <style>{`
        #popup { transition: opacity 200ms; }
        #popup[data-ending-style] { opacity: 0; }
      `}</style>
      <Dialog.Root onOpenChangeComplete={(open) => log(`complete ${open}`)}>
        <Dialog.Trigger id="trigger">Open</Dialog.Trigger>
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
      <style>{`[role="dialog"], [role="alertdialog"] { position: relative; }`}</style>
      {fixture()}
    </>
  );
}

export const fixtures: Record<string, () => JSX.Element> = {
  dialog: withPopupStyles(BasicDialog),
  nested: withPopupStyles(NestedDialog),
  'side-by-side': withPopupStyles(SideBySide),
  'keep-mounted': withPopupStyles(KeepMounted),
  alert: withPopupStyles(Alert),
  animated: withPopupStyles(Animated),
};
