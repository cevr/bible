import type { ModelMessage } from 'ai';
import { Effect, Layer, Option, Schema, SchemaGetter } from 'effect';

import { AI, AIError, type AIService } from '../../src/services/ai.js';
import type { ServiceCall } from './sequence-recorder.js';

export interface MockAIConfig {
  responses: {
    high: Array<Schema.Json>;
    low: Array<Schema.Json>;
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
const decodeString = Schema.decodeUnknownOption(Schema.String);

const promptFrom = (messages: Array<ModelMessage>): string =>
  messages
    .filter((message) => message.role === 'user')
    .map((message) => Option.getOrElse(decodeString(message.content), () => '[complex]'))
    .join(' ');

export const createMockAILayer = (config: MockAIConfig) => {
  const state: MockAIState = {
    highIndex: 0,
    lowIndex: 0,
    calls: [],
  };

  const nextResponse = (quality: 'high' | 'low'): Schema.Json => {
    let index = state.lowIndex++;
    if (quality === 'high') {
      index = state.highIndex++;
    }
    return Option.getOrElse(
      Option.fromNullishOr(config.responses[quality][index]),
      () => `mock ${quality} response ${index}`,
    );
  };

  const responseText = (response: Schema.Json) =>
    Option.match(decodeString(response), {
      onSome: (text) => Effect.succeed(text),
      onNone: () => encodeJson(response),
    });

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
        Effect.mapError((cause) => AIError.make({ operation: 'mock.generateText', cause })),
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
        Effect.mapError((cause) =>
          AIError.make({ operation: 'mock.generateTextWithTools', cause }),
        ),
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
      const decodedResponse = Option.match(decodeString(response), {
        onSome: (text) => decodeJson(text),
        onNone: () => Effect.succeed(response),
      });
      return decodedResponse.pipe(
        Effect.flatMap(Schema.decodeUnknownEffect(options.schema)),
        Effect.map((object) => ({ object })),
        Effect.mapError((cause) => AIError.make({ operation: 'mock.generateObject', cause })),
      );
    },
  };

  return {
    layer: Layer.succeed(AI, mockAI),
    state,
  };
};
