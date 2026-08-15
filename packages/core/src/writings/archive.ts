import { Option, Predicate, Schema, SchemaGetter } from 'effect';

import {
  BookNumber,
  ChapterNumber,
  ChapterReference,
  Reference as BibleReference,
  VerseNumber,
  VerseReference,
  bookNumber,
  chapterNumber,
  verseNumber,
} from '../bible/model.js';
import {
  PageNumber,
  Paragraph,
  ParagraphId,
  Publication,
  PublicationCode,
  PublicationId,
  PublicationOrder,
  ParagraphReference,
  pageNumber,
  paragraphId,
  publicationCode,
  publicationId,
  publicationOrder,
} from './model.js';

export class ArchivedParagraph extends Schema.Class<ArchivedParagraph>(
  'Writings/ArchivedParagraph',
)({
  refcode: Schema.NonEmptyString,
  paragraph: Paragraph,
  isHeading: Schema.Boolean,
}) {}

export class ArchivedBibleReference extends Schema.Class<ArchivedBibleReference>(
  'Writings/ArchivedBibleReference',
)({
  paragraphRefcode: Schema.NonEmptyString,
  scripture: Schema.Union([ChapterReference, VerseReference]),
}) {}

export class PublicationArchive extends Schema.Class<PublicationArchive>(
  'Writings/PublicationArchive',
)({
  publication: Publication,
  paragraphs: Schema.Array(ArchivedParagraph),
  bibleReferences: Schema.Array(ArchivedBibleReference),
}) {}

const NonNegativeInteger = Schema.Finite.pipe(
  Schema.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(0)),
);

const PublicationArchiveWire = Schema.Struct({
  formatVersion: Schema.Literal(1),
  publication: Schema.Struct({
    id: PublicationId,
    code: PublicationCode,
    title: Schema.NonEmptyString,
    author: Schema.NonEmptyString,
    paragraphCount: Schema.NullOr(NonNegativeInteger),
  }),
  paragraphs: Schema.Array(
    Schema.Struct({
      refcode: Schema.NonEmptyString,
      paragraphId: ParagraphId,
      order: PublicationOrder,
      page: Schema.NullOr(PageNumber),
      number: Schema.NullOr(NonNegativeInteger),
      displayRefcode: Schema.NullOr(Schema.NonEmptyString),
      nodes: Paragraph.fields.nodes,
      elementType: Schema.NullOr(Schema.NonEmptyString),
      elementSubtype: Schema.NullOr(Schema.NonEmptyString),
      isHeading: Schema.Boolean,
    }),
  ),
  bibleReferences: Schema.Array(
    Schema.Struct({
      paragraphRefcode: Schema.NonEmptyString,
      bibleBook: BookNumber,
      bibleChapter: ChapterNumber,
      bibleVerse: Schema.NullOr(VerseNumber),
    }),
  ),
});

type ArchiveFormatVersion = 1;
const ARCHIVE_FORMAT_VERSION: ArchiveFormatVersion = 1;

/** JSON-safe codec for the canonical portable publication contribution. */
export const PublicationArchiveJson = PublicationArchiveWire.pipe(
  Schema.decodeTo(PublicationArchive, {
    decode: SchemaGetter.transform((wire) => {
      const publication = Publication.make({
        ...wire.publication,
        paragraphCount: Option.fromNullishOr(wire.publication.paragraphCount),
      });
      return PublicationArchive.make({
        publication,
        paragraphs: wire.paragraphs.map((item) =>
          ArchivedParagraph.make({
            refcode: item.refcode,
            paragraph: Paragraph.make({
              reference: ParagraphReference.make({
                publicationId: publication.id,
                paragraphId: item.paragraphId,
              }),
              publicationCode: publication.code,
              order: item.order,
              page: Option.fromNullishOr(item.page),
              number: Option.fromNullishOr(item.number),
              refcode: Option.fromNullishOr(item.displayRefcode),
              nodes: item.nodes,
              elementType: Option.fromNullishOr(item.elementType),
              elementSubtype: Option.fromNullishOr(item.elementSubtype),
            }),
            isHeading: item.isHeading,
          }),
        ),
        bibleReferences: wire.bibleReferences.map((reference) => {
          let scripture: ChapterReference | VerseReference = BibleReference.chapter(
            reference.bibleBook,
            reference.bibleChapter,
          );
          if (Predicate.isNotNull(reference.bibleVerse)) {
            scripture = BibleReference.verse(
              reference.bibleBook,
              reference.bibleChapter,
              reference.bibleVerse,
            );
          }
          return ArchivedBibleReference.make({
            paragraphRefcode: reference.paragraphRefcode,
            scripture,
          });
        }),
      });
    }),
    encode: SchemaGetter.transform((archive) => ({
      formatVersion: ARCHIVE_FORMAT_VERSION,
      publication: {
        id: publicationId(archive.publication.id),
        code: publicationCode(archive.publication.code),
        title: archive.publication.title,
        author: archive.publication.author,
        paragraphCount: Option.getOrNull(archive.publication.paragraphCount),
      },
      paragraphs: archive.paragraphs.map((archived) => ({
        refcode: archived.refcode,
        paragraphId: paragraphId(archived.paragraph.reference.paragraphId),
        order: publicationOrder(archived.paragraph.order),
        page: Option.getOrNull(Option.map(archived.paragraph.page, pageNumber)),
        number: Option.getOrNull(archived.paragraph.number),
        displayRefcode: Option.getOrNull(archived.paragraph.refcode),
        nodes: archived.paragraph.nodes,
        elementType: Option.getOrNull(archived.paragraph.elementType),
        elementSubtype: Option.getOrNull(archived.paragraph.elementSubtype),
        isHeading: archived.isHeading,
      })),
      bibleReferences: archive.bibleReferences.map((reference) => {
        let bibleVerse = Option.none<VerseNumber>();
        if (reference.scripture._tag === 'verse') {
          bibleVerse = Option.some(verseNumber(reference.scripture.verse));
        }
        return {
          paragraphRefcode: reference.paragraphRefcode,
          bibleBook: bookNumber(reference.scripture.book),
          bibleChapter: chapterNumber(reference.scripture.chapter),
          bibleVerse: Option.getOrNull(bibleVerse),
        };
      }),
    })),
  }),
);
