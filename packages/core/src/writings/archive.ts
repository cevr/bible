import { Effect, Schema, Stream } from 'effect';

import { ChapterReference, VerseReference } from '../bible/model.js';
import { Paragraph, Publication } from './model.js';

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

/** One chapter of a publication: its paragraphs, and the Scripture they cite.
 *  A reference names a paragraph of its own chapter or an earlier one. */
export class ArchiveChapter extends Schema.Class<ArchiveChapter>('Writings/ArchiveChapter')({
  paragraphs: Schema.Array(ArchivedParagraph),
  bibleReferences: Schema.Array(ArchivedBibleReference),
}) {}

/** A whole publication held at once. */
export class PublicationArchive extends Schema.Class<PublicationArchive>(
  'Writings/PublicationArchive',
)({
  publication: Publication,
  paragraphs: Schema.Array(ArchivedParagraph),
  bibleReferences: Schema.Array(ArchivedBibleReference),
}) {}

/** A publication as a source hands it over: its record, then its chapters
 *  one at a time. A book of 150,000 paragraphs expands to about 90 MB of
 *  JSON, more than a Worker's 128 MB holds alongside its parse, so nothing
 *  between the download and the database holds a whole book. */
export interface PublicationStream<E> {
  readonly publication: Publication;
  readonly chapters: Stream.Stream<ArchiveChapter, E>;
}

/** A streamed publication, held whole. */
export const collectPublication = <E>(
  stream: PublicationStream<E>,
): Effect.Effect<PublicationArchive, E> =>
  Effect.map(Stream.runCollect(stream.chapters), (chapters) =>
    PublicationArchive.make({
      publication: stream.publication,
      paragraphs: chapters.flatMap((chapter) => chapter.paragraphs),
      bibleReferences: chapters.flatMap((chapter) => chapter.bibleReferences),
    }),
  );
