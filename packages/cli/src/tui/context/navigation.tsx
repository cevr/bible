import {
  createContext,
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
  useContext,
  type ParentProps,
} from 'solid-js';

import { getNextChapter, getPrevChapter, Reference, type VerseReference } from '@bible/core/bible';

import type { ReaderReference } from '../../app/reader-reference.js';
import { useBibleReader, useBibleState } from './bible.js';

interface NavigationContextValue {
  // Current position
  position: () => VerseReference;
  // Navigation methods
  goTo: (ref: ReaderReference) => void;
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
  initialRef?: ReaderReference;
}

export function NavigationProvider(props: ParentProps<NavigationProviderProps>) {
  const reader = useBibleReader();
  const state = useBibleState();
  const initialVerse = () =>
    props.initialRef?._tag === 'verse' ? props.initialRef.verse : undefined;

  // Initialize position from initial ref or stored state
  const getInitialPosition = (): VerseReference => {
    if (props.initialRef) {
      return Reference.verse(props.initialRef.book, props.initialRef.chapter, initialVerse() ?? 1);
    }
    return state.reader.bible.loadPosition();
  };

  const [position, setPosition] = createSignal<VerseReference>(getInitialPosition());

  // Selected verse - persistent highlight for keyboard navigation
  const [selectedVerse, setSelectedVerse] = createSignal<number>(
    initialVerse() ?? getInitialPosition().verse,
  );

  // Temporary highlight after goTo (flashes then clears)
  const [highlightedVerse, setHighlightedVerse] = createSignal<number | null>(
    initialVerse() ?? null,
  );

  // Track highlight timeout for cleanup
  let highlightTimeout: Timer | undefined;

  // Get total verses in current chapter
  const totalVerses = createMemo(() => {
    const pos = position();
    return reader.chapter(Reference.chapter(pos.book, pos.chapter)).length;
  });

  // Save position when it changes
  createEffect(() => {
    const pos = position();
    state.reader.bible.savePosition(pos);
  });

  const goTo = (ref: ReaderReference) => {
    const verse = ref._tag === 'verse' ? ref.verse : 1;
    setPosition(Reference.verse(ref.book, ref.chapter, verse));
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
    const next = getNextChapter(pos.book, pos.chapter);
    if (next) {
      setPosition(Reference.verse(next.book, next.chapter, 1));
      setSelectedVerse(1);
      setHighlightedVerse(null);
    }
  };

  const prevChapter = () => {
    const pos = position();
    const prev = getPrevChapter(pos.book, pos.chapter);
    if (prev) {
      setPosition(Reference.verse(prev.book, prev.chapter, 1));
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
      setPosition((p) => Reference.verse(p.book, p.chapter, next));
    } else {
      // Loop back to first verse in same chapter
      setSelectedVerse(1);
      setPosition((p) => Reference.verse(p.book, p.chapter, 1));
    }
    setHighlightedVerse(null);
  };

  const prevVerse = () => {
    const current = selectedVerse();
    const total = totalVerses();
    if (current > 1) {
      const prev = current - 1;
      setSelectedVerse(prev);
      setPosition((p) => Reference.verse(p.book, p.chapter, prev));
    } else {
      // Loop to last verse in same chapter
      setSelectedVerse(total);
      setPosition((p) => Reference.verse(p.book, p.chapter, total));
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
    setPosition((p) => Reference.verse(p.book, p.chapter, targetVerse));
    setHighlightedVerse(null);
  };

  const goToFirstVerse = () => {
    setSelectedVerse(1);
    setPosition((p) => Reference.verse(p.book, p.chapter, 1));
    setHighlightedVerse(null);
  };

  const goToLastVerse = () => {
    const total = totalVerses();
    setSelectedVerse(total);
    setPosition((p) => Reference.verse(p.book, p.chapter, total));
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
