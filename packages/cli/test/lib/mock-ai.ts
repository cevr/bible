import type { ModelMessage } from 'ai';
import { Effect, Layer, Schema, SchemaGetter } from 'effect';

import { AI, AIError, type AIService } from '../../src/services/ai.js';
import type { ServiceCall } from './sequence-recorder.js';

export interface MockAIConfig {
  responses: {
    high: Array<string | object>;
    low: Array<string | object>;
  };
}

export interface MockAIState {
  highIndex: number;
  lowIndex: number;
  calls: ServiceCall[];
}

const JsonString = Schema.Unknown.pipe(
  Schema.encodeTo(Schema.String, {
    decode: SchemaGetter.parseJson(),
    encode: SchemaGetter.stringifyJson(),
  }),
);
const encodeJson = Schema.encodeUnknownEffect(JsonString);
const decodeJson = Schema.decodeUnknownEffect(JsonString);

const promptFrom = (messages: Array<ModelMessage>): string =>
  messages
    .filter((message) => message.role === 'user')
    .map((message) => {
      if (typeof message.content === 'string') {
        return message.content;
      }
      return '[complex]';
    })
    .join(' ');

export const createMockAILayer = (config: MockAIConfig) => {
  const state: MockAIState = {
    highIndex: 0,
    lowIndex: 0,
    calls: [],
  };

  const nextResponse = (quality: 'high' | 'low'): string | object => {
    let index = state.lowIndex++;
    if (quality === 'high') {
      index = state.highIndex++;
    }
    const response = config.responses[quality][index];
    if (response !== undefined) {
      return response;
    }
    return `mock ${quality} response ${index}`;
  };

  const responseText = (response: string | object) => {
    if (typeof response === 'string') {
      return Effect.succeed(response);
    }
    return encodeJson(response);
  };

  const mockAI: AIService = {
    generateText: (options) => {
      const quality = options.model ?? 'high';
      const response = nextResponse(quality);
      state.calls.push({
        _tag: 'AI.generateText',
        model: quality,
        prompt: promptFrom(options.messages).slice(0, 100),
      });
      return responseText(response).pipe(
        Effect.map((text) => ({ text })),
        Effect.mapError((cause) => new AIError({ operation: 'mock.generateText', cause })),
      );
    },

    generateTextWithTools: (options) => {
      const quality = options.model ?? 'high';
      const response = nextResponse(quality);
      state.calls.push({
        _tag: 'AI.generateTextWithTools',
        model: quality,
        prompt: promptFrom(options.messages).slice(0, 100),
      });
      return responseText(response).pipe(
        Effect.map((text) => ({ text })),
        Effect.mapError((cause) => new AIError({ operation: 'mock.generateTextWithTools', cause })),
      );
    },

    generateObject: (options) => {
      const quality = options.model ?? 'high';
      const response = nextResponse(quality);
      state.calls.push({
        _tag: 'AI.generateObject',
        model: quality,
        prompt: promptFrom(options.messages).slice(0, 100),
      });
      let decodedResponse: Effect.Effect<unknown, Schema.SchemaError> = Effect.succeed(response);
      if (typeof response === 'string') {
        decodedResponse = decodeJson(response);
      }
      return decodedResponse.pipe(
        Effect.flatMap(Schema.decodeUnknownEffect(options.schema)),
        Effect.map((object) => ({ object })),
        Effect.mapError((cause) => new AIError({ operation: 'mock.generateObject', cause })),
      );
    },
  };

  return {
    layer: Layer.succeed(AI, mockAI),
    state,
  };
};
