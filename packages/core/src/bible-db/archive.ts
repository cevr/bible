import { Schema } from 'effect';

const Coordinate = Schema.Number.pipe(
  Schema.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(1)),
);

export const KjvVerseAsset = Schema.Struct({
  book_name: Schema.String,
  book: Coordinate,
  chapter: Coordinate,
  verse: Coordinate,
  text: Schema.String,
});

export const KjvAssetFile = Schema.Struct({
  metadata: Schema.optional(
    Schema.Struct({
      name: Schema.optional(Schema.String),
      shortname: Schema.optional(Schema.String),
      year: Schema.optional(Schema.String),
      copyright_statement: Schema.optional(Schema.String),
    }),
  ),
  verses: Schema.Array(KjvVerseAsset),
});
export type KjvAssetFile = typeof KjvAssetFile.Type;

export const StrongsWordAsset = Schema.Struct({
  text: Schema.String,
  strongs: Schema.optional(Schema.Array(Schema.String)),
  italic: Schema.optional(Schema.Boolean),
});
export type StrongsWordAsset = typeof StrongsWordAsset.Type;

export const StrongsVerseAsset = Schema.Struct({
  book: Coordinate,
  chapter: Coordinate,
  verse: Coordinate,
  words: Schema.Array(StrongsWordAsset),
});
export type StrongsVerseAsset = typeof StrongsVerseAsset.Type;

export const StrongsLexiconAsset = Schema.Struct({
  lemma: Schema.String,
  xlit: Schema.optional(Schema.String),
  def: Schema.String,
});
export type StrongsLexiconAsset = typeof StrongsLexiconAsset.Type;

export const StrongsLexicon = Schema.Record(Schema.String, StrongsLexiconAsset);
export type StrongsLexicon = typeof StrongsLexicon.Type;

export const CrossReference = Schema.Struct({
  book: Coordinate,
  chapter: Coordinate,
  verse: Schema.optional(Coordinate),
  verseEnd: Schema.optional(Coordinate),
});

export const CrossReferenceAsset = Schema.Record(
  Schema.String,
  Schema.Struct({ refs: Schema.Array(CrossReference) }),
);
export type CrossReferenceAsset = typeof CrossReferenceAsset.Type;

export const MarginNoteAsset = Schema.Struct({
  type: Schema.Literals(['hebrew', 'greek', 'alternate', 'name', 'other']),
  phrase: Schema.String,
  text: Schema.String,
});

export const MarginNotesAsset = Schema.Record(Schema.String, Schema.Array(MarginNoteAsset));
export type MarginNotesAsset = typeof MarginNotesAsset.Type;

const TopicalReference = Schema.Struct({
  raw: Schema.String,
  osis: Schema.Array(Schema.String),
});

const TopicalSection = Schema.Struct({
  label: Schema.String,
  references: Schema.Array(TopicalReference),
});

const TopicalEntry = Schema.Struct({
  entry_id: Schema.String,
  topic: Schema.String,
  alt_topics: Schema.optional(Schema.Array(Schema.String)),
  subtopics: Schema.Array(TopicalSection),
});

export const TopicalReferenceAsset = Schema.Struct({
  meta: Schema.Struct({
    id: Schema.String,
    title: Schema.String,
    license: Schema.String,
    provenance: Schema.Struct({
      source_url: Schema.String,
      source_hash: Schema.String,
    }),
  }),
  data: Schema.Array(TopicalEntry),
});
export type TopicalReferenceAsset = typeof TopicalReferenceAsset.Type;

export class BibleCorpusArchive extends Schema.Class<BibleCorpusArchive>('BibleCorpus/Archive')({
  kjv: KjvAssetFile,
  strongsVerses: Schema.Array(StrongsVerseAsset),
  strongsLexicon: StrongsLexicon,
  openBibleCrossReferences: CrossReferenceAsset,
  tskeCrossReferences: CrossReferenceAsset,
  marginNotes: MarginNotesAsset,
  topics: TopicalReferenceAsset,
}) {}

export const decodeBibleCorpusArchive = Schema.decodeUnknownEffect(BibleCorpusArchive);
