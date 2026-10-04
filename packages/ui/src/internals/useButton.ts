// Upstream: packages/react/src/internals/use-button/useButton.ts,
// packages/react/src/utils/useFocusableWhenDisabled.ts,
// packages/react/src/utils/dispatchClickWithModifiers.ts
//
// Button behaviour for a part's element: a native `<button type="button">`,
// or any element with `role="button"`, Enter and Space activation, and the
// disabled state (optionally still focusable, with `aria-disabled`). Inside a
// composite widget (a toolbar, a menu) Space activates on keydown, and a
// disabled item stays focusable so arrow keys can reach it.
import { isHTMLElement } from '@floating-ui/utils/dom';
import { createEffect, createSignal } from 'solid-js';

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

export interface UseFocusableWhenDisabledParameters {
  /** Whether a disabled element stays focusable; composite items are by default. */
  focusableWhenDisabled?: boolean | undefined;
  disabled: boolean;
  composite?: boolean | undefined;
  tabIndex?: number | undefined;
  isNativeButton: boolean;
}

/** The disabled-state props: `disabled` or `aria-disabled`, and the tabindex. */
export function useFocusableWhenDisabled(params: UseFocusableWhenDisabledParameters): HTMLProps {
  const composite = () => params.composite ?? false;
  return {
    // Tab still leaves a focusable disabled element.
    onKeyDown(event: KeyboardEvent) {
      if (params.disabled && params.focusableWhenDisabled && event.key !== 'Tab') {
        event.preventDefault();
      }
    },
    get tabindex() {
      if (composite()) {
        return undefined;
      }
      const tabIndex = params.tabIndex ?? 0;
      if (!params.isNativeButton && params.disabled) {
        return params.focusableWhenDisabled ? tabIndex : -1;
      }
      return tabIndex;
    },
    get 'aria-disabled'() {
      const isFocusableComposite = composite() && params.focusableWhenDisabled !== false;
      if (
        (params.isNativeButton && (params.focusableWhenDisabled || isFocusableComposite)) ||
        (!params.isNativeButton && params.disabled)
      ) {
        return params.disabled ? 'true' : undefined;
      }
      return undefined;
    },
    get disabled() {
      const isNonFocusableComposite = composite() && params.focusableWhenDisabled === false;
      if (params.isNativeButton && (!params.focusableWhenDisabled || isNonFocusableComposite)) {
        return params.disabled || undefined;
      }
      return undefined;
    },
  };
}

export interface UseButtonParameters {
  disabled?: boolean | undefined;
  focusableWhenDisabled?: boolean | undefined;
  tabIndex?: number | undefined;
  /** Whether the element is a native `<button>`. */
  native?: boolean | undefined;
  /** Whether the button is an item of a composite widget (Space acts on keydown). */
  composite?: boolean | undefined;
}

export interface UseButtonReturnValue {
  /** The button's props merged under `externalProps`, whose handlers it wraps. */
  getButtonProps: (externalProps?: HTMLProps) => HTMLProps;
  /** Pass to the element's `ref`. */
  buttonRef: (element: HTMLElement | null) => void;
}

function isButtonElement(elem: Element | null): elem is HTMLButtonElement {
  return isHTMLElement(elem) && elem.tagName === 'BUTTON';
}

function isValidLinkElement(elem: Element | null): elem is HTMLAnchorElement {
  return isHTMLElement(elem) && elem.tagName === 'A' && Boolean((elem as HTMLAnchorElement).href);
}

type Handler<E extends Event> = ((event: E) => void) | undefined;

