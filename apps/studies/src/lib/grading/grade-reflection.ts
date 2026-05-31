import { Effect, Layer } from 'effect';
import { BunHttpClient } from '@effect/platform-bun';

import type { ChapterSource } from '../../../scripts/study-guide-schema.ts';
import type { Grade } from './grade.ts';
import { Grader, layerAnthropic } from './grader.ts';
import { type Audio, Transcriber } from './transcriber.ts';
import { layerOpenAi } from './transcriber-openai.ts';

/*
 * The grading program: the transcribe -> grade pipeline as one Effect.
 *   audio -> Transcriber.transcribe -> Grader.grade(transcript, source) -> Grade
 *
 * The route (src/pages/api/grade.ts) owns HTTP concerns: it enforces rate limits
 * and size caps, loads the chapter's PRIVATE-tier source (mapping a missing chapter
 * to 404), then calls runGrade with that source. The private Source Text + Key
 * Points never leave the server except within the Grade's explanations.
 */

/** Compose the live grading stack: Transcriber (OpenAI) + Grader (Anthropic),
 * both over a single Bun HttpClient. */
const liveLayer = Layer.mergeAll(layerOpenAi(), layerAnthropic()).pipe(
  Layer.provide(BunHttpClient.layer),
);

/** Transcribe the audio, then grade the transcript against the supplied source.
 * Returns the Grade plus the transcript (handy for the UI to echo back). */
export const gradeReflection = Effect.fn('gradeReflection')(function* (params: {
  readonly audio: Audio;
  readonly source: ChapterSource;
}) {
  const transcriber = yield* Transcriber;
  const grader = yield* Grader;

  const transcript = yield* transcriber.transcribe(params.audio);
  const grade = yield* grader.grade({
    transcript,
    sourceText: params.source.sourceText,
    keyPoints: params.source.keyPoints,
  });

  return { transcript, grade } satisfies { transcript: string; grade: Grade };
});

/**
 * Provide the live layers and run the grading program as an Exit for the route
 * handler, so the route can map typed failures (TranscriptionError / GradingError /
 * ConfigError) to HTTP responses without exceptions.
 */
export const runGrade = (params: { readonly audio: Audio; readonly source: ChapterSource }) =>
  Effect.runPromiseExit(gradeReflection(params).pipe(Effect.provide(liveLayer)));
