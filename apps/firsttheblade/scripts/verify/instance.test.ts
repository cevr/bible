import { BunServices } from '@effect/platform-bun';
import { describe, expect, it } from 'effect-bun-test';
import { Clock, Config, Effect, FileSystem, Layer, Schema, Stream } from 'effect';
import { FetchHttpClient } from 'effect/http';
import { ChildProcessSpawner } from 'effect/process';

import { answersCheck } from './doctor.ts';
import { awaitReady, cwdIs, launch, previewCommand } from './instance.ts';
import { LaunchRecord } from './model.ts';

const services = Layer.mergeAll(BunServices.layer, FetchHttpClient.layer);

/** A server that takes every connection and never answers, held for the scope. */
const silentOrigin = Effect.acquireRelease(
  Effect.sync(() =>
    // oxlint-disable-next-line effect/noGlobals -- a raw socket that never answers, which no Effect service offers.
    Bun.listen({ hostname: '127.0.0.1', port: 0, socket: { data: () => {} } }),
  ),
  (server) => Effect.sync(() => server.stop(true)),
).pipe(Effect.map((server) => `http://127.0.0.1:${server.port}`));

/** A scratch root made for the test, by its real path (as `lsof` names it). */
const scratchRoot = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  return yield* fs.realPath(yield* fs.makeTempDirectoryScoped({ prefix: 'verify-root-' }));
});

describe('the verify instance', () => {
  it.scopedLive.layer(services)(
    'fails a preview that takes the connection and never answers as NotReady, within its wait',
    () =>
      Effect.gen(function* () {
        const origin = yield* silentOrigin;
        const started = yield* Clock.currentTimeMillis;
        const error = yield* Effect.flip(
          awaitReady(origin, Effect.never, '/no/log', { each: '200 millis', within: '1 second' }),
        );
        expect(error._tag).toBe('NotReady');
        expect((yield* Clock.currentTimeMillis) - started).toBeLessThan(2500);
      }),
    4000,
  );

  it.scopedLive.layer(services)(
    'fails at once as NotReady when the preview exits before it answers',
    () =>
      Effect.gen(function* () {
        const origin = yield* silentOrigin;
        const started = yield* Clock.currentTimeMillis;
        const error = yield* Effect.flip(
          awaitReady(origin, Effect.succeed(1), '/no/log', {
            each: '1 second',
            within: '3 seconds',
          }),
        );
        expect(error._tag).toBe('NotReady');
        expect(error.message).toContain('exited');
        expect((yield* Clock.currentTimeMillis) - started).toBeLessThan(1000);
      }),
    4000,
  );

  it.scopedLive.layer(services)(
    "fails the doctor's answers check on a request that never answers",
    () =>
      Effect.gen(function* () {
        const origin = yield* silentOrigin;
        const error = yield* Effect.flip(answersCheck(origin, '300 millis'));
        expect(error.check).toBe('answers');
      }),
    4000,
  );

  it.scopedLive.layer(services)("starts the preview with no root's .env read", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
      const root = yield* scratchRoot;
      yield* fs.writeFileString(`${root}/.env`, 'MAIL_ADMIN_TOKEN=sentinel\n');
      yield* fs.writeFileString(
        `${root}/probe.ts`,
        "console.log(process.env.MAIL_ADMIN_TOKEN ?? 'unset');\n",
      );
      const env = { PATH: yield* Config.String('PATH'), HOME: yield* Config.String('HOME') };
      const handle = yield* spawner.spawn(previewCommand(`${root}/probe.ts`, root, env));
      const out = yield* Stream.mkString(Stream.decodeText(handle.stdout));
      expect(out.trim()).toBe('unset');
    }),
  );

  it.scopedLive.layer(services)('refuses a root whose preview still runs', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
      const root = yield* scratchRoot;
      // A process that is a preview running in the root, as `stop` tells one.
      yield* fs.makeDirectory(`${root}/src/worker`, { recursive: true });
      yield* fs.writeFileString(`${root}/src/worker/preview.ts`, 'setInterval(() => {}, 1000);\n');
      const env = { PATH: yield* Config.String('PATH') };
      const running = yield* spawner.spawn(
        previewCommand(`${root}/src/worker/preview.ts`, root, env),
      );
      const record: LaunchRecord = {
        root,
        port: 8611,
        origin: 'http://127.0.0.1:8611',
        pid: Number(running.pid),
        head: 'test',
        dist: `${root}/dist`,
        outbox: `${root}/tmp/outbox`,
        log: `${root}/preview.log`,
        startedAt: '2026-10-21T00:00:00.000Z',
      };
      yield* fs.writeFileString(
        `${root}/launch.json`,
        yield* Schema.encodeEffect(Schema.fromJsonString(LaunchRecord))(record),
      );
      const error = yield* Effect.flip(launch(root, 8612));
      expect(error._tag).toBe('Refused');
      expect(yield* fs.readFileString(`${root}/launch.json`)).toContain(String(record.pid));
    }),
  );

  it.effect("reads a root's directory from lsof by the whole path", () =>
    Effect.sync(() => {
      const lsof = 'p42\nfcwd\nn/x/r2\n';
      expect(cwdIs(lsof, '/x/r2')).toBe(true);
      expect(cwdIs(lsof, '/x/r')).toBe(false);
    }),
  );
});
