// Per-book "last chapter" memory, ephemeral. Lives only for the session
// (in-memory Maps) so that switching books in the Library/TOC re-opens each
// book where you last left it instead of always at chapter 1.
//
// Distinct from `LastPositionStorage`, which persists the SINGLE most recent
// (book, chapter, paragraph) tuple to disk for resume-on-launch. This module
// keeps a per-book record so book-hopping within a session feels natural.
//
// Two namespaces:
//   • EGW books — keyed by EGW bookId, value is a chapter para_id (string)
//   • Bible books — keyed by Bible book number, value is a chapter number
//
// Plain module-level Maps. Previously wrapped in an Effect.Service with Ref
// + Layer, but no test layer ever used the injection point — the wrapping
// was Effect ceremony for what's already a process singleton.

const egwLastChapter = new Map<number, string>();
const bibleLastChapter = new Map<number, number>();

export const lastChapterMemory = {
  getEgw: (bookId: number): string | undefined => egwLastChapter.get(bookId),
  recordEgw: (bookId: number, chapterParaId: string): void => {
    egwLastChapter.set(bookId, chapterParaId);
  },
  getBible: (book: number): number | undefined => bibleLastChapter.get(book),
  recordBible: (book: number, chapter: number): void => {
    bibleLastChapter.set(book, chapter);
  },
};
