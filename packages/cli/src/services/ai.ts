import type { LanguageModel, ModelMessage, ToolSet } from 'ai';
import {
  generateObject as aiGenerateObject,
  generateText as aiGenerateText,
  jsonSchema,
  stepCountIs,
} from 'ai';
import { Effect, Layer, Option, Schema, Context } from 'effect';

// Tagged error for AI operations
export class AIError extends Schema.TaggedErrorClass<AIError>()('AIError', {
  operation: Schema.String,
  cause: Schema.Defect,
}) {}

type Quality = 'high' | 'low';

export type ModelService = {
  high: LanguageModel;
  low: LanguageModel;
};

interface GenerateTextOptions {
  model?: Quality;
  system?: string;
  messages: Array<ModelMessage>;
  maxOutputTokens?: number;
}

interface GenerateTextWithToolsOptions extends GenerateTextOptions {
  tools: ToolSet;
  maxSteps?: number;
}

interface GenerateObjectOptions<A> {
  model?: Quality;
  messages: Array<ModelMessage>;
  schema: Schema.Decoder<A>;
}

export interface AIService {
  readonly generateText: (options: GenerateTextOptions) => Effect.Effect<{ text: string }, AIError>;
  readonly generateTextWithTools: (
    options: GenerateTextWithToolsOptions,
  ) => Effect.Effect<{ text: string }, AIError>;
  readonly generateObject: <A>(
    options: GenerateObjectOptions<A>,
  ) => Effect.Effect<{ object: A }, AIError>;
}

/**
 * Convert an Effect Schema to an AI SDK schema.
 * Uses JSONSchema.make for the JSON schema and Schema.decodeUnknownSync for validation.
 */
function toAISchema<A>(schema: Schema.Decoder<A>) {
  const doc = Schema.toJsonSchemaDocument(schema);
  const js = {
    ...doc.schema,
    ...(Object.keys(doc.definitions).length > 0 ? { $defs: doc.definitions } : {}),
  };
  const decode = Schema.decodeUnknownSync(schema);
  return jsonSchema<A>(js as Record<string, unknown>, {
    validate: (value) => {
      try {
        const result = decode(value);
        return { success: true, value: result } as const;
      } catch (e) {
        return { success: false, error: e instanceof Error ? e : new Error(String(e)) } as const;
      }
    },
  });
}

export class AI extends Context.Service<AI, AIService>()('@bible/cli/services/ai') {
  /**
   * Create AI layer from models, deferring to existing AI if present.
   * This allows tests to provide mock AI that takes precedence.
   */
  static fromModel(models: ModelService): Layer.Layer<AI> {
    return Layer.effect(
      AI,
      Effect.gen(function* () {
        const existing = yield* Effect.serviceOption(AI);
        if (Option.isSome(existing)) return existing.value;
        return AI.#createService(models);
      }),
    );
  }

  static #createService(models: ModelService): AIService {
    const getModel = (quality: Quality = 'high'): LanguageModel =>
      quality === 'high' ? models.high : models.low;

    return {
      generateText: (options) =>
        Effect.tryPromise({
          try: async () => {
            const result = await aiGenerateText({
              model: getModel(options.model),
              system: options.system,
              messages: options.messages,
              maxOutputTokens: options.maxOutputTokens,
            });
            return { text: result.text };
          },
          catch: (error) =>
            new AIError({
              operation: 'generateText',
              cause: error,
            }),
        }),

      generateTextWithTools: (options) =>
        Effect.tryPromise({
          try: async () => {
            const result = await aiGenerateText({
              model: getModel(options.model),
              system: options.system,
              messages: options.messages,
              maxOutputTokens: options.maxOutputTokens,
              tools: options.tools,
              stopWhen: stepCountIs(options.maxSteps ?? 5),
            });
            // result.text is empty when the final step is a tool call, not a text response
            const text = result.text || [...result.steps].reverse().find((s) => s.text)?.text || '';
            return { text };
          },
          catch: (error) =>
            new AIError({
              operation: 'generateTextWithTools',
              cause: error,
            }),
        }),

      generateObject: <A>(options: GenerateObjectOptions<A>) =>
        Effect.tryPromise({
          try: async () => {
            const aiSchema = toAISchema(options.schema);
            const result = await aiGenerateObject({
              model: getModel(options.model),
              messages: options.messages,
              schema: aiSchema,
            });
            return { object: result.object };
          },
          catch: (error) =>
            new AIError({
              operation: 'generateObject',
              cause: error,
            }),
        }),
    };
  }
}
