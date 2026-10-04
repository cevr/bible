// Upstream: packages/react/src/drawer/indent/DrawerIndent.tsx,
// packages/react/src/drawer/indent-background/DrawerIndentBackground.tsx
//
// The page content behind the drawers of a `Drawer.Provider`: `data-active`
// while any drawer is open (`data-inactive` otherwise), for a pushed-back
// look. `Drawer.Indent` also follows the frontmost drawer's swipe through
// `--drawer-swipe-progress` and `--drawer-height`; `Drawer.IndentBackground`
// is the layer showing behind it.
import type { JSX } from '@solidjs/web';
import { createEffect, createSignal, omit } from 'solid-js';

import type { StateAttributesMapping } from '../../internals/getStateAttributesProps.ts';
import type { BaseUIComponentProps } from '../../internals/types.ts';
import { useRenderElement } from '../../internals/useRenderElement.tsx';
import { useDrawerProviderContext } from '../provider/DrawerProviderContext.ts';
import { DrawerBackdropCssVars, DrawerPopupCssVars } from '../utils/drawerAttributes.ts';

export interface DrawerIndentState {
  /** Whether any drawer in the provider is open. */
  active: boolean;
}

export interface DrawerIndentProps extends BaseUIComponentProps<'div', DrawerIndentState> {}

export interface DrawerIndentBackgroundState {
  active: boolean;
}

export interface DrawerIndentBackgroundProps extends BaseUIComponentProps<
  'div',
  DrawerIndentBackgroundState
> {}

const ACTIVE_HOOK = { 'data-active': '' };
const INACTIVE_HOOK = { 'data-inactive': '' };

const activeStateAttributesMapping: StateAttributesMapping<{ active: boolean }> = {
  active: (value) => (value ? ACTIVE_HOOK : INACTIVE_HOOK),
};

/**
 * A wrapper for the app content that is indented while a drawer is open.
 * Renders a `<div>` element.
 */
export function DrawerIndent(componentProps: DrawerIndentProps): JSX.Element {
  const provider = useDrawerProviderContext();
  const elementProps = omit(componentProps, 'class', 'style', 'render');
  const [element, setElement] = createSignal<HTMLElement | null>(null, { ownedWrite: true });

  // Written straight to the element: they change on every move of a swipe.
  if (provider) {
    createEffect(
      () => [element(), provider.visualState()] as const,
      ([indent, { swipeProgress, frontmostHeight }]) => {
        if (!indent) {
          return undefined;
        }
        indent.style.setProperty(
          DrawerBackdropCssVars.swipeProgress,
          swipeProgress > 0 ? `${swipeProgress}` : '0',
        );
        if (frontmostHeight > 0) {
          indent.style.setProperty(DrawerPopupCssVars.height, `${frontmostHeight}px`);
        } else {
          indent.style.removeProperty(DrawerPopupCssVars.height);
        }
        return undefined;
      },
    );
  }

  const state: DrawerIndentState = {
    get active() {
      return provider?.active() ?? false;
    },
  };

  return useRenderElement('div', componentProps, {
    state,
    ref: (el: HTMLElement) => setElement(el),
    stateAttributesMapping: activeStateAttributesMapping,
    props: [{ style: { [DrawerBackdropCssVars.swipeProgress]: '0' } }, elementProps],
  });
}

/**
 * The layer shown behind the indented app content while a drawer is open.
 * Renders a `<div>` element.
 */
export function DrawerIndentBackground(componentProps: DrawerIndentBackgroundProps): JSX.Element {
  const provider = useDrawerProviderContext();
  const elementProps = omit(componentProps, 'class', 'style', 'render');
  const state: DrawerIndentBackgroundState = {
    get active() {
      return provider?.active() ?? false;
    },
  };
  return useRenderElement('div', componentProps, {
    state,
    stateAttributesMapping: activeStateAttributesMapping,
    props: elementProps,
  });
}
