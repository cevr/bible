import { Option } from 'effect';
import { type Accessor, type Component, Show } from 'solid-js';
import { FolderBrowser } from '../folder-browser.js';
import { ReaderPane } from '../reader-pane.js';
import { TocPlusLibraryDrawer } from '../toc-plus-library-drawer.js';
import { ReaderPanel } from '../ui/reader-panel.js';
import type { BibleDrawerState } from '../../services/bible-drawer-state.js';
import type { ReaderSelection } from '../../services/reader-state.js';
import type { DrawerState } from '../../app.js';

interface EgwModeViewProps {
  readonly selection: Accessor<Option.Option<ReaderSelection>>;
  readonly rehydrated: () => boolean;
  readonly restoreParagraphId: Accessor<Option.Option<string>>;
  readonly readerFontFamily: Accessor<string>;
  readonly onHighlightApplied: () => void;
  readonly onParagraphScrolledIntoView: (chapterParaId: string, paragraphParaId: string) => void;
  readonly onPickBookFromLanding: (bookId: number) => void;
  readonly onPickBookFromDrawer: (bookId: number) => void;
  readonly bibleDrawer: BibleDrawerState;
  readonly drawer: () => DrawerState;
  readonly closeDrawers: () => void;
  readonly toggleLibraryPane: () => void;
  readonly currentBookId: () => number | null;
}

// EGW-mode canvas + left drawer. Two surfaces depending on whether a book is
// open: the FolderBrowser landing canvas (no drawer) or the ReaderPane (TOC
// + library drawer reachable). The library half of the drawer expands when
// `tocPlusLib` is active — see app.tsx's drawerReducer.
export const EgwModeView: Component<EgwModeViewProps> = (props) => {
  const hasBook = (): boolean => Option.isSome(props.selection());

  return (
    <>
      <Show
        when={hasBook()}
        fallback={
          <Show when={props.rehydrated()}>
            <div class="absolute inset-0 overflow-auto">
              <FolderBrowser onPickBook={props.onPickBookFromLanding} />
            </div>
          </Show>
        }
      >
        <ReaderPane
          selection={props.selection()}
          onHighlightApplied={props.onHighlightApplied}
          restoreParagraphId={props.restoreParagraphId}
          onParagraphScrolledIntoView={props.onParagraphScrolledIntoView}
          fontFamily={props.readerFontFamily}
          onScriptureClick={(title) => {
            props.bibleDrawer.openFromQuery(title);
          }}
        />
      </Show>

      <ReaderPanel
        open={hasBook() && props.drawer() !== 'closed' && props.currentBookId() !== null}
        onOpenChange={(open) => {
          if (!open) props.closeDrawers();
        }}
        side="left"
        widthPx={() => (props.drawer() === 'tocPlusLib' ? 720 : 360)}
        overlay
        label="Library and contents"
        panelClass="flex-row"
      >
        <TocPlusLibraryDrawer
          bookId={props.currentBookId}
          expanded={() => props.drawer() === 'tocPlusLib'}
          onToggle={props.toggleLibraryPane}
          onPickBook={props.onPickBookFromDrawer}
        />
      </ReaderPanel>
    </>
  );
};
