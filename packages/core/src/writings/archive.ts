import { Schema } from 'effect';

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

export class PublicationArchive extends Schema.Class<PublicationArchive>(
  'Writings/PublicationArchive',
)({
  publication: Publication,
  paragraphs: Schema.Array(ArchivedParagraph),
  bibleReferences: Schema.Array(ArchivedBibleReference),
}) {}
