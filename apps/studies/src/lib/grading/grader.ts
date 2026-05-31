import { Config, Context, Effect, Layer, Schema } from 'effect';
import type { ConfigError } from 'effect/Config';
import { LanguageModel } from 'effect/unstable/ai';
import { AnthropicClient, AnthropicLanguageModel } from '@effect/ai-anthropic';
import type { HttpClient } from 'effect/unstable/http';

import type { KeyPoint } from '../../../scripts/study-guide-schema.ts';
import { Grade } from './grade.ts';

/*
 * The Grader: scores a Voice Reflection transcript against a chapter's verbatim
 * Source Text and authored Key Points, returning a hybrid Grade (key-point
 * coverage + free-claim verdicts + overall score). See CONTEXT.md ("Grader") and
 * docs/adr/0001. Self-contained: a single Anthropic LanguageModel, not gent's
 * driver-registry machinery.
 */

const DEFAULT_MODEL = 'claude-opus-4-5';

/** Everything the Grader needs to assess one reflection. */
export interface GradeInput {
  /** The learner's spoken reflection, transcribed. */
  readonly transcript: string;
  /** The verbatim chapter prose — the ground truth. */
  readonly sourceText: string;
  /** The authored recall rubric. */
  readonly keyPoints: ReadonlyArray<KeyPoint>;
}

/** A failed grading attempt — model error or unparseable output. */
export class GradingError extends Schema.TaggedErrorClass<GradingError>()(
  '@bible/studies/grading/GradingError',
  {
    reason: Schema.Literals(['model', 'decode']),
    message: Schema.String,
  },
) {}

export interface GraderService {
  readonly grade: (input: GradeInput) => Effect.Effect<Grade, GradingError>;
}

export class Grader extends Context.Service<Grader, GraderService>()(
  '@bible/studies/grading/Grader',
) {
  /** Test layer: returns a fixed Grade without any model call. */
  static layerTest = (grade: Grade): Layer.Layer<Grader> =>
    Layer.succeed(Grader, {
      grade: () => Effect.succeed(grade),
    });
}

const SYSTEM_INSTRUCTIONS = `You grade a learner's spoken reflection about a chapter of a 19th-century Adventist study book, judging it ONLY against the supplied Source Text — never outside knowledge.

You are given: the verbatim Source Text, a list of authored Key Points (the recall rubric, each with an id), and the learner's transcript.

Produce a Grade with:
- keyPoints: for EVERY supplied Key Point, a verdict echoing its keyPointId, with status "covered" (clearly stated), "partial" (touched but incomplete or imprecise), or "missed" (absent), plus a one-or-two-sentence explanation grounded in the Source Text.
- freeClaims: for each substantive claim the learner made that is NOT one of the Key Points, a verdict with status "correct" (supported by the Source Text), "partial" (partly right or imprecise), or "wrong" (contradicts the Source Text), plus an explanation. If there are no such claims, return an empty array.
- score: an integer 0-100 reflecting overall coverage and accuracy.
- summary: a short, encouraging paragraph.

Be fair but rigorous. Reward understanding over verbatim recall. Do not invent Key Points beyond those supplied. Judge truth strictly by the Source Text.`;

const buildUserMessage = (input: GradeInput): string => {
  const keyPointList = input.keyPoints
    .map((kp) => `- [${kp.id}] ${kp.label}: ${kp.detail}`)
    .join('\n');
  return [
    '## Source Text (ground truth)',
    input.sourceText,
    '',
    '## Key Points (rubric)',
    keyPointList,
    '',
    "## Learner's transcript",
    input.transcript,
  ].join('\n');
};

const grade = (
  input: GradeInput,
): Effect.Effect<Grade, GradingError, LanguageModel.LanguageModel> =>
  LanguageModel.generateObject({
    schema: Grade,
    objectName: 'Grade',
    prompt: [
      { role: 'system', content: SYSTEM_INSTRUCTIONS },
      { role: 'user', content: buildUserMessage(input) },
    ],
  }).pipe(
    Effect.map((response) => response.value),
    Effect.mapError(
      (cause) => new GradingError({ reason: 'model', message: `Grading failed: ${String(cause)}` }),
    ),
  );

/**
 * Live Grader layer backed by Anthropic. Requires an HttpClient (provide
 * BunHttpClient.layer at the composition root). Reads ANTHROPIC_API_KEY from config.
 */
export const layerAnthropic = (
  options: { readonly model?: string } = {},
): Layer.Layer<Grader, ConfigError, HttpClient.HttpClient> => {
  const languageModel = AnthropicLanguageModel.layer({ model: options.model ?? DEFAULT_MODEL });
  const client = AnthropicClient.layerConfig({ apiKey: Config.redacted('ANTHROPIC_API_KEY') });
  return Layer.effect(
    Grader,
    Effect.gen(function* () {
      const model = yield* LanguageModel.LanguageModel;
      return {
        grade: (input: GradeInput) =>
          grade(input).pipe(Effect.provideService(LanguageModel.LanguageModel, model)),
      };
    }),
  ).pipe(Layer.provide(languageModel), Layer.provide(client));
};
