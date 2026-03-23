import { Schema } from 'effect';

import { LessonContext } from './schemas.js';

/**
 * Error thrown when downloading files fails.
 */
export class DownloadError extends Schema.TaggedErrorClass<DownloadError>()('DownloadError', {
  url: Schema.String,
  cause: Schema.Defect,
}) {}

/**
 * Error thrown when parsing HTML content fails.
 */
export class ParseError extends Schema.TaggedErrorClass<ParseError>()('ParseError', {
  url: Schema.String,
  cause: Schema.Defect,
}) {}

/**
 * Error thrown when no PDFs are found for a quarter.
 */
export class MissingPdfError extends Schema.TaggedErrorClass<MissingPdfError>()('MissingPdfError', {
  year: Schema.Number,
  quarter: Schema.Number,
}) {}

/**
 * Error thrown when outline generation fails.
 */
export class OutlineError extends Schema.TaggedErrorClass<OutlineError>()('OutlineError', {
  context: LessonContext,
  cause: Schema.Defect,
}) {}

/**
 * Error thrown when outline review fails.
 */
export class ReviewError extends Schema.TaggedErrorClass<ReviewError>()('ReviewError', {
  context: LessonContext,
  cause: Schema.Defect,
}) {}

/**
 * Error thrown when outline revision fails.
 */
export class ReviseError extends Schema.TaggedErrorClass<ReviseError>()('ReviseError', {
  context: LessonContext,
  cause: Schema.Defect,
}) {}

/**
 * Union of all Sabbath School errors (Schema)
 */
export const SabbathSchoolError = Schema.Union([
  DownloadError,
  ParseError,
  MissingPdfError,
  OutlineError,
  ReviewError,
  ReviseError,
]);

/**
 * Union of all Sabbath School errors (type)
 */
export type SabbathSchoolError = Schema.Schema.Type<typeof SabbathSchoolError>;
