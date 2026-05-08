import { Effect, Layer } from 'effect';

import { AI, type AIService } from '../../src/services/ai.js';
import type { ServiceCall } from './sequence-recorder.js';

/**
 * Configuration for mock AI responses.
 */
export interface MockAIConfig {
  /** Queued responses for each model quality level */
  responses: {
    high: Array<string | object>;
    low: Array<string | object>;
  };
}

/**
 * State for tracking response indices and calls.
 */
export interface MockAIState {
  highIndex: number;
  lowIndex: number;
  calls: ServiceCall[];
}

/**
 * Create a mock AI layer that records all AI calls.
 */
export const createMockAILayer = (config: MockAIConfig) => {
  const state: MockAIState = {
    highIndex: 0,
    lowIndex: 0,
    calls: [],
  };

  const mockAI: AIService = {
    generateText: (options) => {
      const quality = options.model ?? 'high';
      const responses = config.responses[quality];
      const index = quality === 'high' ? state.highIndex++ : state.lowIndex++;
      const response = responses[index] ?? `mock ${quality} response ${index}`;

      // Extract prompt from messages for recording
      const prompt =
        options.messages
          ?.filter((m) => m.role === 'user')
          .map((m) => (typeof m.content === 'string' ? m.content : '[complex]'))
          .join(' ') ?? '';

      // Record the call
      state.calls.push({
        _tag: 'AI.generateText',
        model: quality,
        prompt: prompt.slice(0, 100),
      });

      return Effect.succeed({
        text: typeof response === 'string' ? response : JSON.stringify(response),
      });
    },

    generateTextWithTools: (options) => {
      const quality = options.model ?? 'high';
      const responses = config.responses[quality];
      const index = quality === 'high' ? state.highIndex++ : state.lowIndex++;
      const response = responses[index] ?? `mock ${quality} response ${index}`;

      const prompt =
        options.messages
          ?.filter((m) => m.role === 'user')
          .map((m) => (typeof m.content === 'string' ? m.content : '[complex]'))
          .join(' ') ?? '';

      state.calls.push({
        _tag: 'AI.generateTextWithTools',
        model: quality,
        prompt: prompt.slice(0, 100),
      });

      return Effect.succeed({
        text: typeof response === 'string' ? response : JSON.stringify(response),
      });
    },

    generateObject: (options) => {
      const quality = options.model ?? 'high';
      const responses = config.responses[quality];
      const index = quality === 'high' ? state.highIndex++ : state.lowIndex++;
      const response = responses[index] ?? { result: `mock ${quality} object` };

      // Extract prompt from messages for recording
      const prompt =
        options.messages
          ?.filter((m) => m.role === 'user')
          .map((m) => (typeof m.content === 'string' ? m.content : '[complex]'))
          .join(' ') ?? '';

      // Record the call
      state.calls.push({
        _tag: 'AI.generateObject',
        model: quality,
        prompt: prompt.slice(0, 100),
      });

      return Effect.succeed({
        object: typeof response === 'object' ? response : JSON.parse(response),
      });
    },
  };

  return {
    layer: Layer.succeed(AI, mockAI),
    state,
  };
};
