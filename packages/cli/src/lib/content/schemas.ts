import { Schema } from 'effect';

// Branded ID for Apple Notes
export const AppleNoteId = Schema.String.pipe(Schema.brand('AppleNoteId'));
export type AppleNoteId = typeof AppleNoteId.Type;

// Base frontmatter - all content types extend this pattern
export class BaseFrontmatter extends Schema.Class<BaseFrontmatter>('BaseFrontmatter')({
  created_at: Schema.String,
  apple_note_id: Schema.optionalKey(Schema.OptionFromUndefinedOr(AppleNoteId)),
}) {}

// Messages frontmatter
export class MessageFrontmatter extends Schema.Class<MessageFrontmatter>('MessageFrontmatter')({
  created_at: Schema.String,
  topic: Schema.String,
  apple_note_id: Schema.optionalKey(Schema.OptionFromUndefinedOr(AppleNoteId)),
}) {}

// Studies frontmatter
export class StudyFrontmatter extends Schema.Class<StudyFrontmatter>('StudyFrontmatter')({
  created_at: Schema.String,
  topic: Schema.String,
  apple_note_id: Schema.optionalKey(Schema.OptionFromUndefinedOr(AppleNoteId)),
}) {}

// Readings frontmatter
export class ReadingFrontmatter extends Schema.Class<ReadingFrontmatter>('ReadingFrontmatter')({
  created_at: Schema.String,
  chapter: Schema.Number,
  apple_note_id: Schema.optionalKey(Schema.OptionFromUndefinedOr(AppleNoteId)),
}) {}

// Analyze frontmatter
export const AnalyzeDepth = Schema.Literals(['shallow', 'deep']);
export type AnalyzeDepth = typeof AnalyzeDepth.Type;

export class AnalyzeFrontmatter extends Schema.Class<AnalyzeFrontmatter>('AnalyzeFrontmatter')({
  created_at: Schema.String,
  passage: Schema.String,
  depth: AnalyzeDepth,
  apple_note_id: Schema.optionalKey(Schema.OptionFromUndefinedOr(AppleNoteId)),
}) {}

// Sabbath School frontmatter
export class SabbathSchoolFrontmatter extends Schema.Class<SabbathSchoolFrontmatter>(
  'SabbathSchoolFrontmatter',
)({
  created_at: Schema.String,
  year: Schema.Number,
  quarter: Schema.Number,
  week: Schema.Number,
  apple_note_id: Schema.optionalKey(Schema.OptionFromUndefinedOr(AppleNoteId)),
}) {}