export function useButton(params: UseButtonParameters = {}): UseButtonReturnValue {
  const [element, setElement] = createSignal<HTMLElement | null>(null, { ownedWrite: true });
  const disabled = () => params.disabled ?? false;
  const isNativeButton = () => params.native ?? true;
  const isCompositeItem = () => params.composite ?? false;

  const focusableProps = useFocusableWhenDisabled({
    get focusableWhenDisabled() {
      return params.focusableWhenDisabled;
    },
    get disabled() {
      return disabled();
    },
    get composite() {
      return isCompositeItem();
    },
    get tabIndex() {
      return params.tabIndex;
    },
    get isNativeButton() {
      return isNativeButton();
    },
  });

  // A disabled composite button rendering another button (a toolbar button
  // rendering a menu trigger) stays focusable: the inner `disabled` is removed.
  createEffect(
    () => [element(), disabled(), focusableProps['disabled'], isCompositeItem()] as const,
    ([el, isDisabled, focusableDisabled, composite]) => {
      if (
        isButtonElement(el) &&
        composite &&
        isDisabled &&
        focusableDisabled === undefined &&
        el.disabled
      ) {
        el.disabled = false;
      }
    },
  );

  const getButtonProps = (externalProps: HTMLProps = {}): HTMLProps => {
    const external = <E extends Event>(key: string) => externalProps[key] as Handler<E>;
    const internal: HTMLProps = {
      onClick(event: MouseEvent) {
        if (disabled()) {
          event.preventDefault();
          return;
        }
        external<MouseEvent>('onClick')?.(event);
      },
      onMouseDown(event: MouseEvent) {
        if (!disabled()) {
          external<MouseEvent>('onMouseDown')?.(event);
        }
      },
      onKeyDown(rawEvent: KeyboardEvent) {
        if (disabled()) {
          return;
        }
        const event: BaseUIEvent<KeyboardEvent> = makeEventPreventable(rawEvent);
        external<KeyboardEvent>('onKeyDown')?.(event);
        if (event.baseUIHandlerPrevented) {
          return;
        }
        const native = isNativeButton();
        const isCurrentTarget = event.target === event.currentTarget;
        const currentTarget = event.currentTarget as Element;
        const isButton = isButtonElement(currentTarget);
        const isLink = !native && isValidLinkElement(currentTarget);
        const shouldClick = isCurrentTarget && (native ? isButton : !isLink);
        const isEnterKey = event.key === 'Enter';
        const isSpaceKey = event.key === ' ';
        const role = currentTarget.getAttribute('role');
        const isTextNavigationRole =
          role?.startsWith('menuitem') || role === 'option' || role === 'gridcell';

        if (isCurrentTarget && isCompositeItem() && isSpaceKey) {
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

        if (!shouldClick || native || (!isSpaceKey && !isEnterKey)) {
          // A link activates on Space at keyup; stop the page scroll Space would cause.
          if (isCurrentTarget && isLink && isSpaceKey) {
            event.preventDefault();
          }
          return;
        }
        // As a native button: a prevented keydown cancels activation.
        if (event.defaultPrevented) {
          return;
        }
        event.preventDefault();
        if (isEnterKey) {
          event.preventBaseUIHandler();
          dispatchClickWithModifiers(currentTarget, event);
        }
      },
      onKeyUp(rawEvent: KeyboardEvent) {
        if (disabled()) {
          return;
        }
        // A prevented keyup on a <button> stops Space from clicking it.
        const event: BaseUIEvent<KeyboardEvent> = makeEventPreventable(rawEvent);
        external<KeyboardEvent>('onKeyUp')?.(event);
        const native = isNativeButton();
        if (
          event.target === event.currentTarget &&
          native &&
          isCompositeItem() &&
          isButtonElement(event.currentTarget as HTMLElement) &&
          event.key === ' '
        ) {
          event.preventDefault();
          return;
        }
        if (event.baseUIHandlerPrevented) {
          return;
        }
        // A non-button element clicks on Space at keyup, unless the keyup is prevented.
        if (
          event.target === event.currentTarget &&
          !native &&
          !isCompositeItem() &&
          !event.defaultPrevented &&
          event.key === ' '
        ) {
          event.preventBaseUIHandler();
          dispatchClickWithModifiers(event.currentTarget as Element, event);
        }
      },
      onPointerDown(event: PointerEvent) {
        if (disabled()) {
          event.preventDefault();
          return;
        }
        external<PointerEvent>('onPointerDown')?.(event);
      },
    };
    const kind: HTMLProps = {
      get type() {
        return isNativeButton() ? 'button' : undefined;
      },
      get role() {
        return isNativeButton() ? undefined : 'button';
      },
    };
    const rest = new Proxy(externalProps, {
      get: (target, key) =>
        key === 'onClick' ||
        key === 'onMouseDown' ||
        key === 'onKeyDown' ||
        key === 'onKeyUp' ||
        key === 'onPointerDown'
          ? undefined
          : Reflect.get(target, key),
      has: (target, key) =>
        key === 'onClick' ||
        key === 'onMouseDown' ||
        key === 'onKeyDown' ||
        key === 'onKeyUp' ||
        key === 'onPointerDown'
          ? false
          : Reflect.has(target, key),
      ownKeys: (target) =>
        Reflect.ownKeys(target).filter(
          (key) =>
            key !== 'onClick' &&
            key !== 'onMouseDown' &&
            key !== 'onKeyDown' &&
            key !== 'onKeyUp' &&
            key !== 'onPointerDown',
        ),
    });
    return mergeProps(internal, kind, focusableProps, rest);
  };

  return {
    getButtonProps,
    buttonRef: (el) => setElement(() => el),
  };
}
