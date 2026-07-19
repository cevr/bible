import { BibleCorpus, BibleDatabase } from '@bible/core/bible-db';
import type { BibleService } from '@bible/core/bible/service';
import { EGWApiClient, EGWAuth, EGWTokenStore } from '@bible/core/egw';
import { EGWParagraphDatabase } from '@bible/core/egw-db';
import userStateMigrationSql from '@bible/core/local-first/migrations/0001_user_state.sql';
import { ClientId, MutationId, Timestamp } from '@bible/core/local-first';
import {
  CommitId,
  type ProcedureRuntime,
  type ReadingPreferencesRuntime,
  RuntimeGeneration,
} from '@bible/core/procedure';
import type { WritingsService } from '@bible/core/writings/service';
import * as SqliteNode from '@effect/sql-sqlite-node/SqliteClient';
import { Effect, Layer, ManagedRuntime, Option, Schema } from 'effect';
import type { Effect as EffectNs } from 'effect';
import { FetchHttpClient } from 'effect/unstable/http';
import { promises as fs } from 'node:fs';
import path from 'node:path';

import { CacheDatabase } from './cache-db.js';
import { layerDesktopProcedureDependencies } from './local-procedure-runtime.js';

// Token-store fs operations always `Effect.orDie` afterward — a token-file
// IO failure at boot is unrecoverable — but the language-service still
// requires a typed catch, so we tag and immediately die.
class TokenIoError extends Schema.TaggedErrorClass<TokenIoError>()('TokenIoError', {
  message: Schema.String,
  cause: Schema.Unknown,
}) {}

/**
 * Main-process Effect runtime. Hosts:
 *   - EGWParagraphDatabase (FTS5 search index, shares cache.sqlite)
 *   - EGWAuth + EGWApiClient (live HTTP — runs node-side so no CORS,
 *     credentials never leave main, traceparent headers don't trip CORS
 *     preflight that the renderer's browser fetch can't bypass)
 *
 * The renderer talks to EGW exclusively through `egw:*` IPC handlers in
 * main.ts, which dispatch onto this runtime.
 */
// All database services share a single SqlClient against cache.sqlite. Merging
// the layers before providing the driver ensures one sqlite-node connection
// covers them all — opening two connections to a WAL-mode file in the same
// process invites lock surprises (SQLITE_BUSY, lost PRAGMA writes) and doubles
// the memory footprint. `CacheDatabase` is included here precisely so the
// API-response cache no longer opens its own second `better-sqlite3` handle.
const cacheDbLayer = (filename: string): Layer.Layer<EGWParagraphDatabase | CacheDatabase> =>
  Layer.merge(EGWParagraphDatabase.layerCore, CacheDatabase.layerCore).pipe(
    Layer.provide(SqliteNode.layer({ filename })),
    Layer.orDie,
  );

const bibleDbLayer = (filename: string): Layer.Layer<BibleCorpus | BibleDatabase> =>
  Layer.merge(BibleCorpus.layer, BibleDatabase.layer).pipe(
    Layer.provide(SqliteNode.layer({ filename })),
    Layer.orDie,
  );

// Node-fs-backed token store. We don't pull in @effect/platform-node just for
// this — Electron main already uses node:fs for settings + tokens, so the
// JsonPort adapter keeps the runtime dep surface small.
const tokenStoreLayer = (tokenFile: string) =>
  EGWTokenStore.layerFromJsonPort({
    readJson: Effect.tryPromise({
      try: async () => {
        try {
          const text = await fs.readFile(tokenFile, 'utf-8');
          return Option.some(text);
        } catch (err) {
          if (err instanceof Error && 'code' in err && err.code === 'ENOENT') return Option.none();
          throw err;
        }
      },
      catch: (cause) =>
        new TokenIoError({
          message: `Failed to read EGW token file ${tokenFile}`,
          cause,
        }),
    }).pipe(Effect.orDie),
    writeJson: (json) =>
      Effect.tryPromise({
        try: async () => {
          await fs.mkdir(path.dirname(tokenFile), { recursive: true });
          const tmp = `${tokenFile}.tmp`;
          await fs.writeFile(tmp, json, 'utf-8');
          await fs.rename(tmp, tokenFile);
        },
        catch: (cause) =>
          new TokenIoError({
            message: `Failed to write EGW token file ${tokenFile}`,
            cause,
          }),
      }).pipe(Effect.orDie),
  });

const egwLayer = (tokenFile: string): Layer.Layer<EGWApiClient> =>
  EGWApiClient.Live.pipe(
    Layer.provide(
      EGWAuth.Live.pipe(
        Layer.provide(tokenStoreLayer(tokenFile)),
        Layer.provide(FetchHttpClient.layer),
      ),
    ),
    Layer.provide(FetchHttpClient.layer),
    Layer.orDie,
  );

export type MainRuntime = ManagedRuntime.ManagedRuntime<
  | EGWParagraphDatabase
  | BibleCorpus
  | BibleDatabase
  | CacheDatabase
  | EGWApiClient
  | BibleService
  | WritingsService
  | ProcedureRuntime
  | ReadingPreferencesRuntime,
  never
>;

export const makeRuntime = (
  cacheDbFile: string,
  bibleDbFile: string,
  tokenFile: string,
  userStateDbFile: string,
): MainRuntime => {
  const cache = cacheDbLayer(cacheDbFile);
  const bible = bibleDbLayer(bibleDbFile);
  const clientId = Schema.decodeSync(ClientId)('desktop-local');
  const procedures = layerDesktopProcedureDependencies({
    cacheDatabase: cache,
    bibleDatabase: bible,
    userStateDbFile,
    migrationSql: userStateMigrationSql,
    runtime: {
      clientId,
      generation: Schema.decodeSync(RuntimeGeneration)(crypto.randomUUID()),
      capabilities: ['external-links', 'file-import', 'file-export', 'window-controls'],
      nextMutationId: () => Schema.decodeSync(MutationId)(crypto.randomUUID()),
      nextCommitId: () => Schema.decodeSync(CommitId)(crypto.randomUUID()),
      now: () => Schema.decodeSync(Timestamp)(new Date().toISOString()),
    },
  });
  return ManagedRuntime.make(Layer.mergeAll(cache, bible, egwLayer(tokenFile), procedures));
};

export const runtimeRun = <A, E>(
  runtime: MainRuntime,
  effect: EffectNs.Effect<
    A,
    E,
    | EGWParagraphDatabase
    | BibleCorpus
    | BibleDatabase
    | CacheDatabase
    | EGWApiClient
    | BibleService
    | WritingsService
    | ProcedureRuntime
    | ReadingPreferencesRuntime
  >,
): Promise<A> => runtime.runPromise(effect);
