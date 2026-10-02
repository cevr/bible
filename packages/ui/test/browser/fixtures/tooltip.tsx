// Fixtures for the tooltip. `tooltip` is one tooltip between two page
// buttons. URL params: `delay`/`closeDelay` for the trigger's timing (0 by
// default here, so tests without a clock open at once; `delay=default`
// leaves the trigger's 600 ms), `closeOnClick=false`, `disabled=true` on
// the trigger, `rootDisabled=true` on the root, `defaultOpen=true`,
// `hoverable=false` for `disableHoverablePopup`, `cancel=true` for an
// `onOpenChange` that cancels every change. `group` puts two tooltips in a
// `Tooltip.Provider` (`delay`, `closeDelay`, `timeout`); `controlled`
// drives one from outside; `nested` puts a tooltip trigger inside another.
import type { JSX } from '@solidjs/web';
import { createSignal } from 'solid-js';

import type { HTMLProps } from '../../../src/internals/types.ts';
import { Tooltip, type TooltipRootActions } from '../../../src/tooltip/index.ts';
import { log, param } from './log.ts';

function numberParam(name: string, fallback: number | undefined): number | undefined {
  const value = param(name);
  if (value === 'default') {
    return undefined;
  }
  return value === null ? fallback : Number(value);
}

function BasicTooltip(): JSX.Element {
  const actions: { current: TooltipRootActions | null } = { current: null };
  const [rootDisabled, setRootDisabled] = createSignal(param('rootDisabled') === 'true');
  return (
    <div style={{ padding: '120px 40px' }}>
      <button type="button" id="before">
        before
      </button>
      <Tooltip.Root
        defaultOpen={param('defaultOpen') === 'true'}
        disabled={rootDisabled()}
        disableHoverablePopup={param('hoverable') === 'false'}
        actionsRef={actions}
        onOpenChange={(open, details) => {
          log(`open ${open} ${details.reason}`);
          if (param('cancel') === 'true') {
            details.cancel();
          }
        }}
        onOpenChangeComplete={(open) => log(`complete ${open}`)}
      >
        <Tooltip.Trigger
          id="trigger"
          delay={numberParam('delay', 0)}
          closeDelay={numberParam('closeDelay', 0)}
          closeOnClick={param('closeOnClick') !== 'false'}
          disabled={param('disabled') === 'true' ? true : undefined}
        >
          Save
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Positioner id="positioner" sideOffset={8}>
            <Tooltip.Popup id="popup">
              <Tooltip.Arrow id="arrow" />
              Saves the document
            </Tooltip.Popup>
          </Tooltip.Positioner>
        </Tooltip.Portal>
      </Tooltip.Root>
      <button type="button" id="after">
        after
      </button>
      <button type="button" id="imperative-close" onClick={() => actions.current?.close()}>
        imperative close
      </button>
      <button type="button" id="toggle-disabled" onClick={() => setRootDisabled((v) => !v)}>
        toggle disabled
      </button>
      <div id="outside" style={{ height: '300px' }}>
        outside
      </div>
    </div>
  );
}

function GroupedTooltips(): JSX.Element {
  return (
    <div style={{ padding: '120px 40px', display: 'flex', gap: '40px' }}>
      <Tooltip.Provider
        delay={numberParam('delay', 100)}
        closeDelay={numberParam('closeDelay', undefined)}
        timeout={numberParam('timeout', undefined)}
      >
        {['one', 'two'].map((name) => (
          <Tooltip.Root onOpenChange={(open, details) => log(`${name} ${open} ${details.reason}`)}>
            <Tooltip.Trigger id={`trigger-${name}`}>{name}</Tooltip.Trigger>
            <Tooltip.Portal>
              <Tooltip.Positioner>
                <Tooltip.Popup id={`popup-${name}`}>{`Content ${name}`}</Tooltip.Popup>
              </Tooltip.Positioner>
            </Tooltip.Portal>
          </Tooltip.Root>
        ))}
      </Tooltip.Provider>
      <div id="outside" style={{ width: '300px', height: '300px' }}>
        outside
      </div>
    </div>
  );
}

function ControlledTooltip(): JSX.Element {
  const [open, setOpen] = createSignal(false);
  return (
    <div style={{ padding: '120px 40px' }}>
      <button type="button" id="toggle" onClick={() => setOpen((value) => !value)}>
        toggle
      </button>
      <Tooltip.Root
        open={open()}
        onOpenChange={(next, details) => {
          log(`open ${next} ${details.reason}`);
          setOpen(next);
        }}
      >
        <Tooltip.Trigger id="trigger" delay={0}>
          Save
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Positioner>
            <Tooltip.Popup id="popup">Saves the document</Tooltip.Popup>
          </Tooltip.Positioner>
        </Tooltip.Portal>
      </Tooltip.Root>
    </div>
  );
}

function NestedTooltips(): JSX.Element {
  return (
    <div style={{ padding: '120px 40px' }}>
      <Tooltip.Root onOpenChange={(open, details) => log(`outer ${open} ${details.reason}`)}>
        <Tooltip.Trigger
          id="outer-trigger"
          delay={0}
          render={(props: HTMLProps) => (
            <span {...props} style={{ display: 'inline-block', padding: '30px' }} />
          )}
        >
          Outer
          <Tooltip.Root onOpenChange={(open, details) => log(`inner ${open} ${details.reason}`)}>
            <Tooltip.Trigger id="inner-trigger" delay={0}>
              Inner
            </Tooltip.Trigger>
            <Tooltip.Portal>
              <Tooltip.Positioner side="bottom">
                <Tooltip.Popup id="inner-popup">Inner tooltip</Tooltip.Popup>
              </Tooltip.Positioner>
            </Tooltip.Portal>
          </Tooltip.Root>
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Positioner>
            <Tooltip.Popup id="outer-popup">Outer tooltip</Tooltip.Popup>
          </Tooltip.Positioner>
        </Tooltip.Portal>
      </Tooltip.Root>
      <div id="outside" style={{ height: '300px' }}>
        outside
      </div>
    </div>
  );
}

export const fixtures: Record<string, () => JSX.Element> = {
  tooltip: BasicTooltip,
  group: GroupedTooltips,
  controlled: ControlledTooltip,
  nested: NestedTooltips,
};
