import { useKeyboard, useTerminalDimensions } from '@opentui/solid';
import { createSignal, onCleanup, Show } from 'solid-js';

import { ChapterView } from '../components/bible/chapter-view.js';
import { BibleCommandPalette } from '../components/bible/command-palette.js';
import { Footer } from '../components/shared/footer.js';
import { SearchBox } from '../components/shared/search-box.js';
import { Topbar } from '../components/shared/topbar.js';
import { ConcordanceSearch } from '../components/study/concordance-search.js';
import { CrossRefsPopup } from '../components/study/cross-refs-popup.js';
import { StrongsPopup } from '../components/study/strongs-popup.js';
import { useDisplay } from '../context/display.js';
import { useNavigation } from '../context/navigation.js';
import { useOverlay } from '../context/overlay.js';
import { useSearch } from '../context/search.js';
import { useStudyData } from '../context/study-data.js';
import { useTheme } from '../context/theme.js';
import { useWordMode } from '../context/word-mode.js';
import {
  GotoModeState,
  gotoModeTransition,
  keyToGotoEvent,
  type GotoModeAction,
} from '../types/goto-mode.js';
import { match } from '@bible/core/utils';

type KeyEvent = { name?: string; sequence?: string; ctrl?: boolean };

/** Handle keys in word mode. Returns true if key was handled. */
function handleWordModeKeys(
  key: KeyEvent,
  wordMode: ReturnType<typeof useWordMode>,
  openOverlay: (type: 'strongs') => void,
): boolean {
  if (!wordMode.isActive()) return false;

  if (key.name === 'escape' || key.name === 'return') {
    wordMode.exit();
    return true;
  }

  if (key.name === 'left' || key.name === 'h') {
    wordMode.prevWord();
    return true;
  }

  if (key.name === 'right' || key.name === 'l') {
    wordMode.nextWord();
    return true;
  }

  if (key.name === 'space') {
    const word = wordMode.currentWord();
    if (word?.strongs?.length) {
      openOverlay('strongs');
    }
    return true;
  }

  // Block other keys in word mode
  return true;
}

/** Handle goto mode state machine. Returns true if key was handled. */
function handleGotoModeKeys(
  key: KeyEvent,
  gotoMode: GotoModeState,
  setGotoMode: (state: GotoModeState) => void,
  executeAction: (action: GotoModeAction) => void,
): boolean {
  const event = keyToGotoEvent(key);

  if (gotoMode._tag === 'awaiting') {
    const { state: newState, action } = gotoModeTransition(gotoMode, event);
    setGotoMode(newState);
    if (action) executeAction(action);
    // If state changed or action fired, consider it handled
    if (newState._tag !== gotoMode._tag || action) return true;
  }

  if (gotoMode._tag === 'normal') {
    if (event._tag === 'pressG') {
      const { state: newState } = gotoModeTransition(gotoMode, event);
      setGotoMode(newState);
      return true;
    }
    if (event._tag === 'pressShiftG') {
      const { action } = gotoModeTransition(gotoMode, event);
      if (action) executeAction(action);
      return true;
    }
  }

  return false;
}

/** Handle normal navigation keys. Returns true if key was handled. */
function handleNavigationKeys(
  key: KeyEvent,
  nav: {
    nextVerse: () => void;
    prevVerse: () => void;
    nextChapter: () => void;
    prevChapter: () => void;
  },
): boolean {
  if (key.name === 'j' || key.name === 'down') {
    nav.nextVerse();
    return true;
  }
  if (key.name === 'k' || key.name === 'up') {
    nav.prevVerse();
    return true;
  }
  if (key.name === 'h' || key.name === 'left') {
    nav.prevChapter();
    return true;
  }
  if (key.name === 'l' || key.name === 'right') {
    nav.nextChapter();
    return true;
  }
  return false;
}

interface BibleViewProps {
  onNavigateToRoute?: (route: string) => void;
}

