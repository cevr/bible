import { Schema } from 'effect';

import { Node } from '../egw/ast.js';

const NonNegativeInteger = Schema.Number.pipe(
  Schema.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(0)),
);

export const PublicationId = Schema.Number.pipe(
  Schema.check(Schema.isInt(), Schema.isGreaterThan(0)),
  Schema.brand('Writings/PublicationId'),
);
export type PublicationId = typeof PublicationId.Type;

export const PublicationCode = Schema.NonEmptyString.pipe(Schema.brand('Writings/PublicationCode'));
export type PublicationCode = typeof PublicationCode.Type;

export const PageNumber = Schema.Number.pipe(
  Schema.check(Schema.isInt(), Schema.isGreaterThan(0)),
  Schema.brand('Writings/PageNumber'),
);
export type PageNumber = typeof PageNumber.Type;

export const PublicationOrder = Schema.Number.pipe(
  Schema.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(0)),
  Schema.brand('Writings/PublicationOrder'),
);
export type PublicationOrder = typeof PublicationOrder.Type;

export const ParagraphId = Schema.NonEmptyString.pipe(Schema.brand('Writings/ParagraphId'));
export type ParagraphId = typeof ParagraphId.Type;

export class Publication extends Schema.Class<Publication>('Writings/Publication')({
  id: PublicationId,
  code: PublicationCode,
  title: Schema.NonEmptyString,
  author: Schema.NonEmptyString,
  paragraphCount: Schema.Option(NonNegativeInteger),
}) {}

export const WritingsLibrarySource = Schema.Literals(['local', 'remote', 'empty']);
export type WritingsLibrarySource = typeof WritingsLibrarySource.Type;

export const WritingsDownloadStatus = Schema.Literals(['pending', 'success', 'failed']);
export type WritingsDownloadStatus = typeof WritingsDownloadStatus.Type;

export class WritingsLibraryPublication extends Schema.Class<WritingsLibraryPublication>(
  'Writings/LibraryPublication',
)({
  id: PublicationId,
  code: PublicationCode,
  title: Schema.NonEmptyString,
  author: Schema.NonEmptyString,
  paragraphCount: NonNegativeInteger,
  source: WritingsLibrarySource,
  status: WritingsDownloadStatus,
  error: Schema.NullOr(Schema.String),
}) {}

export class WritingsDownloadResult extends Schema.Class<WritingsDownloadResult>(
  'Writings/DownloadResult',
)({
  publicationId: PublicationId,
  code: PublicationCode,
  status: WritingsDownloadStatus,
  paragraphCount: NonNegativeInteger,
  error: Schema.NullOr(Schema.String),
}) {}

export class PublicationReference extends Schema.TaggedClass<PublicationReference>(
  'Writings/PublicationReference',
)('publication', {
  publicationId: PublicationId,
}) {}

export class PageReference extends Schema.TaggedClass<PageReference>('Writings/PageReference')(
  'page',
  {
    publicationId: PublicationId,
    page: PageNumber,
  },
) {}

export class ParagraphReference extends Schema.TaggedClass<ParagraphReference>(
  'Writings/ParagraphReference',
)('paragraph', {
  publicationId: PublicationId,
  paragraphId: ParagraphId,
}) {}

export const ReferenceSchema = Schema.Union([
  PublicationReference,
  PageReference,
  ParagraphReference,
]);
export type Reference = typeof ReferenceSchema.Type;

export class Paragraph extends Schema.Class<Paragraph>('Writings/Paragraph')({
  reference: ParagraphReference,
  publicationCode: PublicationCode,
  order: PublicationOrder,
  page: Schema.Option(PageNumber),
  number: Schema.Option(NonNegativeInteger),
  refcode: Schema.Option(Schema.NonEmptyString),
  nodes: Schema.Array(Node),
  elementType: Schema.Option(Schema.NonEmptyString),
  elementSubtype: Schema.Option(Schema.NonEmptyString),
}) {}

export class Heading extends Schema.Class<Heading>('Writings/Heading')({
  reference: ParagraphReference,
  publicationCode: PublicationCode,
  order: PublicationOrder,
  page: Schema.Option(PageNumber),
  number: Schema.Option(NonNegativeInteger),
  refcode: Schema.Option(Schema.NonEmptyString),
  title: Schema.NonEmptyString,
  level: NonNegativeInteger,
}) {}

export class Page extends Schema.Class<Page>('Writings/Page')({
  publication: Publication,
  reference: PageReference,
  paragraphs: Schema.NonEmptyArray(Paragraph),
  heading: Schema.Option(Schema.NonEmptyString),
  previous: Schema.Option(PageReference),
  next: Schema.Option(PageReference),
}) {}

export class SearchHit extends Schema.Class<SearchHit>('Writings/SearchHit')({
  publication: Publication,
  paragraph: Paragraph,
}) {}

export const publicationId = Schema.decodeSync(PublicationId);
export const publicationCode = Schema.decodeSync(PublicationCode);
export const pageNumber = Schema.decodeSync(PageNumber);
export const publicationOrder = Schema.decodeSync(PublicationOrder);
export const paragraphId = Schema.decodeSync(ParagraphId);

export const Reference = {
  publication: (publication: number): PublicationReference =>
    new PublicationReference({ publicationId: publicationId(publication) }),
  page: (publication: number, page: number): PageReference =>
    new PageReference({
      publicationId: publicationId(publication),
      page: pageNumber(page),
    }),
  paragraph: (publication: number, paragraph: string): ParagraphReference =>
    new ParagraphReference({
      publicationId: publicationId(publication),
      paragraphId: paragraphId(paragraph),
    }),
} as const;
