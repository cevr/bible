import { Effect, Layer } from 'effect';
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

      let configured = config.responses[href];
      if (configured === undefined) {
        for (const [pattern, response] of Object.entries(config.responses)) {
          if (href.startsWith(pattern) || href.includes(pattern)) {
            configured = response;
            break;
          }
        }
      }

      if (configured === undefined) {
        return HttpClientResponse.fromWeb(
          request,
          new Response(null, { status: 404, statusText: 'Not Found (mock)' }),
        );
      }

      return HttpClientResponse.fromWeb(
        request,
        new Response(configured.body, {
          status: configured.status,
          headers: configured.headers,
        }),
      );
    }),
  );

  return { layer: Layer.succeed(HttpClient.HttpClient, client), state };
};
