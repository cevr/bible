import { BIBLE_BOOKS } from '@bible/core/bible';

export type BiblePaletteMode = 'books' | 'chapters' | 'verses';

export interface BiblePaletteNavigationState {
  readonly mode: BiblePaletteMode;
  readonly query: string;
  readonly selectedIndex: number;
  readonly selectedBook: number;
  readonly selectedChapter: number;
}

export type BiblePaletteNavigationEvent =
  | { readonly _tag: 'queryChanged'; readonly query: string }
  | { readonly _tag: 'moveSelection'; readonly delta: -1 | 1; readonly itemCount: number }
  | { readonly _tag: 'chooseBook'; readonly book: number }
  | { readonly _tag: 'drillChapter'; readonly chapter: number }
  | { readonly _tag: 'back' };

export const initialBiblePaletteNavigation = (
  book: number,
  chapter: number,
): BiblePaletteNavigationState => ({
  mode: 'chapters',
  query: '',
  selectedIndex: 0,
  selectedBook: book,
  selectedChapter: chapter,
});

/**
 * The complete synchronous Books → Chapters → Verses transition model.
 * Rendering supplies only the current item count; tier invariants and
 * selection resets stay local to this module.
 */
export const transitionBiblePaletteNavigation = (
  state: BiblePaletteNavigationState,
  event: BiblePaletteNavigationEvent,
): BiblePaletteNavigationState => {
  switch (event._tag) {
    case 'queryChanged':
      return { ...state, query: event.query, selectedIndex: 0 };
    case 'moveSelection': {
      const lastIndex = Math.max(0, event.itemCount - 1);
      return {
        ...state,
        selectedIndex: Math.min(lastIndex, Math.max(0, state.selectedIndex + event.delta)),
      };
    }
    case 'chooseBook':
      return {
        mode: 'chapters',
        query: '',
        selectedIndex: 0,
        selectedBook: event.book,
        selectedChapter: 1,
      };
    case 'drillChapter':
      return {
        ...state,
        mode: 'verses',
        query: '',
        selectedIndex: 0,
        selectedChapter: event.chapter,
      };
    case 'back':
      if (state.mode === 'verses') {
        return {
          ...state,
          mode: 'chapters',
          query: '',
          selectedIndex: Math.max(0, state.selectedChapter - 1),
        };
      }
      if (state.mode === 'chapters') {
        return {
          ...state,
          mode: 'books',
          query: '',
          selectedIndex: Math.max(
            0,
            BIBLE_BOOKS.findIndex((book) => book.number === state.selectedBook),
          ),
        };
      }
      return state;
  }
};
