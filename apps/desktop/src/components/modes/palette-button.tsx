import { type Component } from 'solid-js';

interface PaletteButtonProps {
  readonly onOpen: () => void;
}

// Bible-mode header center slot. The palette itself mounts inside
// BibleModeView; this button just signals "open it". Visually mirrors the
// EGW search input so the two slots feel like the same widget switching by
// mode rather than two unrelated controls.
export const PaletteButton: Component<PaletteButtonProps> = (props) => (
  <button
    type="button"
    class="w-[min(420px,100%)] h-[calc(28px*var(--ui-scale))] px-3 inline-flex items-center justify-between gap-2 rounded-md border border-rule bg-[color-mix(in_srgb,var(--color-bg)_70%,var(--color-fg)_4%)] text-muted text-ui-base cursor-pointer transition-[background,border-color,color] duration-[0.12s] ease-in-out [-webkit-app-region:no-drag] hover:border-accent hover:text-fg focus-visible:border-accent focus-visible:text-fg focus-visible:outline-none"
    onClick={props.onOpen}
    title="Jump to chapter or verse (⌘K)"
    aria-label="Open command palette"
  >
    <span class="truncate">Jump to chapter or verse…</span>
    <kbd class="inline-flex items-center px-1.5 py-0.5 rounded border border-rule text-muted text-ui-sm font-medium">
      ⌘K
    </kbd>
  </button>
);
