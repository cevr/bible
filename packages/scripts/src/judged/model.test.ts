import { ConfigProvider, Effect, Fiber, Layer, Option, Redacted, Sink, Stream } from 'effect';
import { describe, expect, it } from 'effect-bun-test';
import { ChildProcessSpawner } from 'effect/process';
import { TestClock } from 'effect/testing';

import { typesafeKey } from './model.js';

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

/** A keychain that holds `key`. */
const holding = (key: string) => keychain(Stream.make(`${key}\n`), Effect.succeed(0));

/** A keychain with no such item: `security` prints nothing and exits 44. */
const missing = keychain(Stream.empty, Effect.succeed(44));

/** A keychain that never answers (a locked keychain's unlock dialog). */
const hangs = keychain(Stream.never, Effect.never);

const env = (vars: Record<string, string>) =>
  ConfigProvider.layer(ConfigProvider.fromUnknown(vars));

const keyOf = Effect.map(typesafeKey, Option.map(Redacted.value));

describe("the lint's TypeSafe key", () => {
  it.effect('is TYPESAFE_API_KEY when set, with no keychain read', () => {
    const chain = holding('from-keychain');
    return Effect.gen(function* () {
      expect(yield* keyOf).toEqual(Option.some('from-env'));
      expect(chain.runs.count).toBe(0);
    }).pipe(Effect.provide([chain.layer, env({ TYPESAFE_API_KEY: 'from-env' })]));
  });

  it.effect("is the keychain's, its newline gone, when the environment has none", () => {
    const chain = holding('from-keychain');
    return Effect.gen(function* () {
      expect(yield* keyOf).toEqual(Option.some('from-keychain'));
      expect(chain.runs.count).toBe(1);
    }).pipe(Effect.provide([chain.layer, env({})]));
  });

  it.effect('is none when neither has one', () =>
    keyOf.pipe(
      Effect.map((key) => expect(key).toEqual(Option.none())),
      Effect.provide([missing.layer, env({})]),
    ),
  );

  it.effect('is none when the keychain does not answer in 2 seconds', () =>
    Effect.gen(function* () {
      const read = yield* Effect.forkChild(keyOf);
      yield* TestClock.adjust('2 seconds');
      expect(yield* Fiber.join(read)).toEqual(Option.none());
    }).pipe(Effect.provide([hangs.layer, env({})])),
  );
});
