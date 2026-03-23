// @effect-diagnostics strictBooleanExpressions:off
import { type LanguageModel } from 'ai';
import { ServiceMap, Layer, Schema } from 'effect';

/**
 * Error thrown when AI operations fail.
 */
export class AiError extends Schema.TaggedErrorClass<AiError>()('AiError', {
  operation: Schema.String,
  cause: Schema.Defect,
}) {}

/**
 * Model configuration with high and low quality options.
 * - high: Use for complex tasks requiring high quality output
 * - low: Use for simple tasks, faster and cheaper
 */
export interface ModelConfig {
  readonly high: LanguageModel;
  readonly low: LanguageModel;
}

// ============================================================================
// Service Definition
// ============================================================================

/**
 * AI Service for text generation operations.
 * This service provides the configured AI models to use for generation.
 */
export class AiService extends ServiceMap.Service<AiService, ModelConfig>()(
  '@bible/core/ai/service/AiService',
) {
  /**
   * Live implementation using real AI models.
   * Caller must provide the model configuration.
   */
  static Live = (config: ModelConfig): Layer.Layer<AiService> => Layer.succeed(AiService, config);

  /**
   * Test implementation using mock models.
   * The mock models will throw if used - tests should mock at a higher level.
   */
  static Test = (): Layer.Layer<AiService> =>
    Layer.succeed(AiService, {
      high: {
        specificationVersion: 'v1',
        provider: 'test',
        modelId: 'test-high',
        defaultObjectGenerationMode: 'json',
        doGenerate: () => {
          throw new Error('Test model should not be called directly');
        },
        doStream: () => {
          throw new Error('Test model should not be called directly');
        },
      } as unknown as LanguageModel,
      low: {
        specificationVersion: 'v1',
        provider: 'test',
        modelId: 'test-low',
        defaultObjectGenerationMode: 'json',
        doGenerate: () => {
          throw new Error('Test model should not be called directly');
        },
        doStream: () => {
          throw new Error('Test model should not be called directly');
        },
      } as unknown as LanguageModel,
    });
}
