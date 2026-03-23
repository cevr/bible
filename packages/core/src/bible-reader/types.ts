/**
 * Bible Reader Types
 *
 * Renderer-agnostic types for Bible data and navigation.
 * Used by both TUI and Web renderers.
 */

import { Schema } from 'effect';

/**
 * A verse from the Bible
 */
export class BibleVerse extends Schema.Class<BibleVerse>('BibleVerse')({
  bookName: Schema.String,
  book: Schema.Number,
  chapter: Schema.Number,
  verse: Schema.Number,
  text: Schema.String,
}) {}

/**
 * Book information
 */
export class BibleBook extends Schema.Class<BibleBook>('BibleBook')({
  number: Schema.Number,
  name: Schema.String,
  chapters: Schema.Number,
  testament: Schema.Literals(['old', 'new']),
}) {}

/**
 * Reference to a position in the Bible
 */
export class BibleReference extends Schema.Class<BibleReference>('BibleReference')({
  book: Schema.Number,
  chapter: Schema.Number,
  verse: Schema.optional(Schema.Number),
  verseEnd: Schema.optional(Schema.Number),
}) {
  static fromJson = Schema.decodeEffect(Schema.fromJsonString(BibleReference));
  static toJson = Schema.encodeEffect(Schema.fromJsonString(BibleReference));
}

/**
 * Current reading position
 */
export class BiblePosition extends Schema.Class<BiblePosition>('BiblePosition')({
  book: Schema.Number,
  chapter: Schema.Number,
  verse: Schema.Number,
}) {
  static fromJson = Schema.decodeEffect(Schema.fromJsonString(BiblePosition));
  static toJson = Schema.encodeEffect(Schema.fromJsonString(BiblePosition));
}

/**
 * Search result
 */
export class BibleSearchResult extends Schema.Class<BibleSearchResult>('BibleSearchResult')({
  reference: BibleReference,
  verse: BibleVerse,
  matchScore: Schema.Number,
}) {}

/**
 * Bookmark
 */
export class BibleBookmark extends Schema.Class<BibleBookmark>('BibleBookmark')({
  id: Schema.String,
  reference: BibleReference,
  note: Schema.optional(Schema.String),
  createdAt: Schema.Number,
}) {
  static fromJson = Schema.decodeEffect(Schema.fromJsonString(BibleBookmark));
  static toJson = Schema.encodeEffect(Schema.fromJsonString(BibleBookmark));
}

/**
 * History entry
 */
export class BibleHistoryEntry extends Schema.Class<BibleHistoryEntry>('BibleHistoryEntry')({
  reference: BibleReference,
  visitedAt: Schema.Number,
}) {}

/**
 * User preferences
 */
export class BiblePreferences extends Schema.Class<BiblePreferences>('BiblePreferences')({
  theme: Schema.String,
  displayMode: Schema.Literals(['verse', 'paragraph']),
}) {
  static fromJson = Schema.decodeEffect(Schema.fromJsonString(BiblePreferences));
  static toJson = Schema.encodeEffect(Schema.fromJsonString(BiblePreferences));
}

/**
 * Reader state variants - discriminated union for loading states
 */
export class BibleReaderIdle extends Schema.TaggedClass<BibleReaderIdle>('BibleReaderIdle')(
  'idle',
  {},
) {}

export class BibleReaderLoading extends Schema.TaggedClass<BibleReaderLoading>(
  'BibleReaderLoading',
)('loading', {
  message: Schema.String,
}) {}

export class BibleReaderLoaded extends Schema.TaggedClass<BibleReaderLoaded>('BibleReaderLoaded')(
  'loaded',
  {
    position: BiblePosition,
  },
) {}

export class BibleReaderErrorState extends Schema.TaggedClass<BibleReaderErrorState>(
  'BibleReaderErrorState',
)('error', {
  error: Schema.String,
}) {}

/**
 * Reader state - discriminated union for loading states
 */
export const BibleReaderState = Schema.Union([
  BibleReaderIdle,
  BibleReaderLoading,
  BibleReaderLoaded,
  BibleReaderErrorState,
]);

export type BibleReaderState = Schema.Schema.Type<typeof BibleReaderState>;

/**
 * Initial reader state
 */
export const initialReaderState: BibleReaderState = new BibleReaderIdle({});

/**
 * State matchers
 */
export const isBibleReaderState = {
  idle: (state: BibleReaderState): state is BibleReaderIdle => state._tag === 'idle',
  loading: (state: BibleReaderState): state is BibleReaderLoading => state._tag === 'loading',
  loaded: (state: BibleReaderState): state is BibleReaderLoaded => state._tag === 'loaded',
  error: (state: BibleReaderState): state is BibleReaderErrorState => state._tag === 'error',
} as const;
