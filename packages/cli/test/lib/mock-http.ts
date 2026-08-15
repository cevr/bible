import { Effect, Layer, Option } from 'effect';
import { HttpClient, HttpClientResponse } from 'effect/unstable/http';

import type { ServiceCall } from './sequence-recorder.js';

export interface MockHttpConfig {
  responses: Record<
    string,
    {
      status: number;
      body: string | ArrayBuffer;
      headers?: Record<string, string>;
    }
  >;
}

export interface MockHttpState {
  calls: ServiceCall[];
}

export const createMockHttpLayer = (config: MockHttpConfig) => {
  const state: MockHttpState = { calls: [] };
  const client = HttpClient.make((request, url) =>
    Effect.sync(() => {
      const href = url.toString();
      state.calls.push({ _tag: 'HTTP.fetch', url: href });

      let configured = Option.fromNullishOr(config.responses[href]);
      if (Option.isNone(configured)) {
        for (const [pattern, response] of Object.entries(config.responses)) {
          if (href.startsWith(pattern) || href.includes(pattern)) {
            configured = Option.some(response);
            break;
          }
        }
      }

      if (Option.isNone(configured)) {
        return HttpClientResponse.fromWeb(
          request,
          new Response('', { status: 404, statusText: 'Not Found (mock)' }),
        );
      }

      return HttpClientResponse.fromWeb(
        request,
        new Response(configured.value.body, {
          status: configured.value.status,
          headers: configured.value.headers,
        }),
      );
    }),
  );

  return { layer: Layer.succeed(HttpClient.HttpClient, client), state };
};
