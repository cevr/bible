import { describe, expect, test } from 'bun:test';
import { BunServices } from '@effect/platform-bun';
import { Effect, FileSystem, Layer, Option } from 'effect';
import type { Scope } from 'effect';
import { HttpRouter } from 'effect/unstable/http';

import { inspectConfig, inspectPath, inspectRoute } from './inspect.js';

describe('inspectConfig', () => {
  test('is off unless asked for', () => {
    expect(Option.isNone(inspectConfig({ HOME: '/home/a' }))).toBe(true);
    expect(Option.isNone(inspectConfig({ HOME: '/home/a', EGW_INSPECT: 'yes' }))).toBe(true);
  });

  test('is never on in production', () => {
    const env = { HOME: '/home/a', EGW_INSPECT: '1', NODE_ENV: 'production' };
    expect(Option.isNone(inspectConfig(env))).toBe(true);
  });

  test('uses the gateway CLI default state directory and port', () => {
    expect(inspectConfig({ HOME: '/home/a', EGW_INSPECT: '1' })).toEqual(
      Option.some({
        stateDir: '/home/a/.local/state/effect-frame/inspect',
        url: 'ws://127.0.0.1:4318',
      }),
    );
    expect(inspectConfig({ HOME: '/home/a', XDG_STATE_HOME: '/state', EGW_INSPECT: '1' })).toEqual(
      Option.some({ stateDir: '/state/effect-frame/inspect', url: 'ws://127.0.0.1:4318' }),
    );
  });

  test('takes explicit overrides, and refuses relative defaults', () => {
    expect(
      inspectConfig({
        EGW_INSPECT: '1',
        EGW_INSPECT_STATE_DIR: '/tmp/gw',
        EGW_INSPECT_GATEWAY: 'ws://127.0.0.1:9000',
      }),
    ).toEqual(Option.some({ stateDir: '/tmp/gw', url: 'ws://127.0.0.1:9000' }));
    expect(Option.isNone(inspectConfig({ HOME: 'relative', EGW_INSPECT: '1' }))).toBe(true);
  });
});

describe('GET /__inspect', () => {
  /** Serve the route over a fresh state directory; `get` answers a Response. */
  const serve = Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const stateDir = yield* fs.makeTempDirectoryScoped();
    const { handler, dispose } = HttpRouter.toWebHandler(
      inspectRoute({ stateDir, url: 'ws://127.0.0.1:4318' }).pipe(Layer.provide(BunServices.layer)),
    );
    yield* Effect.addFinalizer(() => Effect.promise(dispose));
    const get = Effect.promise(() => handler(new Request(`http://localhost${inspectPath}`)));
    const writeToken = (token: string) =>
      Effect.andThen(
        fs.writeFileString(`${stateDir}/attach-token`, `${token}\n`),
        fs.chmod(`${stateDir}/attach-token`, 0o600),
      );
    return { get, writeToken };
  });

  const run = <A, E>(program: Effect.Effect<A, E, FileSystem.FileSystem | Scope.Scope>) =>
    Effect.runPromise(Effect.scoped(program).pipe(Effect.provide(BunServices.layer)));

  test('answers the current attach capability, fresh on every request', () =>
    run(
      Effect.gen(function* () {
        const { get, writeToken } = yield* serve;
        yield* writeToken('effect-frame-attach.first');
        const first = yield* get;
        expect(first.headers.get('cache-control')).toBe('no-store');
        const one = yield* Effect.promise(() => first.json());
        yield* writeToken('effect-frame-attach.second');
        const second = yield* get;
        const two = yield* Effect.promise(() => second.json());
        expect([one, two]).toEqual([
          { url: 'ws://127.0.0.1:4318', token: 'effect-frame-attach.first' },
          { url: 'ws://127.0.0.1:4318', token: 'effect-frame-attach.second' },
        ]);
      }),
    ));

  test('answers 404 when no gateway is running', () =>
    run(
      Effect.gen(function* () {
        const { get } = yield* serve;
        expect((yield* get).status).toBe(404);
      }),
    ));
});
