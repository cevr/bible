// Fixtures for the popover. `popover` is one popover with a title, a
// description, a field, a close button and an arrow, between two page
// buttons. URL params: `modal=true|trap-focus`, `hover=true` for a trigger
// that also opens on hover, `delay`/`closeDelay` for its hover timing,
// `close=false` to leave out the close button, `disabled=true`,
// `keepMounted=true`, `defaultOpen=true`, `cancel=true` for an
// `onOpenChange` that cancels every change, `backdrop=true` for a
// `Popover.Backdrop`. `nested` puts a popover in a popover; `controlled`
// drives one from outside.
import type { JSX } from '@solidjs/web';
import { createSignal } from 'solid-js';

import { Popover, type PopoverRootActions } from '../../../src/popover/index.ts';
import { log, param } from './log.ts';

function modalParam(): boolean | 'trap-focus' {
  const value = param('modal');
  if (value === 'true') {
    return true;
  }
  if (value === 'trap-focus') {
    return 'trap-focus';
  }
  return false;
}

function numberParam(name: string, fallback: number): number {
  const value = param(name);
  return value === null ? fallback : Number(value);
}

function BasicPopover(): JSX.Element {
  const actions: { current: PopoverRootActions | null } = { current: null };
  return (
    <div style={{ padding: '40px' }}>
      <button type="button" id="before">
        before
      </button>
      <Popover.Root
        modal={modalParam()}
        defaultOpen={param('defaultOpen') === 'true'}
        actionsRef={actions}
        onOpenChange={(open, details) => {
          log(`open ${open} ${details.reason}`);
          if (param('cancel') === 'true') {
            details.cancel();
          }
        }}
        onOpenChangeComplete={(open) => log(`complete ${open}`)}
      >
        <Popover.Trigger
          id="trigger"
          openOnHover={param('hover') === 'true'}
          delay={numberParam('delay', 0)}
          closeDelay={numberParam('closeDelay', 0)}
          disabled={param('disabled') === 'true'}
        >
          Open
        </Popover.Trigger>
        <Popover.Portal keepMounted={param('keepMounted') === 'true'}>
          {param('backdrop') === 'true' ? <Popover.Backdrop id="backdrop" /> : null}
          <Popover.Positioner id="positioner" sideOffset={8}>
            <Popover.Popup id="popup">
              <Popover.Arrow id="arrow" />
              <Popover.Title id="title">Notifications</Popover.Title>
              <Popover.Description id="description">You are all caught up.</Popover.Description>
              <input id="inside" aria-label="inside" />
              {param('close') === 'false' ? null : <Popover.Close id="close">Close</Popover.Close>}
            </Popover.Popup>
          </Popover.Positioner>
        </Popover.Portal>
      </Popover.Root>
      <button type="button" id="after">
        after
      </button>
      <button type="button" id="imperative-close" onClick={() => actions.current?.close()}>
        imperative close
      </button>
      <div id="outside" style={{ height: '1200px' }}>
        outside
      </div>
    </div>
  );
}

function NestedPopover(): JSX.Element {
  return (
    <div style={{ padding: '40px' }}>
      <Popover.Root onOpenChange={(open, details) => log(`outer ${open} ${details.reason}`)}>
        <Popover.Trigger id="outer-trigger">Outer</Popover.Trigger>
        <Popover.Portal>
          <Popover.Positioner side="bottom">
            <Popover.Popup id="outer-popup">
              <button type="button" id="outer-button">
                outer button
              </button>
              <Popover.Root
                onOpenChange={(open, details) => log(`inner ${open} ${details.reason}`)}
              >
                <Popover.Trigger id="inner-trigger">Inner</Popover.Trigger>
                <Popover.Portal>
                  <Popover.Positioner side="right">
                    <Popover.Popup id="inner-popup">
                      <button type="button" id="inner-button">
                        inner button
                      </button>
                    </Popover.Popup>
                  </Popover.Positioner>
                </Popover.Portal>
              </Popover.Root>
            </Popover.Popup>
          </Popover.Positioner>
        </Popover.Portal>
      </Popover.Root>
      <div id="outside" style={{ height: '300px' }}>
        outside
      </div>
    </div>
  );
}

function ControlledPopover(): JSX.Element {
  const [open, setOpen] = createSignal(false);
  return (
    <div style={{ padding: '40px' }}>
      <button type="button" id="toggle" onClick={() => setOpen((value) => !value)}>
        toggle
      </button>
      <Popover.Root
        open={open()}
        onOpenChange={(next, details) => {
          log(`open ${next} ${details.reason}`);
          setOpen(next);
        }}
      >
        <Popover.Trigger id="trigger">Open</Popover.Trigger>
        <Popover.Portal>
          <Popover.Positioner>
            <Popover.Popup id="popup">
              <button type="button" id="inside">
                inside
              </button>
            </Popover.Popup>
          </Popover.Positioner>
        </Popover.Portal>
      </Popover.Root>
    </div>
  );
}

export const fixtures: Record<string, () => JSX.Element> = {
  popover: BasicPopover,
  nested: NestedPopover,
  controlled: ControlledPopover,
};
