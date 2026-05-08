/**
 * EGW Navigation Context
 *
 * Manages navigation state for the EGW Reader.
 * Similar to the Bible navigation context but adapted for EGW paragraph structure.
 */

import type { EGWReference } from '@bible/core/app';
import { isChapterHeading } from '@bible/core/egw-db';
import type { EGWBookInfo, EGWParagraph, EGWReaderPosition } from '@bible/core/egw-reader';
import {
  createContext,
  createEffect,
  createMemo,
  createSignal,
  onMount,
  untrack,
  useContext,
  type ParentProps,
} from 'solid-js';

import { useBibleState } from './bible.js';
import { useEGW } from './egw.js';

/**
 * Loading state for async operations
 */
type LoadingState =
  | { _tag: 'idle' }
  | { _tag: 'loading'; message: string }
  | { _tag: 'error'; error: string }
  | { _tag: 'loaded' };

interface ChapterInfo {
  /** Index of chapter heading in full paragraphs array */
  startIndex: number;
  /** Chapter title (content of the heading paragraph) */
  title: string;
  /** Paragraphs in this chapter (including heading) */
  paragraphs: readonly EGWParagraph[];
}

interface EGWNavigationContextValue {
  // Current state
  loadingState: () => LoadingState;
  currentBook: () => EGWBookInfo | null;
  paragraphs: () => readonly EGWParagraph[];
  selectedParagraphIndex: () => number;
  currentParagraph: () => EGWParagraph | null;

  // Chapter-filtered view (like Bible reader)
  currentChapter: () => ChapterInfo | null;
  /** Index within current chapter (0-based) */
  selectedIndexInChapter: () => number;

  // Navigation
  goToBook: (bookCode: string) => void;
  goToPosition: (position: EGWReaderPosition) => void;
  nextParagraph: () => void;
  prevParagraph: () => void;
  goToFirstParagraph: () => void;
  goToLastParagraph: () => void;
  goToParagraphIndex: (index: number) => void;
  nextPage: () => void;
  prevPage: () => void;
  nextChapter: () => void;
  prevChapter: () => void;

  // Book list
  books: () => readonly EGWBookInfo[];
  loadBooks: () => void;

  // Total paragraphs
  totalParagraphs: () => number;
  currentPage: () => number | null;
}

const EGWNavigationContext = createContext<EGWNavigationContextValue>();

interface EGWNavigationProviderProps {
  initialRef?: EGWReference;
}

