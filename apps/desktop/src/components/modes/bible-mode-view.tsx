import type { Option } from 'effect';
import { type Accessor, type Component } from 'solid-js';
import { BibleChapterCanvas } from '../bible-chapter-canvas.js';
import { BibleTocSidebar } from '../bible-toc-sidebar.js';
import { CommandPalette } from '../command-palette.js';
import { ReaderPanel } from '../ui/reader-panel.js';
import type { BibleDrawerState } from '../../services/bible-drawer-state.js';
import type { BibleReaderSelection } from '../../services/bible-reader-state.js';
import type { DrawerState } from '../../app.js';

interface BibleModeViewProps {
  readonly drawer: () => DrawerState;
  readonly closeDrawers: () => void;
  readonly bibleDrawer: BibleDrawerState;
  readonly bibleTocSelection: Accessor<
    Option.Option<{ readonly book: number; readonly chapter: number }>
  >;
  readonly bibleSelection: Accessor<Option.Option<BibleReaderSelection>>;
  readonly paletteOpen: () => boolean;
  readonly setPaletteOpen: (next: boolean | ((open: boolean) => boolean)) => void;
}

// Bible-mode canvas, left TOC drawer, and the command palette. Mounted under
// a `<Switch>` in App so EGW-mode chrome doesn't reach into the chapter
// canvas tree, and vice versa — adding a Bible-only affordance (e.g. a
// per-chapter compare strip) is a change here, not a deeper nested `<Show>`
// in app.tsx.
export const BibleModeView: Component<BibleModeViewProps> = (props) => (
  <>
    <BibleChapterCanvas
      onOpenStrongs={(book, chapter, verse, code) =>
        props.bibleDrawer.open(book, chapter, verse, 'words', { _tag: 'strongs', verse, code })
      }
      onOpenMarginNote={(book, chapter, verse) =>
        props.bibleDrawer.open(book, chapter, verse, 'notes', {
          _tag: 'note',
          verse,
          noteIndex: 0,
        })
      }
      onOpenCrossRefs={(book, chapter, verse) =>
        props.bibleDrawer.open(book, chapter, verse, 'xrefs')
      }
    />

    {/* Left drawer — in-shell ReaderPanel. Bible mode shows just the
        books/chapters TOC; there's no Library pane to expand. */}
    <ReaderPanel
      open={props.drawer() !== 'closed'}
      onOpenChange={(open) => {
        if (!open) props.closeDrawers();
      }}
      side="left"
      widthPx={() => 360}
      overlay
      label="Bible books"
    >
      <div class="flex items-center justify-between gap-2 px-4 py-3 border-b border-rule flex-[0_0_auto]">
        <h2 class="m-0 text-ui-sm font-semibold tracking-[0.08em] uppercase text-muted">Bible</h2>
      </div>
      <div class="flex-1 min-h-0 overflow-y-auto">
        <BibleTocSidebar
          currentSelection={props.bibleTocSelection}
          onPickChapter={props.closeDrawers}
        />
      </div>
    </ReaderPanel>

    <CommandPalette
      open={props.paletteOpen()}
      onOpenChange={props.setPaletteOpen}
      currentSelection={props.bibleSelection}
    />
  </>
);
