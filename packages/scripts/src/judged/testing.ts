// Test support for the judged lint: the historyComment rule, a stubbed keychain (the `security` tool
// the key is read from), the environment as config, and a fake TypeSafe HTTP
// client, so no test reads the real keychain or reaches the network.

import { ConfigProvider, Effect, Layer, type Option, Schema, Sink, Stream } from 'effect';
import { Headers, HttpClient, HttpClientResponse } from 'effect/http';
import { ChildProcessSpawner } from 'effect/process';

import type { JudgedRule } from './rule.js';

/** historyComment as the repo's `.oxlintrc.json` defines it (config.test.ts holds the two equal). */
export const historyComment: JudgedRule = {
  id: 'historyComment',
  severity: 'warn',
  version: 1,
  selector: 'comments',
  subject: 'code comment',
  instructions:
    "HISTORY means the comment narrates the code's own past: an earlier behaviour that no longer holds ('this used to retry', 'before X this read argv', 'we switched to Y'), or which change, review, pass or person altered it. TODAY means anything else: what the code does, why, a constraint, or a noun phrase naming a purpose. 'X used to <verb>' meaning 'X that is used for <verb>ing' is TODAY.",
  criteria: {
    today: 'states what the code does now, or why, or a purpose, or shows data',
    history: "tells the code's past: what it used to do, what changed it, when or by whom",
  },
  reports: 'history',
  threshold: 0.9,
  message:
    "the comment tells the code's history: say what it does today and why; how it got here lives in git log",
};

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
