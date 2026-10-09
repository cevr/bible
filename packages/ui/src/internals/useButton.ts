// Upstream: packages/react/src/internals/use-button/useButton.ts,
// packages/react/src/utils/useFocusableWhenDisabled.ts,
// packages/react/src/utils/dispatchClickWithModifiers.ts
//
// Button behaviour for a part's element: a native `<button type="button">`,
// or a `role="button"` element that Enter activates. Inside a composite
// widget (a toggle group, a menu) the element takes its tab stop from the
// composite and Space activates on keydown. Upstream's disabled state
// (`focusableWhenDisabled`, `aria-disabled`) and its link arm are left out:
// no part is disabled through the button, and none renders a link.
import { isHTMLElement } from '@floating-ui/utils/dom';

import { makeEventPreventable, mergeProps } from '../merge-props/mergeProps.ts';
import { ownerWindow } from '../utils/dom.ts';
import type { BaseUIEvent, HTMLProps } from './types.ts';

interface ModifierState {
  shiftKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  metaKey: boolean;
}

/**
 * Dispatches a click carrying the source event's modifier keys (`click()`
 * reports none). `detail` 0 and `pointerType` `''` mark a keyboard click.
 */
export function dispatchClickWithModifiers(
  target: Element,
  sourceEvent: ModifierState,
  options: { detail?: number | undefined; pointerType?: string | undefined } = {},
) {
  target.dispatchEvent(
    new (ownerWindow(target).PointerEvent)('click', {
      bubbles: true,
      cancelable: true,
      composed: true,
      detail: options.detail ?? 0,
      pointerType: options.pointerType ?? '',
      shiftKey: sourceEvent.shiftKey,
      ctrlKey: sourceEvent.ctrlKey,
      altKey: sourceEvent.altKey,
      metaKey: sourceEvent.metaKey,
    }),
  );
}

interface UseButtonParameters {
  /** Whether the element is a native `<button>`. */
  native?: boolean | undefined;
  /** Whether the button is an item of a composite widget (Space acts on keydown). */
  composite?: boolean | undefined;
}

interface UseButtonReturnValue {
  /** The button's props merged under `externalProps`, whose key handlers it wraps. */
  getButtonProps: (externalProps?: HTMLProps) => HTMLProps;
}

function isButtonElement(elem: Element | null): elem is HTMLButtonElement {
  return isHTMLElement(elem) && elem.tagName === 'BUTTON';
}

type Handler<E extends Event> = ((event: E) => void) | undefined;

/** The handlers `getButtonProps` wraps, so the external ones reach the element only through it. */
const WRAPPED_HANDLERS: ReadonlySet<PropertyKey> = new Set(['onKeyDown', 'onKeyUp']);

export function useButton(params: UseButtonParameters = {}): UseButtonReturnValue {
  const isNativeButton = () => params.native ?? true;
  const isCompositeItem = () => params.composite ?? false;

  const getButtonProps = (externalProps: HTMLProps = {}): HTMLProps => {
    const external = <E extends Event>(key: string) => externalProps[key] as Handler<E>;
    const internal: HTMLProps = {
      onKeyDown(rawEvent: KeyboardEvent) {
        const event: BaseUIEvent<KeyboardEvent> = makeEventPreventable(rawEvent);
        external<KeyboardEvent>('onKeyDown')?.(event);
        if (event.baseUIHandlerPrevented || event.target !== event.currentTarget) {
          return;
        }
        const native = isNativeButton();
        const currentTarget = event.currentTarget as Element;
        const isButton = isButtonElement(currentTarget);
        const role = currentTarget.getAttribute('role');
        const isTextNavigationRole =
          role?.startsWith('menuitem') || role === 'option' || role === 'gridcell';

        if (isCompositeItem() && event.key === ' ') {
          if (event.defaultPrevented && isTextNavigationRole) {
            return;
          }
          event.preventDefault();
          // Only a native-mode item that is not a real <button> is left out.
          if (!native || isButton) {
            event.preventBaseUIHandler();
            dispatchClickWithModifiers(currentTarget, event);
          }
          return;
        }

        // A native button activates itself; a `role="button"` element on Enter.
        // A prevented keydown cancels activation.
        if (native || event.key !== 'Enter' || event.defaultPrevented) {
          return;
        }
        event.preventDefault();
        event.preventBaseUIHandler();
        dispatchClickWithModifiers(currentTarget, event);
      },
      onKeyUp(rawEvent: KeyboardEvent) {
        // A prevented keyup on a <button> stops Space from clicking it.
        const event: BaseUIEvent<KeyboardEvent> = makeEventPreventable(rawEvent);
        external<KeyboardEvent>('onKeyUp')?.(event);
        if (
          event.target === event.currentTarget &&
          isNativeButton() &&
          isCompositeItem() &&
          isButtonElement(event.currentTarget as HTMLElement) &&
          event.key === ' '
        ) {
          event.preventDefault();
        }
      },
    };
    const kind: HTMLProps = {
      get type() {
        return isNativeButton() ? 'button' : undefined;
      },
      get role() {
        return isNativeButton() ? undefined : 'button';
      },
      // The composite owns its items' tab stops.
      get tabindex() {
        return isCompositeItem() ? undefined : 0;
      },
    };
    const rest = new Proxy(externalProps, {
      get: (target, key) => (WRAPPED_HANDLERS.has(key) ? undefined : Reflect.get(target, key)),
      has: (target, key) => !WRAPPED_HANDLERS.has(key) && Reflect.has(target, key),
      ownKeys: (target) => Reflect.ownKeys(target).filter((key) => !WRAPPED_HANDLERS.has(key)),
    });
    return mergeProps(internal, kind, rest);
  };

  return { getButtonProps };
}
