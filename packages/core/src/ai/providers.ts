import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAI } from '@ai-sdk/openai';
import { type LanguageModel } from 'ai';
import { Config, Effect, Option, Redacted, Schema } from 'effect';

/**
 * Supported AI providers.
 */
export enum Provider {
  Gemini = 'gemini',
  OpenAI = 'openai',
  Anthropic = 'anthropic',
}

/**
 * Model configuration with high and low quality options.
 */
export interface ModelConfig {
  readonly high: LanguageModel;
  readonly low: LanguageModel;
}

/**
 * Provider configuration with models and provider identifier.
 */
export interface ProviderConfig {
  readonly models: ModelConfig;
  readonly provider: Provider;
}

/**
 * Discovers available AI providers from environment configuration.
 * Returns all providers that have valid API keys configured.
 */
export const discoverProviders = Effect.fn('discoverProviders')(function* () {
  const googleKey = yield* Config.schema(Schema.NonEmptyString, 'GEMINI_API_KEY').pipe(
    Config.map(Redacted.make),
    Config.option,
  );
  const openaiKey = yield* Config.schema(Schema.NonEmptyString, 'OPENAI_API_KEY').pipe(
    Config.map(Redacted.make),
    Config.option,
  );
  const anthropicKey = yield* Config.schema(Schema.NonEmptyString, 'ANTHROPIC_API_KEY').pipe(
    Config.map(Redacted.make),
    Config.option,
  );

  const providers: Option.Option<ProviderConfig>[] = [
    Option.map(googleKey, (apiKey) => {
      const provider = createGoogleGenerativeAI({ apiKey: Redacted.value(apiKey) });
      return {
        models: {
          high: provider('gemini-3-pro-preview'),
          low: provider('gemini-2.5-flash-lite'),
        },
        provider: Provider.Gemini,
      } satisfies ProviderConfig;
    }),
    Option.map(openaiKey, (apiKey) => {
      const provider = createOpenAI({ apiKey: Redacted.value(apiKey) });
      return {
        models: {
          high: provider('gpt-5.2'),
          low: provider('gpt-4.1-nano'),
        },
        provider: Provider.OpenAI,
      } satisfies ProviderConfig;
    }),
    Option.map(anthropicKey, (apiKey) => {
      const provider = createAnthropic({ apiKey: Redacted.value(apiKey) });
      return {
        models: {
          high: provider('claude-opus-4-5'),
          low: provider('claude-haiku-4-5'),
        },
        provider: Provider.Anthropic,
      } satisfies ProviderConfig;
    }),
  ];

  return Option.reduceCompact(providers, [] as ProviderConfig[], (acc, model) => [...acc, model]);
});

/**
 * Gets the display name for a provider.
 */
export const getProviderName = (provider: Provider): string => {
  switch (provider) {
    case Provider.Gemini:
      return 'Gemini';
    case Provider.OpenAI:
      return 'OpenAI';
    case Provider.Anthropic:
      return 'Anthropic';
  }
};
