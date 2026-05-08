import type { ServiceCall } from './sequence-recorder.js';

/**
 * Configuration for mock HTTP responses.
 */
export interface MockHttpConfig {
  /** URL pattern -> response mapping */
  responses: Record<
    string,
    {
      status: number;
      body: string | ArrayBuffer;
      headers?: Record<string, string>;
    }
  >;
}

/**
 * State for tracking HTTP calls.
 */
export interface MockHttpState {
  calls: ServiceCall[];
}

/**
 * Create a mock fetch function that records calls and returns configured responses.
 */
export const createMockFetch =
  (config: MockHttpConfig, state: MockHttpState) =>
  async (input: string | URL | Request, _init?: RequestInit): Promise<Response> => {
    const url =
      typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;

    // Record the call to shared state
    state.calls.push({ _tag: 'HTTP.fetch', url });

    // Find matching response (exact match first, then prefix match)
    let response = config.responses[url];

    if (!response) {
      // Try prefix matching for URLs with query params
      for (const [pattern, resp] of Object.entries(config.responses)) {
        if (url.startsWith(pattern) || url.includes(pattern)) {
          response = resp;
          break;
        }
      }
    }

    if (!response) {
      return new Response(null, {
        status: 404,
        statusText: 'Not Found (mock)',
      });
    }

    return new Response(response.body, {
      status: response.status,
      headers: response.headers,
    });
  };

/**
 * Install mock fetch globally.
 * Returns state object and cleanup function.
 */
export const installMockFetch = (config: MockHttpConfig) => {
  const originalFetch = globalThis.fetch;
  const state: MockHttpState = { calls: [] };
  const mockFetch = createMockFetch(config, state);

  globalThis.fetch = mockFetch as typeof fetch;

  return {
    state,
    cleanup: () => {
      globalThis.fetch = originalFetch;
    },
  };
};
