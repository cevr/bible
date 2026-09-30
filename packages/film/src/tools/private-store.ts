// The app's private store, as its `sounds/library.ts` declares it (`store`):
// a folder, or a private R2 bucket. The declaration is public; what reaches
// the bucket is not: its account and its bucket-scoped S3 key come from the
// environment (or the app's git-ignored `.env`), read as `Redacted` and never
// logged. The store is resolved on first use, once, so a command that never
// touches it never needs its credentials.

import { Config, Context, Crypto, Effect, FileSystem, Layer, Option, Path, Redacted } from 'effect';
import { HttpClient } from 'effect/http';
import type { R2StoreConfig, StoreConfig } from '../core/sfx.ts';
import { type FilmModuleInvalid, StoreCredentialsMissing } from './errors.ts';
import { libraryModule } from './film-repo.ts';
import { type MediaStoreService, expandHome, folderStore } from './media-store.ts';
import { type R2Access, r2Store } from './r2-store.ts';
import { sha256Hex } from './sigv4.ts';

/** The environment variables that reach an R2 store. */
export const R2_ENV = {
  accountId: 'FILM_STORE_ACCOUNT_ID',
  accessKeyId: 'FILM_STORE_ACCESS_KEY_ID',
  secretAccessKey: 'FILM_STORE_SECRET_ACCESS_KEY',
} as const;

/** Why the store cannot be reached: its declaration does not decode, or the bucket's credentials are not set. */
export type StoreUnavailable = FilmModuleInvalid | StoreCredentialsMissing;

export interface PrivateStoreService {
  /** The declared store, resolved (and its credentials read) on first use. */
  readonly store: Effect.Effect<MediaStoreService, StoreUnavailable>;
}

/** What the environment holds of an R2 store's variables, each `Redacted` (read once, with the layer). */
interface R2Env {
  readonly accountId: Option.Option<Redacted.Redacted<string>>;
  readonly accessKeyId: Option.Option<Redacted.Redacted<string>>;
  readonly secretAccessKey: Option.Option<Redacted.Redacted<string>>;
}

// A variable that is set but unreadable is a broken environment, not a missing one.
const readEnv = (name: string) => Config.option(Config.Redacted(name)).pipe(Effect.orDie);

/** The bucket's access from the environment, or the names of the variables missing. */
const r2Access = (
  config: R2StoreConfig,
  env: R2Env,
): Effect.Effect<R2Access, StoreCredentialsMissing> => {
  const { accountId, accessKeyId, secretAccessKey } = env;
  if (Option.isSome(accountId) && Option.isSome(accessKeyId) && Option.isSome(secretAccessKey))
    return Effect.succeed({
      accountId: accountId.value,
      credentials: {
        accessKeyId: Redacted.value(accessKeyId.value),
        secretAccessKey: secretAccessKey.value,
      },
    });
  const fields: ReadonlyArray<keyof R2Env> = ['accountId', 'accessKeyId', 'secretAccessKey'];
  const missing = fields.flatMap((field) => {
    if (Option.isSome(env[field])) return [];
    return [R2_ENV[field]];
  });
  return Effect.fail(StoreCredentialsMissing.make({ bucket: config.bucket, missing }));
};

export class PrivateStore extends Context.Service<PrivateStore, PrivateStoreService>()(
  '@bible/film/tools/PrivateStore',
) {
  /** The store `sounds/library.ts` in `dir` declares. */
  static readonly layer = (dir: string) =>
    Layer.effect(
      PrivateStore,
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const crypto = yield* Crypto.Crypto;
        const http = yield* HttpClient.HttpClient;
        const home = yield* Config.String('HOME').pipe(Config.withDefault('~'));
        const env: R2Env = {
          accountId: yield* readEnv(R2_ENV.accountId),
          accessKeyId: yield* readEnv(R2_ENV.accessKeyId),
          secretAccessKey: yield* readEnv(R2_ENV.secretAccessKey),
        };
        const of = Effect.fnUntraced(function* (declared: StoreConfig) {
          switch (declared.kind) {
            case 'folder':
              return folderStore(fs, path, expandHome(declared.folder, home), (bytes) =>
                sha256Hex(crypto, bytes),
              );
            case 'r2':
              return r2Store({ fs, path, crypto, http }, declared, yield* r2Access(declared, env));
          }
        });
        const resolve = Effect.gen(function* () {
          const { store } = yield* libraryModule(path.join(dir, 'library.ts'));
          const resolved = yield* of(store);
          yield* Effect.logDebug(`store.resolved kind=${store.kind} where=${resolved.where}`);
          return resolved;
        });
        return PrivateStore.of({ store: yield* Effect.cached(resolve) });
      }),
    );
}
