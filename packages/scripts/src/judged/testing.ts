// Test support for the judged lint: a stubbed keychain (the `security` tool
// the key is read from), the environment as config, and a fake TypeSafe HTTP
// client, so no test reads the real keychain or reaches the network.

import { ConfigProvider, Effect, Layer, type Option, Schema, Sink, Stream } from 'effect';
import { Headers, HttpClient, HttpClientResponse } from 'effect/http';
import { ChildProcessSpawner } from 'effect/process';

/** A keychain whose `security` prints `printed` and exits with `exitCode`; it counts the runs. */
const keychain = (printed: Stream.Stream<string>, exitCode: Effect.Effect<number>) => {
  const runs = { count: 0 };
  const stdout = Stream.encodeText(printed);
  const layer = Layer.succeed(
    ChildProcessSpawner.ChildProcessSpawner,
    ChildProcessSpawner.make(() => {
      runs.count++;
      return Effect.succeed(
        ChildProcessSpawner.makeHandle({
          pid: ChildProcessSpawner.ProcessId(0),
          exitCode: Effect.map(exitCode, ChildProcessSpawner.ExitCode),
          isRunning: Effect.succeed(false),
          kill: () => Effect.void,
          stdin: Sink.drain,
          stdout,
          stderr: Stream.empty,
          all: stdout,
          getInputFd: () => Sink.drain,
          getOutputFd: () => Stream.empty,
          unref: Effect.succeed(Effect.void),
        }),
      );
    }),
  );
  return { layer, runs };
};

/** A keychain that holds `key`: `security` prints it with its newline. */
export const holding = (key: string) => keychain(Stream.make(`${key}\n`), Effect.succeed(0));

/** A keychain with no such item: `security` prints nothing and exits 44. */
export const missing = () => keychain(Stream.empty, Effect.succeed(44));

/** A keychain that never answers (a locked keychain's unlock dialog). */
export const hangs = () => keychain(Stream.never, Effect.never);

/** `vars` as the program's environment. */
export const env = (vars: Record<string, string>) =>
  ConfigProvider.layer(ConfigProvider.fromUnknown(vars));

const Sent = Schema.fromJsonString(
  Schema.Struct({ questions: Schema.Record(Schema.String, Schema.Json) }),
);

/**
 * A fake TypeSafe HTTP client answering every request with `status` and
 * `body` (of the request's question keys); it records each request's URL
 * and authorization header.
 */
export const typesafeHttp = (status: number, body: (keys: ReadonlyArray<string>) => unknown) => {
  const requests: Array<{ readonly url: string; readonly authorization: Option.Option<string> }> =
    [];
  const layer = Layer.succeed(
    HttpClient.HttpClient,
    HttpClient.make((request) =>
      Effect.gen(function* () {
        requests.push({
          url: request.url,
          authorization: Headers.get(request.headers, 'authorization'),
        });
        if (request.body._tag !== 'Uint8Array') return yield* Effect.die('no JSON body');
        const sent = yield* Schema.decodeEffect(Sent)(new TextDecoder().decode(request.body.body));
        return HttpClientResponse.fromWeb(
          request,
          Response.json(body(Object.keys(sent.questions)), { status }),
        );
      }).pipe(Effect.orDie),
    ),
  );
  return { layer, requests };
};
