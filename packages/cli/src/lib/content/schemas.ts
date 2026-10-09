import { Schema } from 'effect';

// Branded ID for Apple Notes
const AppleNoteId = Schema.String.pipe(Schema.brand('AppleNoteId'));
type AppleNoteId = typeof AppleNoteId.Type;

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
  chapter: Schema.Finite,
  apple_note_id: Schema.optionalKey(Schema.OptionFromUndefinedOr(AppleNoteId)),
}) {}

// Sabbath School frontmatter
export class SabbathSchoolFrontmatter extends Schema.Class<SabbathSchoolFrontmatter>(
  'SabbathSchoolFrontmatter',
)({
  created_at: Schema.String,
  year: Schema.Finite,
  quarter: Schema.Finite,
  week: Schema.Finite,
  apple_note_id: Schema.optionalKey(Schema.OptionFromUndefinedOr(AppleNoteId)),
}) {}
