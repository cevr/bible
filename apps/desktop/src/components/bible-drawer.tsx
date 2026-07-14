import { getBibleBook } from '@bible/core/bible';
import { Fiber } from 'effect';
import {
  type Accessor,
  type Component,
  createEffect,
  createMemo,
  For,
  onCleanup,
  onMount,
  Show,
} from 'solid-js';
import { runtime } from '../runtime.js';
import type {
  BibleDrawerState,
  BibleStudyTab,
  DrawerTarget,
} from '../services/bible-drawer-state.js';
import { connectBibleDrawerCursor } from '../services/bible-drawer-cursor.js';
import { EgwTab } from './bible-drawer/egw-tab.js';
import { NotesTab } from './bible-drawer/notes-tab.js';
import { XrefsTab } from './bible-drawer/xrefs-tab.js';
import { ReaderShell } from './ui/reader-shell.js';
import { WordsTab } from './bible-drawer/words-tab.js';

// Right-side verse-pinned study drawer. Single component for both reader modes;
// the parent decides what fires `state.open` (Bible mode: gutter / margin-note
// / Strong's-super / `e` marker. EGW mode: ScriptureRef clicks). The drawer
// itself stays mode-agnostic: it just renders the four study tabs (Notes,
// Cross-refs, Words, EGW) against whatever verse the state is pinned to.
//
// In Bible mode the cursor in `BibleReaderState` drives `state.cursorMoved`
// while the drawer is open, so j/k on the canvas updates the drawer's verse
// without re-opening it. The opt-in subscription is started in `onMount` and
// the drawer only acts on changes when open (see `cursorMoved` in state).

const DRAWER_WIDTH_PX = 380;

export interface BibleDrawerProps {
  readonly state: BibleDrawerState;
}

export const BibleDrawer: Component<BibleDrawerProps> = (props) => {
  // Bible-mode cursor follow. Subscribes to BibleReaderState's changes stream
  // and forwards (book, chapter, verse) into the drawer's `cursorMoved`. This
  // is harmless in EGW mode — BibleReaderState's selection is None there, so
  // the stream simply doesn't carry anything to forward. Keeping the
  // subscription unconditional avoids re-arming it on mode swap.
  onMount(() => {
    const fiber = runtime.runFork(connectBibleDrawerCursor(props.state));
    onCleanup(() => {
      void runtime.runPromise(Fiber.interrupt(fiber));
    });
  });

  // Keyboard shortcuts while the drawer is open: 1-4 swap tabs.
  createEffect(() => {
    if (!props.state.isOpen()) return;
    const onKey = (e: KeyboardEvent): void => {
      const tgt = e.target;
      if (tgt instanceof HTMLInputElement || tgt instanceof HTMLTextAreaElement) return;
      if (tgt instanceof HTMLElement && tgt.isContentEditable) return;
      if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
      const idx = { '1': 0, '2': 1, '3': 2, '4': 3 }[e.key];
      if (idx === undefined) return;
      const tab = STUDY_TABS[idx];
      if (tab) {
        e.preventDefault();
        props.state.switchStudyTab(tab.key);
      }
    };
    document.addEventListener('keydown', onKey);
    onCleanup(() => {
      document.removeEventListener('keydown', onKey);
    });
  });

  const widthPx: Accessor<number> = () => DRAWER_WIDTH_PX;

  return (
    <ReaderShell.Frame
      open={props.state.isOpen()}
      onOpenChange={(open) => {
        if (!open) props.state.close();
      }}
      label="Bible study"
      widthPx={widthPx}
      overlay
    >
      <DrawerHeader state={props.state} />
      <DrawerTabs state={props.state} />
      <ReaderShell.TabPanel>
        <StudyPaneBody state={props.state} />
      </ReaderShell.TabPanel>
    </ReaderShell.Frame>
  );
};

const titleForTarget = (target: DrawerTarget): string => {
  const meta = getBibleBook(target.book);
  const name = meta?.name ?? `Book ${String(target.book)}`;
  return `${name} ${String(target.chapter)}:${String(target.verse)}`;
};

const DrawerHeader: Component<{ readonly state: BibleDrawerState }> = (props) => {
  const title = createMemo<string>(() => {
    const t = props.state.target();
    return t === null ? 'Bible' : titleForTarget(t);
  });
  return (
    <ReaderShell.Header>
      <ReaderShell.HeaderTitle title={title()}>{title()}</ReaderShell.HeaderTitle>
      <ReaderShell.HeaderIconButton
        onClick={() => props.state.close()}
        ariaLabel="Close"
        title="Close (Esc)"
      >
        {'×'}
      </ReaderShell.HeaderIconButton>
    </ReaderShell.Header>
  );
};

// ─── Tabs ──────────────────────────────────────────────────────────────────

// One registry per tab — label for the strip, body for the panel. Adding a
// tab is a one-line edit instead of three (array + Switch arm + tab strip).
const STUDY_TABS: readonly {
  readonly key: BibleStudyTab;
  readonly label: string;
  readonly body: Component<{ readonly state: BibleDrawerState }>;
}[] = [
  { key: 'notes', label: 'Notes', body: (p) => <NotesTab state={p.state} /> },
  { key: 'xrefs', label: 'Cross-refs', body: (p) => <XrefsTab state={p.state} /> },
  { key: 'words', label: 'Words', body: (p) => <WordsTab state={p.state} /> },
  { key: 'egw', label: 'EGW', body: (p) => <EgwTab state={p.state} /> },
];

const DrawerTabs: Component<{ readonly state: BibleDrawerState }> = (props) => (
  <ReaderShell.TabsList>
    <For each={STUDY_TABS}>
      {(tab) => (
        <ReaderShell.Tab
          active={props.state.activeStudyTab() === tab.key}
          onClick={() => props.state.switchStudyTab(tab.key)}
        >
          {tab.label}
        </ReaderShell.Tab>
      )}
    </For>
  </ReaderShell.TabsList>
);

const StudyPaneBody: Component<{ readonly state: BibleDrawerState }> = (props) => (
  <For each={STUDY_TABS}>
    {(tab) => (
      <Show when={props.state.activeStudyTab() === tab.key}>
        <tab.body state={props.state} />
      </Show>
    )}
  </For>
);
