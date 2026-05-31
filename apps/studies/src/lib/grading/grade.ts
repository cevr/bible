import { Schema } from 'effect';

/*
 * The Grade: the LLM's structured assessment of a Voice Reflection, produced via
 * LanguageModel.generateObject against this schema. Hybrid shape (see CONTEXT.md
 * "Grade"): (1) coverage of each authored Key Point, and (2) verdicts on the Free
 * Claims the learner volunteered. These are Effect Schema (not the zod content
 * schemas) because they constrain the model's structured output.
 */

/** How well the learner covered one authored Key Point. */
export const KeyPointVerdict = Schema.Struct({
  /** The Key Point id this verdict is for (echoes the authored id). */
  keyPointId: Schema.String,
  /** covered = clearly stated; partial = touched but incomplete/imprecise; missed = absent. */
  status: Schema.Literals(['covered', 'partial', 'missed']),
  /** One or two sentences justifying the status against the source text. */
  explanation: Schema.String,
});
export type KeyPointVerdict = typeof KeyPointVerdict.Type;

/** A verdict on one claim the learner made that wasn't an authored Key Point. */
export const FreeClaimVerdict = Schema.Struct({
  /** The learner's claim, paraphrased briefly. */
  claim: Schema.String,
  /** correct = supported by the source; partial = partly right or imprecise; wrong = contradicts the source. */
  status: Schema.Literals(['correct', 'partial', 'wrong']),
  /** One or two sentences justifying the verdict against the source text. */
  explanation: Schema.String,
});
export type FreeClaimVerdict = typeof FreeClaimVerdict.Type;

/** The full Grade returned to the learner. */
export const Grade = Schema.Struct({
  /** 0-100 overall score, derived by the model from coverage and accuracy. */
  score: Schema.Number.check(Schema.isBetween({ minimum: 0, maximum: 100 })),
  /** A short, encouraging summary of how the reflection went. */
  summary: Schema.String,
  /** One verdict per authored Key Point. */
  keyPoints: Schema.Array(KeyPointVerdict),
  /** Verdicts on extra claims the learner volunteered (may be empty). */
  freeClaims: Schema.Array(FreeClaimVerdict),
});
export type Grade = typeof Grade.Type;
