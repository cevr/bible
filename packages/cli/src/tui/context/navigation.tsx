import {
  createContext,
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
  useContext,
  type ParentProps,
} from 'solid-js';

import type { Position, Reference } from '../../data/bible/types.js';
import { useBibleData, useBibleState } from './bible.js';

interface NavigationContextValue {
  // Current position
  position: () => Position;
  // Navigation methods
  goTo: (ref: Reference) => void;
  goToVerse: (verse: number) => void;
  goToFirstVerse: () => void;
  goToLastVerse: () => void;
  nextChapter: () => void;
  prevChapter: () => void;
  nextVerse: () => void;
  prevVerse: () => void;
  // Selected verse (persistent highlight for navigation)
  selectedVerse: () => number;
  // Highlighted verse (temporary flash after goTo)
  highlightedVerse: () => number | null;
  clearHighlight: () => void;
  // Total verses in current chapter
  totalVerses: () => number;
}

const NavigationContext = createContext<NavigationContextValue>();

interface NavigationProviderProps {
  initialRef?: Reference;
}

export function NavigationProvider(props: ParentProps<NavigationProviderProps>) {
  const data = useBibleData();
  const state = useBibleState();

  // Initialize position from initial ref or stored state
  const getInitialPosition = (): Position => {
    if (props.initialRef) {
      return {
        book: props.initialRef.book,
        chapter: props.initialRef.chapter,
        verse: props.initialRef.verse ?? 1,
      };
    }
    return state.getLastPosition();
  };

  const [position, setPosition] = createSignal<Position>(getInitialPosition());

  // Selected verse - persistent highlight for keyboard navigation
  const [selectedVerse, setSelectedVerse] = createSignal<number>(
    props.initialRef?.verse ?? getInitialPosition().verse,
  );

  // Temporary highlight after goTo (flashes then clears)
  const [highlightedVerse, setHighlightedVerse] = createSignal<number | null>(
    props.initialRef?.verse ?? null,
  );

  // Track highlight timeout for cleanup
  let highlightTimeout: Timer | undefined;

  // Get total verses in current chapter
  const totalVerses = createMemo(() => {
    const pos = position();
    return data.getChapter(pos.book, pos.chapter).length;
  });

  // Save position when it changes
  createEffect(() => {
    const pos = position();
    state.setLastPosition(pos);
    state.addToHistory({
      book: pos.book,
      chapter: pos.chapter,
      verse: pos.verse,
    });
  });

  const goTo = (ref: Reference) => {
    const verse = ref.verse ?? 1;
    setPosition({
      book: ref.book,
      chapter: ref.chapter,
      verse,
    });
    setSelectedVerse(verse);
    setHighlightedVerse(verse);
    // Clear highlight after a short delay (with cleanup)
    if (highlightTimeout) clearTimeout(highlightTimeout);
    highlightTimeout = setTimeout(() => setHighlightedVerse(null), 2000);
  };

  // Cleanup timeout on unmount
  onCleanup(() => {
    if (highlightTimeout) clearTimeout(highlightTimeout);
  });

  const nextChapter = () => {
    const pos = position();
    const next = data.getNextChapter(pos.book, pos.chapter);
    if (next) {
      setPosition({ book: next.book, chapter: next.chapter, verse: 1 });
      setSelectedVerse(1);
      setHighlightedVerse(null);
    }
  };

  const prevChapter = () => {
    const pos = position();
    const prev = data.getPrevChapter(pos.book, pos.chapter);
    if (prev) {
      setPosition({ book: prev.book, chapter: prev.chapter, verse: 1 });
      setSelectedVerse(1);
      setHighlightedVerse(null);
    }
  };

  const nextVerse = () => {
    const current = selectedVerse();
    const total = totalVerses();
    if (current < total) {
      const next = current + 1;
      setSelectedVerse(next);
      setPosition((p) => ({ ...p, verse: next }));
    } else {
      // Loop back to first verse in same chapter
      setSelectedVerse(1);
      setPosition((p) => ({ ...p, verse: 1 }));
    }
    setHighlightedVerse(null);
  };

  const prevVerse = () => {
    const current = selectedVerse();
    const total = totalVerses();
    if (current > 1) {
      const prev = current - 1;
      setSelectedVerse(prev);
      setPosition((p) => ({ ...p, verse: prev }));
    } else {
      // Loop to last verse in same chapter
      setSelectedVerse(total);
      setPosition((p) => ({ ...p, verse: total }));
    }
    setHighlightedVerse(null);
  };

  const clearHighlight = () => {
    setHighlightedVerse(null);
  };

  const goToVerse = (verse: number) => {
    const total = totalVerses();
    const targetVerse = Math.max(1, Math.min(verse, total));
    setSelectedVerse(targetVerse);
    setPosition((p) => ({ ...p, verse: targetVerse }));
    setHighlightedVerse(null);
  };

  const goToFirstVerse = () => {
    setSelectedVerse(1);
    setPosition((p) => ({ ...p, verse: 1 }));
    setHighlightedVerse(null);
  };

  const goToLastVerse = () => {
    const total = totalVerses();
    setSelectedVerse(total);
    setPosition((p) => ({ ...p, verse: total }));
    setHighlightedVerse(null);
  };

  const value: NavigationContextValue = {
    position,
    goTo,
    goToVerse,
    goToFirstVerse,
    goToLastVerse,
    nextChapter,
    prevChapter,
    nextVerse,
    prevVerse,
    selectedVerse,
    highlightedVerse,
    clearHighlight,
    totalVerses,
  };

  return <NavigationContext.Provider value={value}>{props.children}</NavigationContext.Provider>;
}

export function useNavigation(): NavigationContextValue {
  const ctx = useContext(NavigationContext);
  if (!ctx) {
    throw new Error('useNavigation must be used within a NavigationProvider');
  }
  return ctx;
}
