// The judged rules' model: TypeSafe's DecisionModel (`@effect/ai-typesafe`),
// which answers every decision of a definition in one request. The key is
// `TYPESAFE_API_KEY`, else the macOS login keychain's `typesafe-api-key`
// item for the account `bible-tools`. With no key the model is one whose
// every answer fails `AuthenticationError(MissingKey)`, so a run with all its
// items cached still needs no key, and a run that must ask skips `no-key`.
// The key is never printed, logged or put in a URL.

import { TypeSafeClient, TypeSafeDecisionModel } from '@effect/ai-typesafe';
import { Config, Effect, Layer, Option, Redacted } from 'effect';
import { AiError, DecisionModel } from 'effect/ai';
import * as ChildProcess from 'effect/process/ChildProcess';
import { ChildProcessSpawner } from 'effect/process/ChildProcessSpawner';

/** The model the rules ask, as config (`JUDGED_MODEL`), and its name in the cache's keys. */
export const modelName = Config.String('JUDGED_MODEL').pipe(Config.withDefault('jev-latest'));

export const cacheModel = (model: string) => `typesafe/${model}`;

/** How long the keychain may take: a locked one waits on its unlock dialog, and the push with it. */
const KEYCHAIN_DEADLINE = '2 seconds';

/**
 * The keychain's TypeSafe key: `security` prints it, or nothing when the item
 * or the tool is missing; none past `KEYCHAIN_DEADLINE`.
 */
const keychainKey = Effect.flatMap(ChildProcessSpawner, (spawner) =>
  spawner.string(
    ChildProcess.make('security', [
      'find-generic-password',
      '-s',
      'typesafe-api-key',
      '-a',
      'bible-tools',
      '-w',
    ]),
  ),
).pipe(
  Effect.timeoutOption(KEYCHAIN_DEADLINE),
  Effect.map(Option.flatMap((out) => Option.liftPredicate(out.trim(), (key) => key !== ''))),
  Effect.orElseSucceed(() => Option.none<string>()),
);

/** The TypeSafe key: `TYPESAFE_API_KEY`, else the keychain's, else none. */
export const typesafeKey = Effect.gen(function* () {
  const fromEnv = yield* Config.option(Config.Redacted('TYPESAFE_API_KEY')).pipe(
    Effect.orElseSucceed(() => Option.none<Redacted.Redacted<string>>()),
  );
  if (Option.isSome(fromEnv)) return fromEnv;
  return Option.map(yield* keychainKey, (key) => Redacted.make(key));
});

const missingKey = Layer.effect(DecisionModel.DecisionModel)(
  DecisionModel.make({
    decide: () =>
      Effect.fail(
        AiError.make({
          module: 'JudgedLint',
          method: 'decide',
          reason: AiError.AuthenticationError.make({ kind: 'MissingKey' }),
        }),
      ),
  }),
);

/** TypeSafe's DecisionModel for `model`, over the key `key` finds, at `apiUrl` (TypeSafe's own when none). */
export const typesafeModel = <E, R>(
  model: string,
  key: Effect.Effect<Option.Option<Redacted.Redacted<string>>, E, R>,
  apiUrl?: string,
) =>
  Layer.unwrap(
    Effect.map(
      key,
      Option.match({
        onNone: () => missingKey,
        onSome: (apiKey) =>
          TypeSafeDecisionModel.layer({ model }).pipe(
            Layer.provide(TypeSafeClient.layer({ apiKey, apiUrl })),
          ),
      }),
    ),
  );

/**
 * The model the lint asks: `JUDGED_MODEL` on TypeSafe, over its key, at
 * `TYPESAFE_API_URL` when that is set (a test's fake), else TypeSafe's.
 */
export const judgedModel = Layer.unwrap(
  Effect.gen(function* () {
    const model = yield* modelName;
    const apiUrl = yield* Config.option(Config.String('TYPESAFE_API_URL'));
    return typesafeModel(model, typesafeKey, Option.getOrUndefined(apiUrl));
  }),
);
