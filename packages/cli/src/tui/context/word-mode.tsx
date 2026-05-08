/**
 * Word Mode Context
 *
 * Manages word-level navigation within a verse for Strong's concordance lookup.
 * When word mode is active, left/right arrows navigate between words instead of chapters.
 */

import {
  createContext,
  createMemo,
  createSignal,
  useContext,
  type Accessor,
  type ParentProps,
} from 'solid-js';

import type { Reference } from '../../data/bible/types.js';
import { useStudyData, type WordWithStrongs } from './study-data.js';

// State type using discriminated union pattern
export type WordModeState =
  | { _tag: 'inactive' }
  | {
      _tag: 'active';
      verseRef: Reference;
      wordIndex: number;
      words: WordWithStrongs[];
    };

interface WordModeContextValue {
  // State
  state: Accessor<WordModeState>;
  isActive: Accessor<boolean>;

  // Actions
  /** Enter word mode for a verse. Returns 'entered' if successful, 'loading' if data not ready, 'no-strongs' if verse has no Strong's data */
  enter: (verseRef: Reference) => 'entered' | 'loading' | 'no-strongs';
  exit: () => void;
  nextWord: () => void;
  prevWord: () => void;

  // Computed
  currentWord: Accessor<WordWithStrongs | undefined>;
  currentWordIndex: Accessor<number>;
  totalWords: Accessor<number>;
}

const WordModeContext = createContext<WordModeContextValue>();

export function WordModeProvider(props: ParentProps) {
  const studyData = useStudyData();

  const [state, setState] = createSignal<WordModeState>({ _tag: 'inactive' });

  const isActive = createMemo(() => state()._tag === 'active');

  // Helper to check if a word has Strong's numbers
  const hasStrongs = (word: WordWithStrongs) => word.strongs && word.strongs.length > 0;

  // Find next word index with Strong's (or -1 if none)
  const findNextWithStrongs = (words: WordWithStrongs[], fromIndex: number): number => {
    for (let i = fromIndex + 1; i < words.length; i++) {
      const word = words[i];
      if (word && hasStrongs(word)) return i;
    }
    return -1;
  };

  // Find previous word index with Strong's (or -1 if none)
  const findPrevWithStrongs = (words: WordWithStrongs[], fromIndex: number): number => {
    for (let i = fromIndex - 1; i >= 0; i--) {
      const word = words[i];
      if (word && hasStrongs(word)) return i;
    }
    return -1;
  };

  // Find first word index with Strong's
  const findFirstWithStrongs = (words: WordWithStrongs[]): number => {
    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      if (word && hasStrongs(word)) return i;
    }
    return -1;
  };

  const enter = (verseRef: Reference): 'entered' | 'loading' | 'no-strongs' => {
    // Check if study data is still loading
    if (studyData.isLoading()) {
      return 'loading';
    }

    const verse = verseRef.verse ?? 1;
    const ref = { ...verseRef, verse };

    // First try to get words from the study database (with Strong's)
    const words = studyData.getVerseWords(ref.book, ref.chapter, verse);

    // Only enter word mode if there are words with Strong's numbers
    const firstStrongsIndex = findFirstWithStrongs(words);
    if (firstStrongsIndex >= 0) {
      setState({
        _tag: 'active',
        verseRef: ref,
        wordIndex: firstStrongsIndex,
        words,
      });
      return 'entered';
    }

    return 'no-strongs';
  };

  const exit = () => {
    setState({ _tag: 'inactive' });
  };

  const nextWord = () => {
    const current = state();
    if (current._tag !== 'active') return;

    const newIndex = findNextWithStrongs(current.words, current.wordIndex);
    if (newIndex >= 0) {
      setState({
        ...current,
        wordIndex: newIndex,
      });
    }
  };

  const prevWord = () => {
    const current = state();
    if (current._tag !== 'active') return;

    const newIndex = findPrevWithStrongs(current.words, current.wordIndex);
    if (newIndex >= 0) {
      setState({
        ...current,
        wordIndex: newIndex,
      });
    }
  };

  const currentWord = createMemo(() => {
    const current = state();
    if (current._tag !== 'active') return undefined;
    return current.words[current.wordIndex];
  });

  const currentWordIndex = createMemo(() => {
    const current = state();
    return current._tag === 'active' ? current.wordIndex : -1;
  });

  const totalWords = createMemo(() => {
    const current = state();
    return current._tag === 'active' ? current.words.length : 0;
  });

  const value: WordModeContextValue = {
    state,
    isActive,
    enter,
    exit,
    nextWord,
    prevWord,
    currentWord,
    currentWordIndex,
    totalWords,
  };

  return <WordModeContext.Provider value={value}>{props.children}</WordModeContext.Provider>;
}

export function useWordMode(): WordModeContextValue {
  const ctx = useContext(WordModeContext);
  if (!ctx) {
    throw new Error('useWordMode must be used within a WordModeProvider');
  }
  return ctx;
}
