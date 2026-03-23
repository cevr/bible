import { Schema } from 'effect';

/**
 * Context for a Sabbath School lesson.
 */
export class LessonContext extends Schema.Class<LessonContext>('LessonContext')({
  year: Schema.Number,
  quarter: Schema.Number.pipe(Schema.check(Schema.isBetween({ minimum: 1, maximum: 4 }))),
  week: Schema.Number.pipe(Schema.check(Schema.isBetween({ minimum: 1, maximum: 13 }))),
}) {}

/**
 * PDF files for a week's lesson.
 */
export class WeekFiles extends Schema.Class<WeekFiles>('WeekFiles')({
  lessonPdf: Schema.String,
  egwPdf: Schema.String,
}) {}

/**
 * Week URLs with associated files.
 */
export class WeekUrls extends Schema.Class<WeekUrls>('WeekUrls')({
  weekNumber: Schema.Number,
  files: WeekFiles,
}) {}
