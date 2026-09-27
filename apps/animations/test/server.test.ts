// The player's server listens on the loopback interface only: the lab's API
// rewrites scene files, so nothing on the network may reach it. Both servers
// the CLI starts (the render's, on any free port, and the lab's) come from
// `serve`.

import { describe, expect, it } from 'effect-bun-test';
import { Effect } from 'effect';
import { serve } from '../server.ts';

/** The server `serve` starts, stopped when the test's scope closes. */
const served = (development: boolean) =>
  Effect.acquireRelease(
    Effect.sync(() => serve(0, development)),
    (server) => Effect.promise(() => server.stop(true)),
  );

describe('serve', () => {
  it.live('binds 127.0.0.1, never every interface', () =>
    Effect.gen(function* () {
      for (const development of [false, true]) {
        const server = yield* served(development);
        expect(server.hostname).toBe('127.0.0.1');
        expect(server.url.hostname).toBe('127.0.0.1');
      }
    }).pipe(Effect.scoped),
  );
});
