import { Config, Effect, Layer, Redacted, Schema } from 'effect';
import { HttpClient, HttpClientRequest, HttpClientResponse } from 'effect/unstable/http';

import { type Audio, Transcriber, TranscriptionError } from './transcriber.ts';

/*
 * OpenAI implementation of the Transcriber port (see ./transcriber.ts, docs/adr/0001).
 *
 * effect/unstable/ai and @effect/ai-openai do not expose a transcription primitive
 * (they cover chat/embeddings/tools), so we call OpenAI's /v1/audio/transcriptions
 * multipart endpoint directly through Effect's HttpClient — no raw fetch, fully
 * testable and swappable. The API key comes from OPENAI_API_KEY via Config.
 *
 * Requires an HttpClient layer (BunHttpClient.layer at the endpoint). The default
 * model is gpt-4o-transcribe; override via the layer factory.
 */

const ENDPOINT = 'https://api.openai.com/v1/audio/transcriptions';
const DEFAULT_MODEL = 'gpt-4o-transcribe';

const TranscriptionResponse = Schema.Struct({ text: Schema.String });

const decodeResponse = HttpClientResponse.schemaBodyJson(TranscriptionResponse);

const transcribe = (
  client: HttpClient.HttpClient,
  apiKey: Redacted.Redacted,
  model: string,
  audio: Audio,
): Effect.Effect<string, TranscriptionError> =>
  Effect.fnUntraced(function* () {
    const form = new FormData();
    form.append('model', model);
    form.append('file', new Blob([audio.bytes], { type: audio.mimeType }), audio.filename);

    const request = HttpClientRequest.post(ENDPOINT).pipe(
      HttpClientRequest.setHeader('Authorization', `Bearer ${Redacted.value(apiKey)}`),
      HttpClientRequest.bodyFormData(form),
    );

    const response = yield* client.execute(request).pipe(
      Effect.mapError(
        (cause) =>
          new TranscriptionError({
            reason: 'request',
            message: `HTTP request failed: ${String(cause)}`,
          }),
      ),
    );

    if (response.status === 401 || response.status === 403) {
      return yield* new TranscriptionError({
        reason: 'auth',
        message: 'OpenAI rejected the API key (check OPENAI_API_KEY).',
      });
    }
    if (response.status >= 400) {
      const body = yield* response.text.pipe(Effect.orElseSucceed(() => ''));
      return yield* new TranscriptionError({
        reason: 'provider',
        message: `OpenAI returned ${response.status}: ${body.slice(0, 300)}`,
      });
    }

    const parsed = yield* decodeResponse(response).pipe(
      Effect.mapError(
        (cause) =>
          new TranscriptionError({
            reason: 'decode',
            message: `Could not parse transcription response: ${String(cause)}`,
          }),
      ),
    );

    const text = parsed.text.trim();
    if (text.length === 0) {
      return yield* new TranscriptionError({
        reason: 'empty',
        message: 'Transcription returned no text.',
      });
    }
    return text;
  })();

/**
 * Live OpenAI Transcriber layer. Reads OPENAI_API_KEY from config. Requires an
 * HttpClient (provide BunHttpClient.layer at the composition root).
 */
export const layerOpenAi = (options: { readonly model?: string } = {}) =>
  Layer.effect(
    Transcriber,
    Effect.gen(function* () {
      const client = yield* HttpClient.HttpClient;
      const apiKey = yield* Config.redacted('OPENAI_API_KEY');
      const model = options.model ?? DEFAULT_MODEL;
      return {
        transcribe: (audio: Audio) => transcribe(client, apiKey, model, audio),
      };
    }),
  );
