import { describe, expect, test } from 'bun:test';
import { Effect, Layer } from 'effect';
import { HttpClient, HttpClientResponse } from 'effect/unstable/http';

import { type Audio, Transcriber, TranscriptionError } from '../src/lib/grading/transcriber.ts';
import { layerOpenAi } from '../src/lib/grading/transcriber-openai.ts';

/*
 * Exercises the Transcriber port and its OpenAI implementation. The OpenAI layer
 * is driven by a mock HttpClient that returns canned responses, so these tests run
 * with no network and no API key dependency on the request path.
 */

const audio: Audio = {
  bytes: new Uint8Array([1, 2, 3, 4]),
  mimeType: 'audio/webm',
  filename: 'reflection.webm',
};

/** A mock HttpClient layer whose every request resolves to `response`. */
function mockHttpClient(response: Response): Layer.Layer<HttpClient.HttpClient> {
  return Layer.succeed(
    HttpClient.HttpClient,
    HttpClient.make((request) => Effect.succeed(HttpClientResponse.fromWeb(request, response))),
  );
}

// OPENAI_API_KEY must be present for Config.redacted; value is irrelevant to the mock.
const withKey = Layer.effectDiscard(
  Effect.sync(() => {
    process.env.OPENAI_API_KEY = 'sk-test-not-real';
  }),
);

describe('Transcriber port', () => {
  test('layerTest returns the canned transcript', async () => {
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const t = yield* Transcriber;
        return yield* t.transcribe(audio);
      }).pipe(Effect.provide(Transcriber.layerTest('hello world'))),
    );
    expect(result).toBe('hello world');
  });
});

describe('OpenAI transcriber', () => {
  test('parses the text field from a 200 response', async () => {
    const ok = new Response(JSON.stringify({ text: '  Daniel was sealed until the end.  ' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
    const layer = layerOpenAi().pipe(
      Layer.provideMerge(mockHttpClient(ok)),
      Layer.provideMerge(withKey),
    );
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const t = yield* Transcriber;
        return yield* t.transcribe(audio);
      }).pipe(Effect.provide(layer)),
    );
    // Trimmed.
    expect(result).toBe('Daniel was sealed until the end.');
  });

  test('maps 401 to a TranscriptionError with reason "auth"', async () => {
    const unauthorized = new Response('nope', { status: 401 });
    const layer = layerOpenAi().pipe(
      Layer.provideMerge(mockHttpClient(unauthorized)),
      Layer.provideMerge(withKey),
    );
    const exit = await Effect.runPromiseExit(
      Effect.gen(function* () {
        const t = yield* Transcriber;
        return yield* t.transcribe(audio);
      }).pipe(Effect.provide(layer)),
    );
    expect(exit._tag).toBe('Failure');
    const error = exit._tag === 'Failure' ? exit.cause.reasons[0] : undefined;
    const fail = error && error._tag === 'Fail' ? error.error : undefined;
    expect(fail).toBeInstanceOf(TranscriptionError);
    expect((fail as TranscriptionError).reason).toBe('auth');
  });

  test('maps an empty transcript to reason "empty"', async () => {
    const empty = new Response(JSON.stringify({ text: '   ' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
    const layer = layerOpenAi().pipe(
      Layer.provideMerge(mockHttpClient(empty)),
      Layer.provideMerge(withKey),
    );
    const exit = await Effect.runPromiseExit(
      Effect.gen(function* () {
        const t = yield* Transcriber;
        return yield* t.transcribe(audio);
      }).pipe(Effect.provide(layer)),
    );
    expect(exit._tag).toBe('Failure');
  });
});
