import { type Accessor, type Component, Show } from 'solid-js';
import { FolderBrowser } from './folder-browser.js';
import { TocSidebar } from './toc-sidebar.js';

// Left drawer body for EGW mode: a 360-px Contents pane (per-book TOC) with
// an animated Library reveal alongside. Owns the divider, the library-pane
// opacity transition, and the toggle button — app.tsx hands in the active
// book, the expanded flag, and the toggle/pick events.
//
// Lives in a `ReaderPanel` whose width preset switch (360 → 720) is driven
// from the same `expanded` accessor at the app level. Two sides of the same
// concept stay in sync because both read `drawer() === 'tocPlusLib'`.

export interface TocPlusLibraryDrawerProps {
  readonly bookId: Accessor<number | null>;
  readonly expanded: Accessor<boolean>;
  readonly onToggle: () => void;
  readonly onPickBook: (bookId: number) => void;
}

export const TocPlusLibraryDrawer: Component<TocPlusLibraryDrawerProps> = (props) => (
  <>
    <div class="flex flex-col min-w-0 h-full flex-[0_0_360px] border-r border-rule">
      <div class="flex items-center justify-between gap-2 px-4 py-3 border-b border-rule flex-[0_0_auto]">
        <h2 class="m-0 text-ui-sm font-semibold tracking-[0.08em] uppercase text-muted">
          Contents
        </h2>
        <button
          type="button"
          class="bg-transparent border border-rule rounded-md px-2 py-1 text-ui-xs text-fg cursor-pointer transition-[background,border-color] duration-[0.12s] ease-in-out hover:bg-[color-mix(in_srgb,var(--color-accent)_6%,transparent)] hover:border-accent hover:outline-none focus-visible:bg-[color-mix(in_srgb,var(--color-accent)_6%,transparent)] focus-visible:border-accent focus-visible:outline-none"
          onClick={props.onToggle}
          title={props.expanded() ? 'Hide library' : 'Open library'}
        >
          {props.expanded() ? 'Close library' : 'Library'}
        </button>
      </div>
      <div class="flex-1 min-h-0 overflow-y-auto">
        <Show when={props.bookId()} keyed>
          {(bookId) => <TocSidebar bookId={bookId} />}
        </Show>
      </div>
    </div>

    <div
      class="flex flex-col min-w-0 h-full flex-auto opacity-0 pointer-events-none transition-opacity duration-[0.18s] ease-in-out delay-[0.04s] data-expanded:opacity-100 data-expanded:pointer-events-auto"
      data-expanded={props.expanded() ? '' : undefined}
      aria-hidden={!props.expanded()}
    >
      <div class="flex items-center justify-between gap-2 px-4 py-3 border-b border-rule flex-[0_0_auto]">
        <h2 class="m-0 text-ui-sm font-semibold tracking-[0.08em] uppercase text-muted">Library</h2>
      </div>
      <div class="flex-1 min-h-0 overflow-y-auto">
        <FolderBrowser onPickBook={props.onPickBook} initialBookId={props.bookId()} />
      </div>
    </div>
  </>
);
