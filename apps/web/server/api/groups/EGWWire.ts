import { Option } from 'effect';

import type {
  EGWBookDump,
  EGWBookInfo,
  EGWChapter,
  EGWPageResponse,
  EGWParagraph,
  EGWSearchResult,
} from '@bible/api';
import type {
  Heading,
  Page,
  Paragraph,
  Publication,
  PublicationArchive,
  SearchHit,
} from '@bible/core/writings';

const book = (publication: Publication): EGWBookInfo => ({
  bookId: publication.id,
  bookCode: publication.code,
  title: publication.title,
  author: publication.author,
  paragraphCount: Option.getOrUndefined(publication.paragraphCount),
});

const paragraph = (value: Paragraph): EGWParagraph => ({
  paraId: Option.getOrNull(value.paragraphId),
  refcodeShort: Option.getOrNull(value.reference.refcode),
  nodes: value.nodes,
  puborder: value.reference.order,
  elementType: Option.getOrNull(value.elementType),
});

const page = (value: Page): EGWPageResponse => ({
  book: book(value.publication),
  page: value.reference.page,
  paragraphs: value.paragraphs.map(paragraph),
  chapterHeading: Option.getOrNull(value.heading),
  prevPage: Option.getOrNull(Option.map(value.previous, (reference) => reference.page)),
  nextPage: Option.getOrNull(Option.map(value.next, (reference) => reference.page)),
});

const chapter = (value: Heading): EGWChapter => ({
  title: value.title,
  refcodeShort: Option.getOrNull(value.reference.refcode),
  puborder: value.reference.order,
  page: Option.getOrNull(value.reference.page),
});

const searchResult = (value: SearchHit): EGWSearchResult => ({
  ...paragraph(value.paragraph),
  bookCode: value.publication.code,
  bookTitle: value.publication.title,
});

const archive = (value: PublicationArchive): EGWBookDump => ({
  book: book(value.publication),
  paragraphs: value.paragraphs.map((archived) => ({
    refCode: archived.refcode,
    paraId: Option.getOrNull(archived.paragraph.paragraphId),
    refcodeShort: Option.getOrNull(archived.paragraph.reference.refcode),
    nodes: archived.paragraph.nodes,
    puborder: archived.paragraph.reference.order,
    elementType: Option.getOrNull(archived.paragraph.elementType),
    elementSubtype: Option.getOrNull(archived.paragraph.elementSubtype),
    pageNumber: Option.getOrNull(archived.paragraph.reference.page),
    paragraphNumber: Option.getOrNull(archived.paragraph.reference.number),
    isChapterHeading: archived.isHeading,
  })),
  bibleRefs: value.bibleReferences.map((reference) => ({
    refCode: reference.paragraphRefcode,
    bibleBook: reference.scripture.book,
    bibleChapter: reference.scripture.chapter,
    bibleVerse: reference.scripture._tag === 'verse' ? reference.scripture.verse : null,
  })),
});

export const EGWWire = {
  book,
  books: (publications: readonly Publication[]): readonly EGWBookInfo[] => publications.map(book),
  paragraph,
  page,
  chapters: (headings: readonly Heading[]): readonly EGWChapter[] => headings.map(chapter),
  searchResults: (hits: readonly SearchHit[]): readonly EGWSearchResult[] => hits.map(searchResult),
  archive,
} as const;
