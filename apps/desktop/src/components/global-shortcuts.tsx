import { type Component, onCleanup, onMount } from 'solid-js';
import type { DrawerState } from '../app.js';
import { FONT_KEY_STEP, useReaderSettingsCtx } from './settings/reader-settings-provider.js';

type OverlayKind = 'settings' | 'search' | 'palette';

interface GlobalShortcutsProps {
  readonly isBibleMode: () => boolean;
  readonly drawer: () => DrawerState;
  readonly topOverlay: () => OverlayKind | undefined;
  readonly setPaletteOpen: (next: boolean | ((open: boolean) => boolean)) => void;
  readonly focusSearch: () => void;
  readonly closeDrawers: () => void;
  readonly popOverlay: (o: OverlayKind) => void;
  readonly closeSearch: () => void;
  readonly searchInputRef: () => HTMLInputElement | undefined;
  readonly setSettingsOpen: (next: boolean | ((open: boolean) => boolean)) => void;
}

// Owns the global keydown listener. The typography shortcuts (Cmd+T cycles
// theme, Cmd ± steps the reader font) talk to ReaderSettings via the provider
// so app.tsx no longer threads `cycleTheme` / `setFontSize` through here.
// Renders nothing — purely a side-effect mount.
export const GlobalShortcuts: Component<GlobalShortcutsProps> = (props) => {
  const settings = useReaderSettingsCtx();

  const onKey = (e: KeyboardEvent): void => {
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key === 'k') {
      e.preventDefault();
      // In Bible mode Cmd+K opens the navigation palette; in EGW mode it
      // keeps the legacy behavior of focusing the header search input.
      if (props.isBibleMode()) {
        props.setPaletteOpen((open) => !open);
      } else {
        props.focusSearch();
      }
      return;
    }
    if (mod && e.key === 'Escape') {
      e.preventDefault();
      props.closeDrawers();
      return;
    }
    if (!mod) {
      // Esc pops the top overlay (most-recently opened wins). Falls through
      // to the side drawer only when no overlay is open. The stack itself
      // enforces "only one is interactive"; this handler just consumes Esc
      // in the right order.
      if (e.key === 'Escape') {
        const top = props.topOverlay();
        if (top === 'palette') {
          e.preventDefault();
          props.popOverlay('palette');
          return;
        }
        if (top === 'search') {
          e.preventDefault();
          props.closeSearch();
          props.searchInputRef()?.blur();
          return;
        }
        if (top === 'settings') {
          e.preventDefault();
          props.popOverlay('settings');
          return;
        }
        if (props.drawer() !== 'closed') {
          e.preventDefault();
          props.closeDrawers();
        }
      }
      return;
    }
    switch (e.key) {
      case 't':
        e.preventDefault();
        settings.cycleTheme();
        return;
      case '=':
      case '+':
        e.preventDefault();
        settings.setFontSize(FONT_KEY_STEP[settings.fontSize()].up);
        return;
      case '-':
        e.preventDefault();
        settings.setFontSize(FONT_KEY_STEP[settings.fontSize()].down);
        return;
      case ',':
        e.preventDefault();
        props.setSettingsOpen((open) => !open);
        return;
      case 'm':
        e.preventDefault();
        settings.toggleReaderMode();
        return;
      default:
        return;
    }
  };

  onMount(() => {
    window.addEventListener('keydown', onKey);
    onCleanup(() => window.removeEventListener('keydown', onKey));
  });

  return null;
};
