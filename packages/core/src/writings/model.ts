import { Schema } from 'effect';

import { Node } from '../egw/ast.js';

const NonNegativeInteger = Schema.Finite.pipe(
  Schema.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(0)),
);

export const PublicationId = Schema.Finite.pipe(
  Schema.check(Schema.isInt(), Schema.isGreaterThan(0)),
  Schema.brand('Writings/PublicationId'),
);
export type PublicationId = typeof PublicationId.Type;

export const PublicationCode = Schema.NonEmptyString.pipe(Schema.brand('Writings/PublicationCode'));
export type PublicationCode = typeof PublicationCode.Type;

const PageNumber = Schema.Finite.pipe(
  Schema.check(Schema.isInt(), Schema.isGreaterThan(0)),
  Schema.brand('Writings/PageNumber'),
);
type PageNumber = typeof PageNumber.Type;

const PublicationOrder = Schema.Finite.pipe(
  Schema.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(0)),
  Schema.brand('Writings/PublicationOrder'),
);
type PublicationOrder = typeof PublicationOrder.Type;

const ParagraphId = Schema.NonEmptyString.pipe(Schema.brand('Writings/ParagraphId'));
type ParagraphId = typeof ParagraphId.Type;

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

const ReferenceSchema = Schema.Union([PublicationReference, PageReference, ParagraphReference]);
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

/** A paragraph a refcode cites, with its publication. One refcode can cite
 *  paragraphs in more than one publication (a Publication Code is not an
 *  identity), so a lookup returns every match rather than choosing one. */
export class RefcodeMatch extends Schema.Class<RefcodeMatch>('Writings/RefcodeMatch')({
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
    PublicationReference.make({ publicationId: publicationId(publication) }),
  page: (publication: number, page: number): PageReference =>
    PageReference.make({
      publicationId: publicationId(publication),
      page: pageNumber(page),
    }),
  paragraph: (publication: number, paragraph: string): ParagraphReference =>
    ParagraphReference.make({
      publicationId: publicationId(publication),
      paragraphId: paragraphId(paragraph),
    }),
};
