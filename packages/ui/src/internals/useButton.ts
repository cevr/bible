// Upstream: packages/react/src/internals/use-button/useButton.ts,
// packages/react/src/utils/useFocusableWhenDisabled.ts,
// packages/react/src/utils/dispatchClickWithModifiers.ts
//
// Button behaviour for a part's element, as a mixin (`../mix/mix.ts`): a
// native `<button type="button">`, or a `role="button"` element that Enter
// activates. Inside a composite widget (a toggle group, a menu) the element
// takes its tab stop from the composite and Space activates on keydown.
// Upstream's disabled state (`focusableWhenDisabled`, `aria-disabled`) and its
// link arm are left out: no part is disabled through the button, and none
// renders a link.
import { isHTMLElement } from '@floating-ui/utils/dom';

import { mix, type Mixin } from '../mix/mix.ts';
import { ownerWindow } from '../utils/dom.ts';

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

function isButtonElement(elem: Element | null): elem is HTMLButtonElement {
  return isHTMLElement(elem) && elem.tagName === 'BUTTON';
}

/**
 * The button's behaviour as a mixin. A part puts it first among its props, so
 * their key handlers run before its own and may stop them with
 * `event.preventBaseUIHandler()`, and their attributes win over its. Typed
 * for a `<button>`; with `native: false` it reads only what every element has.
 */
export function useButton(params: UseButtonParameters = {}): Mixin<HTMLButtonElement> {
  const native = params.native ?? true;
  const composite = params.composite ?? false;
  return mix<HTMLButtonElement>(
    native ? { type: 'button' } : { role: 'button' },
    // The composite owns its items' tab stops: the key is left out, so the item's stands.
    !composite && { tabindex: 0 },
    {
      onKeyDown(event) {
        if (event.target !== event.currentTarget) {
          return;
        }
        const currentTarget = event.currentTarget;
        const isButton = isButtonElement(currentTarget);
        const role = currentTarget.getAttribute('role');
        const isTextNavigationRole =
          role?.startsWith('menuitem') || role === 'option' || role === 'gridcell';

        if (composite && event.key === ' ') {
          if (event.defaultPrevented && isTextNavigationRole) {
            return;
          }
          event.preventDefault();
          // Only a native-mode item that is not a real <button> is left out.
          if (!native || isButton) {
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
        dispatchClickWithModifiers(currentTarget, event);
      },
      onKeyUp(event) {
        // A prevented keyup on a <button> stops Space from clicking it.
        if (
          event.target === event.currentTarget &&
          native &&
          composite &&
          isButtonElement(event.currentTarget) &&
          event.key === ' '
        ) {
          event.preventDefault();
        }
      },
    },
  );
}