export function EGWNavigationProvider(props: ParentProps<EGWNavigationProviderProps>) {
  const egw = useEGW();
  const bibleState = useBibleState();

  // State
  const [loadingState, setLoadingState] = createSignal<LoadingState>({
    _tag: 'idle',
  });
  const [books, setBooks] = createSignal<readonly EGWBookInfo[]>([]);
  const [currentBook, setCurrentBook] = createSignal<EGWBookInfo | null>(null);
  const [paragraphs, setParagraphs] = createSignal<readonly EGWParagraph[]>([]);
  const [selectedParagraphIndex, setSelectedParagraphIndex] = createSignal(0);

  // Derived state
  const currentParagraph = createMemo(() => {
    const paras = paragraphs();
    const index = selectedParagraphIndex();
    return paras[index] ?? null;
  });

  const totalParagraphs = createMemo(() => paragraphs().length);

  // Extract page number from refcode (e.g., "PP 351.1" -> 351)
  const getPageFromParagraph = (para: EGWParagraph | null): number | null => {
    if (!para) return null;
    const refcode = para.refcodeShort ?? para.refcodeLong ?? '';
    const match = refcode.match(/\s(\d+)\.\d+$/);
    if (!match) return null;
    const pageNum = match[1];
    return pageNum ? parseInt(pageNum, 10) : null;
  };

  const currentPage = createMemo(() => getPageFromParagraph(currentParagraph()));

  // Find current chapter based on selected paragraph
  const currentChapter = createMemo((): ChapterInfo | null => {
    const paras = paragraphs();
    if (paras.length === 0) return null;

    const currentIndex = selectedParagraphIndex();

    // Find the chapter heading for current position (search backwards)
    let chapterStartIndex = 0;
    for (let i = currentIndex; i >= 0; i--) {
      const para = paras[i];
      if (para && isChapterHeading(para.elementType)) {
        chapterStartIndex = i;
        break;
      }
    }

    // Find where the chapter ends (next heading or end of book)
    let chapterEndIndex = paras.length;
    for (let i = chapterStartIndex + 1; i < paras.length; i++) {
      const para = paras[i];
      if (para && isChapterHeading(para.elementType)) {
        chapterEndIndex = i;
        break;
      }
    }

    const chapterParagraphs = paras.slice(chapterStartIndex, chapterEndIndex);
    const headingPara = paras[chapterStartIndex];

    // Extract title from heading (strip HTML)
    const title = headingPara?.content?.replace(/<[^>]*>/g, '') ?? 'Untitled';

    return {
      startIndex: chapterStartIndex,
      title,
      paragraphs: chapterParagraphs,
    };
  });

  // Index within current chapter
  const selectedIndexInChapter = createMemo(() => {
    const chapter = currentChapter();
    if (!chapter) return 0;
    return selectedParagraphIndex() - chapter.startIndex;
  });

  // Load book list
  const loadBooks = () => {
    setLoadingState({ _tag: 'loading', message: 'Loading books...' });

    // Check cache first
    const cached = egw.peekBooks();
    if (cached) {
      setBooks(cached);
      setLoadingState({ _tag: 'loaded' });
      return;
    }

    // Load async
    egw
      .getBooks()
      .then((value) => {
        setBooks(value);
        setLoadingState({ _tag: 'loaded' });
      })
      .catch((error) => {
        setLoadingState({ _tag: 'error', error: String(error) });
      });
  };

  // Load book and paragraphs, then run callback with the data
  const loadBookData = (
    bookCode: string,
    onLoaded: (book: EGWBookInfo, paras: readonly EGWParagraph[]) => void,
  ) => {
    setLoadingState({ _tag: 'loading', message: 'Loading book...' });

    // Check cache first
    const cachedBook = egw.peekBook(bookCode);
    const cachedParas = egw.peekParagraphs(bookCode);

    if (cachedBook && cachedParas) {
      setCurrentBook(cachedBook);
      setParagraphs(cachedParas);
      onLoaded(cachedBook, cachedParas);
      setLoadingState({ _tag: 'loaded' });
      return;
    }

    // Load async
    Promise.all([egw.getBookByCode(bookCode), egw.getParagraphsByBookCode(bookCode)])
      .then(([book, paras]) => {
        if (book) {
          setCurrentBook(book);
          setParagraphs(paras);
          onLoaded(book, paras);
          setLoadingState({ _tag: 'loaded' });
        } else {
          setLoadingState({
            _tag: 'error',
            error: `Book not found: ${bookCode}`,
          });
        }
      })
      .catch((error) => {
        setLoadingState({ _tag: 'error', error: String(error) });
      });
  };

  // Navigate to a specific book
  const goToBook = (bookCode: string) => {
    loadBookData(bookCode, () => setSelectedParagraphIndex(0));
  };

  // Navigate to a specific position (page/paragraph)
  const goToPosition = (position: EGWReaderPosition) => {
    const bookCode = position.bookCode;
    const book = currentBook();

    // If same book, just navigate within it
    if (book && book.bookCode.toUpperCase() === bookCode.toUpperCase()) {
      navigateToPosition(paragraphs(), position);
      return;
    }

    // Different book - load it first
    loadBookData(bookCode, (_, paras) => navigateToPosition(paras, position));
  };

  // Find paragraph index from position
  const navigateToPosition = (paras: readonly EGWParagraph[], position: EGWReaderPosition) => {
    // If we have page and paragraph, build refcode
    if (position.page != null) {
      const refcodePrefix =
        position.paragraph != null
          ? `${position.bookCode} ${position.page}.${position.paragraph}`
          : `${position.bookCode} ${position.page}.`;

      const index = paras.findIndex((p) => {
        const ref = p.refcodeShort ?? p.refcodeLong ?? '';
        return position.paragraph != null
          ? ref.toUpperCase() === refcodePrefix.toUpperCase()
          : ref.toUpperCase().startsWith(refcodePrefix.toUpperCase());
      });

      if (index >= 0) {
        setSelectedParagraphIndex(index);
        return;
      }
    }

    // If we have puborder
    if (position.puborder != null) {
      const index = paras.findIndex((p) => p.puborder === position.puborder);
      if (index >= 0) {
        setSelectedParagraphIndex(index);
        return;
      }
    }

    // Default to first
    setSelectedParagraphIndex(0);
  };

  // Navigation methods
  const nextParagraph = () => {
    const total = totalParagraphs();
    setSelectedParagraphIndex((i) => (i < total - 1 ? i + 1 : 0));
  };

  const prevParagraph = () => {
    const total = totalParagraphs();
    setSelectedParagraphIndex((i) => (i > 0 ? i - 1 : total - 1));
  };

  const goToFirstParagraph = () => {
    setSelectedParagraphIndex(0);
  };

  const goToLastParagraph = () => {
    setSelectedParagraphIndex(Math.max(0, totalParagraphs() - 1));
  };

  const goToParagraphIndex = (index: number) => {
    const total = totalParagraphs();
    setSelectedParagraphIndex(Math.max(0, Math.min(index, total - 1)));
  };

  // Navigate to next page (find first paragraph on next page)
  const nextPage = () => {
    const paras = paragraphs();
    const current = currentPage();
    if (current === null) return;

    const currentIndex = selectedParagraphIndex();
    // Find first paragraph on a different (higher) page
    for (let i = currentIndex + 1; i < paras.length; i++) {
      const para = paras[i];
      if (!para) continue;
      const page = getPageFromParagraph(para);
      if (page !== null && page > current) {
        setSelectedParagraphIndex(i);
        return;
      }
    }
    // If no next page found, go to last paragraph
    setSelectedParagraphIndex(paras.length - 1);
  };

  // Navigate to previous page (find first paragraph on previous page)
  const prevPage = () => {
    const paras = paragraphs();
    const current = currentPage();
    if (current === null) return;

    const currentIndex = selectedParagraphIndex();
    // Find the page before current
    let targetPage: number | null = null;
    for (let i = currentIndex - 1; i >= 0; i--) {
      const para = paras[i];
      if (!para) continue;
      const page = getPageFromParagraph(para);
      if (page !== null && page < current) {
        targetPage = page;
        break;
      }
    }

    if (targetPage === null) {
      // No previous page, go to first
      setSelectedParagraphIndex(0);
      return;
    }

    // Find first paragraph on that page
    for (let i = 0; i < paras.length; i++) {
      const para = paras[i];
      if (!para) continue;
      const page = getPageFromParagraph(para);
      if (page === targetPage) {
        setSelectedParagraphIndex(i);
        return;
      }
    }
  };

  // Navigate to next chapter (find next chapter heading)
  const nextChapter = () => {
    const paras = paragraphs();
    const currentIndex = selectedParagraphIndex();

    // Find next chapter heading after current position
    for (let i = currentIndex + 1; i < paras.length; i++) {
      const para = paras[i];
      if (para && isChapterHeading(para.elementType)) {
        setSelectedParagraphIndex(i);
        return;
      }
    }
    // If no next chapter, go to last paragraph
    setSelectedParagraphIndex(paras.length - 1);
  };

  // Navigate to previous chapter (find previous chapter heading)
  const prevChapter = () => {
    const paras = paragraphs();
    const currentIndex = selectedParagraphIndex();

    // If we're on a chapter heading, go to the one before it
    // Otherwise, go to the chapter heading of the current section
    let foundCurrentChapter = false;
    const currentPara = paras[currentIndex];
    const isCurrentChapterHeading = currentPara && isChapterHeading(currentPara.elementType);

    for (let i = currentIndex - 1; i >= 0; i--) {
      const para = paras[i];
      if (para && isChapterHeading(para.elementType)) {
        if (foundCurrentChapter || !isCurrentChapterHeading) {
          // We found the previous chapter
          setSelectedParagraphIndex(i);
          return;
        }
        // This is the current chapter's heading, keep looking for previous
        foundCurrentChapter = true;
      }
    }
    // If no previous chapter, go to first paragraph
    setSelectedParagraphIndex(0);
  };

  // Save position when it changes (untrack the save call to avoid loops)
  createEffect(() => {
    const book = currentBook();
    const para = currentParagraph();
    if (book && para) {
      const page = currentPage();
      // Untrack the save operation to prevent reactive loops
      untrack(() => {
        bibleState.setLastEGWPosition({
          bookCode: book.bookCode,
          page: page ?? undefined,
          puborder: para.puborder,
        });
      });
    }
  });

  // Initialize from initial ref or saved state - only runs once on mount
  onMount(() => {
    const ref = props.initialRef;
    if (ref?.bookCode) {
      goToPosition({
        bookCode: ref.bookCode,
        page: ref.page ?? undefined,
        paragraph: ref.paragraph ?? undefined,
      });
    } else {
      // Try to load last position from state
      const lastPos = bibleState.getLastEGWPosition();
      if (lastPos) {
        goToPosition({
          bookCode: lastPos.bookCode,
          page: lastPos.page,
          puborder: lastPos.puborder,
        });
      } else {
        // Load book list if no saved position
        loadBooks();
      }
    }
  });

  const value: EGWNavigationContextValue = {
    loadingState,
    currentBook,
    paragraphs,
    selectedParagraphIndex,
    currentParagraph,
    currentChapter,
    selectedIndexInChapter,
    goToBook,
    goToPosition,
    nextParagraph,
    prevParagraph,
    goToFirstParagraph,
    goToLastParagraph,
    goToParagraphIndex,
    nextPage,
    prevPage,
    nextChapter,
    prevChapter,
    books,
    loadBooks,
    totalParagraphs,
    currentPage,
  };

  return (
    <EGWNavigationContext.Provider value={value}>{props.children}</EGWNavigationContext.Provider>
  );
}

export function useEGWNavigation(): EGWNavigationContextValue {
  const ctx = useContext(EGWNavigationContext);
  if (!ctx) {
    throw new Error('useEGWNavigation must be used within an EGWNavigationProvider');
  }
  return ctx;
}
