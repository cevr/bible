import { Option, Schema } from 'effect';

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

export class Publication extends Schema.Class<Publication>('Writings/Publication')({
  id: PublicationId,
  code: PublicationCode,
  title: Schema.NonEmptyString,
  author: Schema.NonEmptyString,
  paragraphCount: Schema.Option(NonNegativeInteger),
}) {}

export class PublicationReference extends Schema.TaggedClass<PublicationReference>(
  'Writings/PublicationReference',
)('publication', {
  publication: PublicationCode,
}) {}

export class PageReference extends Schema.TaggedClass<PageReference>('Writings/PageReference')(
  'page',
  {
    publication: PublicationCode,
    page: PageNumber,
  },
) {}

export class ParagraphReference extends Schema.TaggedClass<ParagraphReference>(
  'Writings/ParagraphReference',
)('paragraph', {
  publication: PublicationCode,
  order: PublicationOrder,
  page: Schema.Option(PageNumber),
  number: Schema.Option(NonNegativeInteger),
  refcode: Schema.Option(Schema.NonEmptyString),
}) {}

export const ReferenceSchema = Schema.Union([
  PublicationReference,
  PageReference,
  ParagraphReference,
]);
export type Reference = typeof ReferenceSchema.Type;

export class Paragraph extends Schema.Class<Paragraph>('Writings/Paragraph')({
  reference: ParagraphReference,
  paragraphId: Schema.Option(Schema.NonEmptyString),
  nodes: Schema.Array(Node),
  elementType: Schema.Option(Schema.NonEmptyString),
  elementSubtype: Schema.Option(Schema.NonEmptyString),
}) {}

export class Heading extends Schema.Class<Heading>('Writings/Heading')({
  reference: ParagraphReference,
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

export const Reference = {
  publication: (publication: string): PublicationReference =>
    new PublicationReference({ publication: publicationCode(publication) }),
  page: (publication: string, page: number): PageReference =>
    new PageReference({ publication: publicationCode(publication), page: pageNumber(page) }),
  paragraph: (input: {
    readonly publication: string;
    readonly order: number;
    readonly page?: number;
    readonly number?: number;
    readonly refcode?: string;
  }): ParagraphReference =>
    new ParagraphReference({
      publication: publicationCode(input.publication),
      order: publicationOrder(input.order),
      page: Option.fromNullishOr(input.page).pipe(Option.map(pageNumber)),
      number: Option.fromNullishOr(input.number),
      refcode: Option.fromNullishOr(input.refcode),
    }),
} as const;
