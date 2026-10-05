// Upstream: packages/react/src/floating-ui-react/components/FloatingPortal.tsx,
// packages/react/src/utils/resolveRef.ts
//
// Renders a popup into a portal node (a `<div data-base-ui-portal>` in the
// body, or in the given container), out of any clipping ancestor. A
// non-modal popup in a portal is still in the Tab order where its trigger
// is: guards before and after the trigger's place send focus into the portal
// and back out, and tabbing out past the end closes the popup.
import { type JSX, Portal, isServer } from '@solidjs/web';
import { isNode } from '@floating-ui/utils/dom';
import {
  type Accessor,
  createContext,
  createEffect,
  createSignal,
  createUniqueId,
  onCleanup,
  omit,
  Show,
  useContext,
} from 'solid-js';

import { createChangeEventDetails } from '../internals/createBaseUIEventDetails.ts';
import { ownerVisuallyHidden } from '../internals/constants.ts';
import { REASONS } from '../internals/reasons.ts';
import type { BaseUIComponentProps } from '../internals/types.ts';
import { useRenderElement } from '../internals/useRenderElement.tsx';
import type { BaseUIChangeEventDetails } from '../internals/createBaseUIEventDetails.ts';
import { addEventListener, mergeCleanups } from '../utils/dom.ts';
import { FocusGuard } from '../utils/FocusGuard.tsx';
import { createAttribute } from './utils/element.ts';
import {
  disableFocusInside,
  enableFocusInside,
  getNextTabbable,
  getPreviousTabbable,
  isOutsideEvent,
} from './utils/tabbable.ts';

export type MaybeRef<T> = T | { current: T };

/** The element itself, or a ref object's `current`. */
export function resolveRef<T extends Element | null | undefined>(maybeRef: MaybeRef<T>): T {
  if (maybeRef == null) {
    return maybeRef as T;
  }
  return typeof maybeRef === 'object' && 'current' in maybeRef ? maybeRef.current : maybeRef;
}

export interface FocusManagerState {
  modal: boolean;
  open: boolean;
  onOpenChange(open: boolean, eventDetails: BaseUIChangeEventDetails): void;
  domReference: Element | null;
  closeOnFocusOut: boolean;
}

export interface PortalContextValue {
  portalNode: Accessor<HTMLElement | null>;
  setFocusManagerState(state: FocusManagerState | null): void;
  beforeInsideRef: { current: HTMLSpanElement | null };
  afterInsideRef: { current: HTMLSpanElement | null };
  beforeOutsideRef: { current: HTMLSpanElement | null };
  afterOutsideRef: { current: HTMLSpanElement | null };
}

const PortalContext = createContext<PortalContextValue | null>(null);

export function usePortalContext(): PortalContextValue | null {
  return useContext(PortalContext);
}

const attr = createAttribute('portal');

export interface FloatingPortalState {}

export interface FloatingPortalProps extends BaseUIComponentProps<'div', FloatingPortalState> {
  /** The element the portal node is rendered into (the enclosing portal's, else the body). `null` waits. */
  container?: MaybeRef<HTMLElement | ShadowRoot | null> | undefined;
  /** The role of the hidden `aria-owns` owner element. */
  portalOwnerRole?: JSX.AriaAttributes['role'] | undefined;
}

