/**
 * EGW Reader Types
 *
 * Renderer-agnostic types for the EGW reader service.
 * Used by both TUI and Web renderers.
 */

import { Schema } from 'effect';

/**
 * EGW Book Info - summary info for book listing
 */
export class EGWBookInfo extends Schema.Class<EGWBookInfo>('EGWBookInfo')({
  bookId: Schema.Number,
  bookCode: Schema.String,
  title: Schema.String,
  author: Schema.String,
  pageCount: Schema.optional(Schema.Number),
}) {
  static fromJson = Schema.decodeEffect(Schema.fromJsonString(EGWBookInfo));
  static toJson = Schema.encodeEffect(Schema.fromJsonString(EGWBookInfo));
}

/**
 * EGW Chapter/Section Info - for table of contents
 */
export class EGWChapterInfo extends Schema.Class<EGWChapterInfo>('EGWChapterInfo')({
  paraId: Schema.optional(Schema.String),
  title: Schema.optional(Schema.String),
  refcodeShort: Schema.optional(Schema.String),
  level: Schema.Number,
  puborder: Schema.Number,
}) {}

/**
 * EGW Paragraph - content unit
 */
export class EGWParagraph extends Schema.Class<EGWParagraph>('EGWParagraph')({
  paraId: Schema.optional(Schema.String),
  refcodeShort: Schema.optional(Schema.String),
  refcodeLong: Schema.optional(Schema.String),
  content: Schema.optional(Schema.String),
  puborder: Schema.Number,
  elementType: Schema.optional(Schema.String),
  elementSubtype: Schema.optional(Schema.String),
}) {}

/**
 * EGW Reader Position - current reading position
 */
export class EGWReaderPosition extends Schema.Class<EGWReaderPosition>('EGWReaderPosition')({
  bookCode: Schema.String,
  bookId: Schema.optional(Schema.Number),
  /** Current paragraph puborder */
  puborder: Schema.optional(Schema.Number),
  /** Page number (from refcode) */
  page: Schema.optional(Schema.Number),
  /** Paragraph number on page */
  paragraph: Schema.optional(Schema.Number),
}) {
  static fromJson = Schema.decodeEffect(Schema.fromJsonString(EGWReaderPosition));
  static toJson = Schema.encodeEffect(Schema.fromJsonString(EGWReaderPosition));
}

/**
 * Reader State variants - discriminated union for loading states
 */
export class EGWReaderIdle extends Schema.TaggedClass<EGWReaderIdle>('EGWReaderIdle')('idle', {}) {}

export class EGWReaderLoading extends Schema.TaggedClass<EGWReaderLoading>('EGWReaderLoading')(
  'loading',
  {
    message: Schema.String,
  },
) {}

export class EGWReaderLoaded extends Schema.TaggedClass<EGWReaderLoaded>('EGWReaderLoaded')(
  'loaded',
  {
    book: EGWBookInfo,
    paragraphs: Schema.Array(EGWParagraph),
  },
) {}

export class EGWReaderError extends Schema.TaggedClass<EGWReaderError>('EGWReaderError')('error', {
  error: Schema.String,
}) {}

/**
 * Reader State - discriminated union for loading states
 */
export const EGWReaderState = Schema.Union([
  EGWReaderIdle,
  EGWReaderLoading,
  EGWReaderLoaded,
  EGWReaderError,
]);

export type EGWReaderState = Schema.Schema.Type<typeof EGWReaderState>;

/**
 * Initial reader state
 */
export const initialReaderState: EGWReaderState = new EGWReaderIdle({});

/**
 * State matchers
 */
export const isReaderState = {
  idle: (state: EGWReaderState): state is EGWReaderIdle => state._tag === 'idle',
  loading: (state: EGWReaderState): state is EGWReaderLoading => state._tag === 'loading',
  loaded: (state: EGWReaderState): state is EGWReaderLoaded => state._tag === 'loaded',
  error: (state: EGWReaderState): state is EGWReaderError => state._tag === 'error',
} as const;

/**
 * State constructors
 */
export const ReaderState = {
  idle: (): EGWReaderState => new EGWReaderIdle({}),
  loading: (message: string): EGWReaderState => new EGWReaderLoading({ message }),
  loaded: (book: EGWBookInfo, paragraphs: readonly EGWParagraph[]): EGWReaderState =>
    new EGWReaderLoaded({ book, paragraphs: [...paragraphs] }),
  error: (error: string): EGWReaderState => new EGWReaderError({ error }),
} as const;
