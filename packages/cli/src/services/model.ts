import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAI } from '@ai-sdk/openai';
import { Flag, CliError } from 'effect/unstable/cli';
import { Effect, Option, ServiceMap } from 'effect';

import { Provider, type ProviderConfig } from '@bible/core/ai';

import { matchEnum } from '../lib/general';

// Read API keys directly from process.env to support compile-time embedding
// Using explicit process.env.KEY syntax allows Bun's define option to replace at build time
// Returns Option to maintain Effect patterns
const getEnvKey = (
  key: 'GEMINI_API_KEY' | 'OPENAI_API_KEY' | 'ANTHROPIC_API_KEY',
): Option.Option<string> => {
  // These explicit references allow Bun's define to replace them at compile time
  const value =
    key === 'GEMINI_API_KEY'
      ? process.env.GEMINI_API_KEY
      : key === 'OPENAI_API_KEY'
        ? process.env.OPENAI_API_KEY
        : key === 'ANTHROPIC_API_KEY'
          ? process.env.ANTHROPIC_API_KEY
          : undefined;
  return Option.fromNullishOr(value).pipe(Option.filter((v) => v.length > 0));
};

const extractModel = Effect.fn('extractModel')(function* (modelOption: Option.Option<string>) {
  const google: Option.Option<ProviderConfig> = getEnvKey('GEMINI_API_KEY').pipe(
    Option.map((googleKey) => {
      const modelProvider = createGoogleGenerativeAI({ apiKey: googleKey });
      return {
        models: {
          high: modelProvider('gemini-3-pro-preview'),
          low: modelProvider('gemini-2.5-flash-lite'),
        },
        provider: Provider.Gemini,
      };
    }),
  );

  const openai: Option.Option<ProviderConfig> = getEnvKey('OPENAI_API_KEY').pipe(
    Option.map((openaiKey) => {
      const modelProvider = createOpenAI({ apiKey: openaiKey });
      return {
        models: {
          high: modelProvider('gpt-5.2'),
          low: modelProvider('gpt-4.1-nano'),
        },
        provider: Provider.OpenAI,
      };
    }),
  );

  const anthropic: Option.Option<ProviderConfig> = getEnvKey('ANTHROPIC_API_KEY').pipe(
    Option.map((anthropicKey) => {
      const modelProvider = createAnthropic({ apiKey: anthropicKey });
      return {
        models: {
          high: modelProvider('claude-opus-4-5'),
          low: modelProvider('claude-haiku-4-5'),
        },
        provider: Provider.Anthropic,
      };
    }),
  );

  const models = Option.reduceCompact(
    [google, openai, anthropic],
    [] as ProviderConfig[],
    (acc, model) => [...acc, model],
  );

  if (models.length === 0) {
    return yield* Effect.die(new Error('No model provider found'));
  }

  const model = modelOption.pipe(
    Option.flatMap((model) => matchEnum(Provider, model)),
    Option.flatMap((model) =>
      Option.fromNullishOr(models.find((m) => m.provider === model)?.models),
    ),
  );

  return yield* Option.match(model, {
    onNone: () =>
      Effect.fail(
        new CliError.InvalidValue({
          option: 'model',
          value: Option.getOrElse(modelOption, () => '(none)'),
          expected: `one of: ${models.map((m) => m.provider).join(', ')}`,
          kind: 'flag',
        }),
      ),
    onSome: Effect.succeed,
  });
});

export const requiredModel = Flag.string('model').pipe(
  Flag.withAlias('m'),
  Flag.optional,
  Flag.mapEffect(extractModel),
);
export class Model extends ServiceMap.Service<
  Model,
  Effect.Success<ReturnType<typeof extractModel>>
>()('@bible/cli/services/model') {}
