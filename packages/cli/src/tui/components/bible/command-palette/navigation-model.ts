import { BIBLE_BOOKS } from '@bible/core/bible';
import { Schema as S } from 'effect';
import { Machine } from 'foldkit/experimental';
import { m } from 'foldkit/message';
import { ts } from 'foldkit/schema';

const NavigationFields = {
  query: S.String,
  selectedIndex: S.Number,
  selectedBook: S.Number,
  selectedChapter: S.Number,
};

export const BooksNavigation = ts('books', NavigationFields);
export const ChaptersNavigation = ts('chapters', NavigationFields);
export const VersesNavigation = ts('verses', NavigationFields);

export const BiblePaletteNavigationState = S.Union([
  BooksNavigation,
  ChaptersNavigation,
  VersesNavigation,
]);
export type BiblePaletteNavigationState = typeof BiblePaletteNavigationState.Type;
export type BiblePaletteMode = BiblePaletteNavigationState['_tag'];

export const QueryChanged = m('queryChanged', { query: S.String });
export const MoveSelection = m('moveSelection', {
  delta: S.Number,
  itemCount: S.Number,
});
export const ChooseBook = m('chooseBook', { book: S.Number });
export const DrillChapter = m('drillChapter', { chapter: S.Number });
export const Back = m('back');

export const BiblePaletteNavigationEvent = S.Union([
  QueryChanged,
  MoveSelection,
  ChooseBook,
  DrillChapter,
  Back,
]);
export type BiblePaletteNavigationEvent = typeof BiblePaletteNavigationEvent.Type;

const moveSelectedIndex = (selectedIndex: number, delta: number, itemCount: number): number => {
  const lastIndex = Math.max(0, itemCount - 1);
  return Math.min(lastIndex, Math.max(0, selectedIndex + delta));
};

/**
 * The complete synchronous Books -> Chapters -> Verses state graph.
 *
 * Foldkit's Machine is deliberately only the domain module here: OpenTUI's
 * Solid reconciler still owns rendering, while this pure machine owns the
 * navigation states, legal edges, and selection-reset invariants.
 */
export const biblePaletteNavigationMachine = Machine.define({
  state: BiblePaletteNavigationState,
  message: BiblePaletteNavigationEvent,
})({
  initial: ChaptersNavigation({
    query: '',
    selectedIndex: 0,
    selectedBook: 1,
    selectedChapter: 1,
  }),
  states: {
    books: {
      on: {
        queryChanged: Machine.to('books', ({ state, message }) =>
          BooksNavigation({
            query: message.query,
            selectedIndex: 0,
            selectedBook: state.selectedBook,
            selectedChapter: state.selectedChapter,
          }),
        ),
        moveSelection: Machine.to('books', ({ state, message }) =>
          BooksNavigation({
            query: state.query,
            selectedIndex: moveSelectedIndex(state.selectedIndex, message.delta, message.itemCount),
            selectedBook: state.selectedBook,
            selectedChapter: state.selectedChapter,
          }),
        ),
        chooseBook: Machine.to('chapters', ({ message }) =>
          ChaptersNavigation({
            query: '',
            selectedIndex: 0,
            selectedBook: message.book,
            selectedChapter: 1,
          }),
        ),
      },
    },
    chapters: {
      on: {
        queryChanged: Machine.to('chapters', ({ state, message }) =>
          ChaptersNavigation({
            query: message.query,
            selectedIndex: 0,
            selectedBook: state.selectedBook,
            selectedChapter: state.selectedChapter,
          }),
        ),
        moveSelection: Machine.to('chapters', ({ state, message }) =>
          ChaptersNavigation({
            query: state.query,
            selectedIndex: moveSelectedIndex(state.selectedIndex, message.delta, message.itemCount),
            selectedBook: state.selectedBook,
            selectedChapter: state.selectedChapter,
          }),
        ),
        drillChapter: Machine.to('verses', ({ state, message }) =>
          VersesNavigation({
            query: '',
            selectedIndex: 0,
            selectedBook: state.selectedBook,
            selectedChapter: message.chapter,
          }),
        ),
        back: Machine.to('books', ({ state }) =>
          BooksNavigation({
            query: '',
            selectedIndex: Math.max(
              0,
              BIBLE_BOOKS.findIndex((book) => book.number === state.selectedBook),
            ),
            selectedBook: state.selectedBook,
            selectedChapter: state.selectedChapter,
          }),
        ),
      },
    },
    verses: {
      on: {
        queryChanged: Machine.to('verses', ({ state, message }) =>
          VersesNavigation({
            query: message.query,
            selectedIndex: 0,
            selectedBook: state.selectedBook,
            selectedChapter: state.selectedChapter,
          }),
        ),
        moveSelection: Machine.to('verses', ({ state, message }) =>
          VersesNavigation({
            query: state.query,
            selectedIndex: moveSelectedIndex(state.selectedIndex, message.delta, message.itemCount),
            selectedBook: state.selectedBook,
            selectedChapter: state.selectedChapter,
          }),
        ),
        back: Machine.to('chapters', ({ state }) =>
          ChaptersNavigation({
            query: '',
            selectedIndex: Math.max(0, state.selectedChapter - 1),
            selectedBook: state.selectedBook,
            selectedChapter: state.selectedChapter,
          }),
        ),
      },
    },
  },
});

export const initialBiblePaletteNavigation = (
  book: number,
  chapter: number,
): BiblePaletteNavigationState =>
  ChaptersNavigation({
    query: '',
    selectedIndex: 0,
    selectedBook: book,
    selectedChapter: chapter,
  });

export const transitionBiblePaletteNavigation = (
  state: BiblePaletteNavigationState,
  event: BiblePaletteNavigationEvent,
): BiblePaletteNavigationState => biblePaletteNavigationMachine.transition(state, event)[0];
