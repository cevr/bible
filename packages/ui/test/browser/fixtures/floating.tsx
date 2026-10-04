// Fixtures for the floating layer: a popup list assembled straight from the
// interactions (click, dismiss, list navigation, typeahead, focus manager,
// portal, anchor positioning), and a hover card with the safe polygon.
import type { JSX } from '@solidjs/web';
import { createSignal, For, Show, untrack } from 'solid-js';

import { FloatingFocusManager } from '../../../src/floating-ui-solid/FloatingFocusManager.tsx';
import { FloatingPortal } from '../../../src/floating-ui-solid/FloatingPortal.tsx';
import { createFloatingRootContext } from '../../../src/floating-ui-solid/FloatingRootContext.ts';
import { FloatingTree, useFloatingNodeId } from '../../../src/floating-ui-solid/FloatingTree.tsx';
import { useClick } from '../../../src/floating-ui-solid/hooks/useClick.ts';
import { useDismiss } from '../../../src/floating-ui-solid/hooks/useDismiss.ts';
import { useHoverFloatingInteraction } from '../../../src/floating-ui-solid/hooks/useHoverFloatingInteraction.ts';
import { useHoverReferenceInteraction } from '../../../src/floating-ui-solid/hooks/useHoverReferenceInteraction.ts';
import { useListNavigation } from '../../../src/floating-ui-solid/hooks/useListNavigation.ts';
import { useTypeahead } from '../../../src/floating-ui-solid/hooks/useTypeahead.ts';
import { safePolygon } from '../../../src/floating-ui-solid/safePolygon.ts';
import type { BaseUIChangeEventDetails } from '../../../src/internals/createBaseUIEventDetails.ts';
import { useAnchorPositioning } from '../../../src/internals/useAnchorPositioning.ts';
import { mergeProps } from '../../../src/merge-props/mergeProps.ts';
import { log, param } from './log.ts';

const ITEMS = ['Apple', 'Banana', 'Blueberry', 'Cherry'];

function ListPopup(): JSX.Element {
  const modal = param('modal') !== 'false';
  const loop = param('loop') === 'true';
  const [open, setOpen] = createSignal(false);
  const [trigger, setTrigger] = createSignal<HTMLElement | null>(null, { ownedWrite: true });
  const [floating, setFloating] = createSignal<HTMLElement | null>(null, { ownedWrite: true });
  const [activeIndex, setActiveIndex] = createSignal<number | null>(null);
  const elements: { current: Array<HTMLElement | null> } = { current: [] };
  const labels: { current: Array<string | null> } = { current: [...ITEMS] };

  const context = createFloatingRootContext({
    open,
    referenceElement: trigger,
    floatingElement: floating,
    onOpenChange(next: boolean, details: BaseUIChangeEventDetails) {
      log(`open ${next} ${details.reason}`);
      context.dispatchOpenChange(next, details);
      setOpen(next);
    },
  });

  const click = useClick(context);
  const dismiss = useDismiss(context);
  const list = useListNavigation(context, {
    listRef: elements,
    get activeIndex() {
      return activeIndex();
    },
    onNavigate(index) {
      setActiveIndex(index);
    },
    disabledIndices: [1],
    loopFocus: loop,
  });
  const typeahead = useTypeahead(context, {
    listRef: labels,
    get activeIndex() {
      return activeIndex();
    },
    onMatch(index) {
      setActiveIndex(index);
    },
    disabledIndices: [1],
  });

  const positioning = useAnchorPositioning({
    floatingRootContext: context,
    get mounted() {
      return open();
    },
    side: 'bottom',
    align: 'start',
    sideOffset: 4,
  });

  const triggerProps = mergeProps(
    click.reference,
    dismiss.reference,
    list.reference,
    typeahead.reference,
  );
  const floatingProps = mergeProps(dismiss.floating, list.floating, typeahead.floating);

  return (
    <>
      <button id="before">before</button>
      <button
        id="trigger"
        ref={setTrigger}
        {...triggerProps}
        aria-expanded={open() ? 'true' : 'false'}
      >
        Fruit
      </button>
      {/* The portal sits right after its trigger, as a part's does, so its guards keep the Tab order. */}
      <Show when={open()}>
        <FloatingPortal>
          <div id="positioner" ref={setFloating} style={positioning.positionerStyles()}>
            <FloatingFocusManager context={context} modal={modal}>
              <div
                id="popup"
                role="menu"
                tabindex={-1}
                data-base-ui-focusable=""
                {...floatingProps}
              >
                <For each={ITEMS}>
                  {(label, index) => (
                    <div
                      id={`item-${label.toLowerCase()}`}
                      role="menuitem"
                      ref={(el) => {
                        elements.current[untrack(index)] = el;
                      }}
                      tabindex={activeIndex() === index() ? 0 : -1}
                      aria-disabled={index() === 1 ? 'true' : undefined}
                      data-highlighted={activeIndex() === index() ? '' : undefined}
                      {...list.item}
                    >
                      {label}
                    </div>
                  )}
                </For>
              </div>
            </FloatingFocusManager>
          </div>
        </FloatingPortal>
      </Show>
      <button id="after">after</button>
      <div id="outside" style={{ 'margin-top': '200px', height: '40px' }}>
        outside
      </div>
    </>
  );
}

function HoverCard(): JSX.Element {
  const [open, setOpen] = createSignal(false);
  const [trigger, setTrigger] = createSignal<HTMLElement | null>(null, { ownedWrite: true });
  const [floating, setFloating] = createSignal<HTMLElement | null>(null, { ownedWrite: true });
  const context = createFloatingRootContext({
    open,
    referenceElement: trigger,
    floatingElement: floating,
    onOpenChange(next: boolean, details: BaseUIChangeEventDetails) {
      log(`open ${next} ${details.reason}`);
      context.dispatchOpenChange(next, details);
      setOpen(next);
    },
  });
  const nodeId = useFloatingNodeId();
  const hover = useHoverReferenceInteraction(context, { handleClose: safePolygon() });
  useHoverFloatingInteraction(context);
  const positioning = useAnchorPositioning({
    floatingRootContext: context,
    get mounted() {
      return open();
    },
    nodeId,
    side: 'right',
    align: 'start',
    sideOffset: 40,
  });
  return (
    <div style={{ padding: '40px' }}>
      <a
        id="card-trigger"
        href="#card"
        ref={setTrigger}
        {...hover}
        style={{ display: 'inline-block', width: '80px', height: '30px' }}
      >
        hover me
      </a>
      <Show when={open()}>
        <div
          id="card"
          ref={setFloating}
          style={{
            ...positioning.positionerStyles(),
            width: '200px',
            height: '200px',
            background: '#eee',
          }}
        >
          card
        </div>
      </Show>
      <div id="elsewhere" style={{ 'margin-top': '300px', width: '50px', height: '50px' }}>
        elsewhere
      </div>
    </div>
  );
}

export const fixtures: Record<string, () => JSX.Element> = {
  'list-popup': () => (
    <FloatingTree>
      <ListPopup />
    </FloatingTree>
  ),
  'hover-card': () => (
    <FloatingTree>
      <HoverCard />
    </FloatingTree>
  ),
};
