import type { ReaderReference } from '../../app/reader-reference.js';

/**
 * AI search state machine for command palette.
 *
 * States:
 * - idle: No AI search active (query doesn't start with '?')
 * - typing: User is typing an AI query but hasn't reached minimum length
 * - loading: AI search in progress
 * - success: AI search completed with results
 * - empty: AI search completed but no results found
 * - error: AI search failed
 *
 * This eliminates impossible states like:
 * - loading=true AND error!=null
 * - loading=true AND results.length>0
 * - error!=null AND results.length>0
 */

export type AiSearchState =
  | { _tag: 'idle' }
  | { _tag: 'typing'; query: string }
  | { _tag: 'loading'; query: string }
  | {
      _tag: 'success';
      query: string;
      results: readonly ReaderReference[];
    }
  | { _tag: 'empty'; query: string }
  | { _tag: 'error'; query: string; error: string };

// State constructors
export const AiSearchState = {
  idle: (): AiSearchState => ({ _tag: 'idle' }),
  typing: (query: string): AiSearchState => ({ _tag: 'typing', query }),
  loading: (query: string): AiSearchState => ({ _tag: 'loading', query }),
  success: (query: string, results: readonly ReaderReference[]): AiSearchState => ({
    _tag: 'success',
    query,
    results,
  }),
  empty: (query: string): AiSearchState => ({ _tag: 'empty', query }),
  error: (query: string, error: string): AiSearchState => ({
    _tag: 'error',
    query,
    error,
  }),
} as const;

// Helper predicates
export function isAiSearchActive(state: AiSearchState): boolean {
  return state._tag !== 'idle';
}

export function isAiSearchLoading(state: AiSearchState): boolean {
  return state._tag === 'loading';
}

export function getAiSearchQuery(state: AiSearchState): string | null {
  if (state._tag === 'idle') return null;
  return state.query;
}

export function getAiSearchResults(state: AiSearchState): readonly ReaderReference[] {
  if (state._tag === 'success') return state.results;
  return [];
}

export function getAiSearchError(state: AiSearchState): string | null {
  if (state._tag === 'error') return state.error;
  return null;
}