export function BibleView(_props: BibleViewProps) {
  const dimensions = useTerminalDimensions();
  const { theme } = useTheme();
  const {
    position,
    nextChapter,
    prevChapter,
    nextVerse,
    prevVerse,
    goTo,
    goToVerse,
    goToFirstVerse,
    goToLastVerse,
    selectedVerse,
  } = useNavigation();
  const { toggleMode } = useDisplay();
  const {
    isActive: isSearchActive,
    setActive: setSearchActive,
    nextMatch,
    prevMatch,
  } = useSearch();
  const {
    isOpen: isOverlayOpen,
    isOverlayOpen: isSpecificOverlayOpen,
    open: openOverlay,
    close: closeOverlay,
  } = useOverlay();
  const wordMode = useWordMode();
  const studyData = useStudyData();

  // Vim-style goto mode using state machine
  const [gotoMode, setGotoMode] = createSignal<GotoModeState>(GotoModeState.normal());

  // Toast message for loading/status feedback
  const [toast, setToast] = createSignal<string | null>(null);
  let toastTimer: Timer | undefined;
  const showToast = (msg: string, duration = 1500) => {
    if (toastTimer) clearTimeout(toastTimer);
    setToast(msg);
    toastTimer = setTimeout(() => setToast(null), duration);
  };
  onCleanup(() => {
    if (toastTimer) clearTimeout(toastTimer);
  });

  // Execute actions from goto mode transitions
  const executeGotoAction = (action: GotoModeAction) => {
    match(action, {
      goToFirst: () => goToFirstVerse(),
      goToLast: () => goToLastVerse(),
      goToVerse: ({ verse }) => goToVerse(verse),
    });
  };

  // Get current verse reference for popups
  const currentVerseRef = () => ({
    book: position().book,
    chapter: position().chapter,
    verse: selectedVerse(),
  });

  // Handle navigation from cross-refs popup
  const handleCrossRefNavigate = (ref: { book: number; chapter: number; verse?: number }) => {
    goTo(ref);
    closeOverlay();
  };

  useKeyboard((key) => {
    // Skip if any overlay is open (popups call stopPropagation themselves)
    if (isOverlayOpen()) return;

    // Skip if search is active (SearchBox handles its own input)
    if (isSearchActive()) return;

    // Word mode handling (navigate words, open Strong's popup)
    if (handleWordModeKeys(key, wordMode, openOverlay)) return;

    // Normal mode: Space opens cross-refs, Enter enters word mode
    if (key.name === 'space') {
      if (studyData.isLoading()) {
        showToast('Loading cross-references...');
        return;
      }
      openOverlay('cross-refs');
      return;
    }
    if (key.name === 'return') {
      const result = wordMode.enter(currentVerseRef());
      if (result === 'loading') {
        showToast("Loading Strong's data...");
      }
      return;
    }

    // Goto mode state machine (g, gg, G, g{number})
    if (handleGotoModeKeys(key, gotoMode(), setGotoMode, executeGotoAction)) return;

    // Verse/chapter navigation (j/k/h/l, arrows)
    if (
      handleNavigationKeys(key, {
        nextVerse,
        prevVerse,
        nextChapter,
        prevChapter,
      })
    )
      return;

    // Display mode toggle: v
    if (key.name === 'v') {
      toggleMode();
      return;
    }

    // Command palette: Ctrl+P
    if (key.ctrl && key.name === 'p') {
      openOverlay('command-palette');
      return;
    }

    // Search: Ctrl+F or /
    if ((key.ctrl && key.name === 'f') || key.name === '/') {
      setSearchActive(true);
      return;
    }

    // Concordance search: Ctrl+S
    if (key.ctrl && key.name === 's') {
      if (studyData.isLoading()) {
        showToast('Loading concordance data...');
        return;
      }
      openOverlay('concordance');
      return;
    }

    // Search navigation: n/N (vim style)
    if (key.name === 'n' && !key.ctrl) {
      nextMatch();
      return;
    }
    if (key.sequence === 'N') {
      prevMatch();
      return;
    }
    // Note: Ctrl+C exit is handled globally in AppContent
  });

  const closeSearch = () => {
    setSearchActive(false);
    // Keep the query so highlights remain visible and n/N still work
  };

  return (
    <box
      width={dimensions().width}
      height={dimensions().height}
      flexDirection="column"
      backgroundColor={theme().background}
    >
      <Topbar />

      <ChapterView />

      <Footer gotoMode={gotoMode()} />

      {/* Command Palette Overlay */}
      <Show when={isSpecificOverlayOpen('command-palette')}>
        <box
          position="absolute"
          top={Math.floor(dimensions().height / 6)}
          left={Math.floor((dimensions().width - 70) / 2)}
          width={70}
        >
          <BibleCommandPalette onClose={closeOverlay} />
        </box>
      </Show>

      {/* Search Box - top right */}
      <Show when={isSearchActive()}>
        <box position="absolute" top={1} right={2} width={40}>
          <SearchBox onClose={closeSearch} />
        </box>
      </Show>

      {/* Cross-References Popup */}
      <Show when={isSpecificOverlayOpen('cross-refs')}>
        <box position="absolute" top={2} left={Math.floor((dimensions().width - 65) / 2)}>
          <CrossRefsPopup
            verseRef={currentVerseRef()}
            onClose={closeOverlay}
            onNavigate={handleCrossRefNavigate}
          />
        </box>
      </Show>

      {/* Strong's Popup */}
      <Show when={isSpecificOverlayOpen('strongs') && wordMode.currentWord()}>
        {(word) => (
          <box position="absolute" top={2} left={Math.floor((dimensions().width - 65) / 2)}>
            <StrongsPopup word={word()} onClose={closeOverlay} />
          </box>
        )}
      </Show>

      {/* Concordance Search */}
      <Show when={isSpecificOverlayOpen('concordance')}>
        <box position="absolute" top={2} left={Math.floor((dimensions().width - 70) / 2)}>
          <ConcordanceSearch onClose={closeOverlay} onNavigate={handleCrossRefNavigate} />
        </box>
      </Show>

      {/* Toast notification for loading states */}
      <Show when={toast()}>
        <box
          position="absolute"
          bottom={3}
          left={Math.floor((dimensions().width - 30) / 2)}
          width={30}
          height={1}
          justifyContent="center"
        >
          <text fg={theme().accent}>{toast()}</text>
        </box>
      </Show>
    </box>
  );
}
