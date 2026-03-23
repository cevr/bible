import { Schema } from 'effect';

export class StructuralAnalysisError extends Schema.TaggedErrorClass<StructuralAnalysisError>()(
  'StructuralAnalysisError',
  {
    message: Schema.String,
    cause: Schema.optional(Schema.Unknown),
  },
) {}