export function FloatingPortal(props: FloatingPortalProps): JSX.Element {
  const parent = usePortalContext();
  const [portalNode, setPortalNode] = createSignal<HTMLElement | null>(null, { ownedWrite: true });
  const [focusManagerState, setFocusManagerState] = createSignal<FocusManagerState | null>(null, {
    ownedWrite: true,
  });
  const beforeOutsideRef: { current: HTMLSpanElement | null } = { current: null };
  const afterOutsideRef: { current: HTMLSpanElement | null } = { current: null };
  const beforeInsideRef: { current: HTMLSpanElement | null } = { current: null };
  const afterInsideRef: { current: HTMLSpanElement | null } = { current: null };
  const id = createUniqueId();
  let focusInsideDisabled = false;

  const mount = () => {
    const container = props.container;
    if (container === null) {
      return null;
    }
    const resolved = container && (isNode(container) ? container : container.current);
    return resolved ?? parent?.portalNode() ?? document.body;
  };

  const shouldRenderGuards = () => {
    const state = focusManagerState();
    return !!state && !state.modal && state.open && !!portalNode();
  };

  // Elements inside a non-modal portal are tabbable only once focus has entered it.
  createEffect(
    () => [portalNode(), focusManagerState()?.modal] as const,
    ([node, modal]) => {
      if (!node || modal) {
        return undefined;
      }
      const onFocus = (event: FocusEvent) => {
        if (event.relatedTarget && isOutsideEvent(event)) {
          if (event.type === 'focusin') {
            if (focusInsideDisabled) {
              enableFocusInside(node);
              focusInsideDisabled = false;
            }
          } else {
            disableFocusInside(node);
            focusInsideDisabled = true;
          }
        }
      };
      // Capture, so this runs before a guard's own focus handler.
      return mergeCleanups(
        addEventListener(node, 'focusin', onFocus, true),
        addEventListener(node, 'focusout', onFocus, true),
      );
    },
  );

  createEffect(
    () => [focusManagerState()?.open, portalNode()] as const,
    ([open, node]) => {
      if (!node || open !== true || !focusInsideDisabled) {
        return;
      }
      // Restore tabbability before the focus manager's queued initial focus.
      enableFocusInside(node);
      focusInsideDisabled = false;
    },
  );

  const context: PortalContextValue = {
    portalNode,
    setFocusManagerState: (state) => setFocusManagerState(() => state),
    beforeInsideRef,
    afterInsideRef,
    beforeOutsideRef,
    afterOutsideRef,
  };

  const elementProps = omit(props, 'class', 'style', 'render', 'container', 'portalOwnerRole');

  function PortalElement() {
    onCleanup(() => setPortalNode(null));
    return useRenderElement('div', props, {
      ref: (node: HTMLElement) => setPortalNode(node),
      props: [{ id, [attr]: '' }, elementProps],
    });
  }

  return (
    <>
      <Show when={shouldRenderGuards()}>
        <FocusGuard
          data-type="outside"
          ref={(el) => {
            beforeOutsideRef.current = el;
          }}
          onFocus={(event) => {
            const node = portalNode();
            if (node && isOutsideEvent(event, node)) {
              beforeInsideRef.current?.focus();
            } else {
              getPreviousTabbable(focusManagerState()?.domReference ?? null)?.focus();
            }
          }}
        />
        <span role={props.portalOwnerRole} aria-owns={id} style={ownerVisuallyHidden} />
      </Show>
      <PortalContext value={context}>
        {/* A server render has no body to portal into: Solid's server `Portal`
            renders nothing and never reads its mount, so the server takes this
            branch without one, as the client's hydration will. */}
        <Show when={isServer || mount()}>
          {/* Solid only appends into the mount, which a shadow root supports too. */}
          <Portal mount={(mount() ?? undefined) as Element | undefined}>
            <PortalElement />
          </Portal>
        </Show>
      </PortalContext>
      <Show when={shouldRenderGuards()}>
        <FocusGuard
          data-type="outside"
          ref={(el) => {
            afterOutsideRef.current = el;
          }}
          onFocus={(event) => {
            const node = portalNode();
            if (node && isOutsideEvent(event, node)) {
              afterInsideRef.current?.focus();
            } else {
              const state = focusManagerState();
              getNextTabbable(state?.domReference ?? null)?.focus();
              if (state?.closeOnFocusOut) {
                state.onOpenChange(false, createChangeEventDetails(REASONS.focusOut, event));
              }
            }
          }}
        />
      </Show>
    </>
  );
}
