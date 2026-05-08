import { createContext, createMemo, createSignal, useContext, type ParentProps } from 'solid-js';

import {
  clearSearch as clearSearchTransition,
  closeSearch,
  getCurrentMatchIndex,
  getSearchMatches,
  getSearchQuery,
  isSearchActive,
  nextMatch as nextMatchTransition,
  openSearch,
  prevMatch as prevMatchTransition,
  SearchState,
  updateQuery,
  type SearchMatch,
} from '../types/search-state.js';
import { useBibleData } from './bible.js';
import { useNavigation } from './navigation.js';

// Re-export SearchMatch for consumers
export type { SearchMatch };

interface SearchContextValue {
  // State accessors (backward compatible interface)
  query: () => string;
  setQuery: (q: string) => void;
  isActive: () => boolean;
  setActive: (active: boolean) => void;
  matches: () => SearchMatch[];
  currentMatchIndex: () => number;
  totalMatches: () => number;
  nextMatch: () => void;
  prevMatch: () => void;
  clearSearch: () => void;

  // Direct state access (for components that want full state machine)
  state: () => SearchState;
}

const SearchContext = createContext<SearchContextValue>();

export function SearchProvider(props: ParentProps) {
  const data = useBibleData();
  const { position, goToVerse } = useNavigation();

  // Single state signal using discriminated union
  const [state, setState] = createSignal<SearchState>(SearchState.closed());

  // Find all matches in current chapter based on query
  const computeMatches = (query: string): SearchMatch[] => {
    if (!query || query.length < 2) return [];

    const q = query.toLowerCase();
    const verses = data.getChapter(position().book, position().chapter);
    const results: SearchMatch[] = [];

    for (const verse of verses) {
      const text = verse.text.toLowerCase();
      let startIndex = 0;
      let pos = 0;

      while ((pos = text.indexOf(q, startIndex)) !== -1) {
        results.push({
          verse: verse.verse,
          startIndex: pos,
          endIndex: pos + q.length,
        });
        startIndex = pos + 1;
      }
    }

    return results;
  };

  // Derived state accessors (backward compatible)
  const query = () => getSearchQuery(state());
  const isActiveAccessor = () => isSearchActive(state());
  const matches = () => getSearchMatches(state());
  const currentMatchIndexAccessor = () => getCurrentMatchIndex(state());

  const totalMatches = createMemo(() => matches().length);

  // Actions
  const setQueryAction = (q: string) => {
    const currentState = state();
    if (currentState._tag === 'closed') return;

    const newMatches = computeMatches(q);
    setState(updateQuery(currentState, q, newMatches));
  };

  const setActiveAction = (active: boolean) => {
    if (active) {
      setState(openSearch(state()));
    } else {
      setState(closeSearch(state()));
    }
  };

  const nextMatchAction = () => {
    const currentState = state();
    const newState = nextMatchTransition(currentState);

    if (newState !== currentState) {
      setState(newState);

      // Navigate to the match
      const matchList = getSearchMatches(newState);
      const idx = getCurrentMatchIndex(newState);
      const match = matchList[idx];
      if (match) {
        goToVerse(match.verse);
      }
    }
  };

  const prevMatchAction = () => {
    const currentState = state();
    const newState = prevMatchTransition(currentState);

    if (newState !== currentState) {
      setState(newState);

      // Navigate to the match
      const matchList = getSearchMatches(newState);
      const idx = getCurrentMatchIndex(newState);
      const match = matchList[idx];
      if (match) {
        goToVerse(match.verse);
      }
    }
  };

  const clearSearchAction = () => {
    setState(clearSearchTransition());
  };

  const value: SearchContextValue = {
    query,
    setQuery: setQueryAction,
    isActive: isActiveAccessor,
    setActive: setActiveAction,
    matches,
    currentMatchIndex: currentMatchIndexAccessor,
    totalMatches,
    nextMatch: nextMatchAction,
    prevMatch: prevMatchAction,
    clearSearch: clearSearchAction,
    state,
  };

  return <SearchContext.Provider value={value}>{props.children}</SearchContext.Provider>;
}

export function useSearch(): SearchContextValue {
  const ctx = useContext(SearchContext);
  if (!ctx) {
    throw new Error('useSearch must be used within a SearchProvider');
  }
  return ctx;
}
