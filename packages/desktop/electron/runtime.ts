import { BibleXrefsDatabase } from '@bible/core/bible-xrefs-db';
import { EGWApiClient, EGWAuth, EGWTokenStore } from '@bible/core/egw';
import { EGWParagraphDatabase } from '@bible/core/egw-db';
import { KjvBibleDatabase } from '@bible/core/kjv-bible-db';
import * as SqliteNode from '@effect/sql-sqlite-node/SqliteClient';
import { Effect, Layer, ManagedRuntime, Option, Schema } from 'effect';
import type { Effect as EffectNs } from 'effect';
import { FetchHttpClient } from 'effect/unstable/http';
import { promises as fs } from 'node:fs';
import path from 'node:path';

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
// Both database services share a single SqlClient against cache.sqlite. Merging
// the layers before providing the driver ensures one sqlite-node connection
// covers both — opening two connections to a WAL-mode file in the same process
// invites lock surprises and doubles the memory footprint.
const dbLayer = (
  filename: string,
): Layer.Layer<EGWParagraphDatabase | KjvBibleDatabase | BibleXrefsDatabase> =>
  Layer.mergeAll(
    EGWParagraphDatabase.layerCore,
    KjvBibleDatabase.layerCore,
    BibleXrefsDatabase.layerCore,
  ).pipe(Layer.provide(SqliteNode.layer({ filename })), Layer.orDie);

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
        new TokenIoError({ message: `Failed to read EGW token file ${tokenFile}`, cause }),
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
          new TokenIoError({ message: `Failed to write EGW token file ${tokenFile}`, cause }),
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
  EGWParagraphDatabase | KjvBibleDatabase | BibleXrefsDatabase | EGWApiClient,
  never
>;

export const makeRuntime = (cacheDbFile: string, tokenFile: string): MainRuntime =>
  ManagedRuntime.make(Layer.mergeAll(dbLayer(cacheDbFile), egwLayer(tokenFile)));

export const runtimeRun = <A, E>(
  runtime: MainRuntime,
  effect: EffectNs.Effect<
    A,
    E,
    EGWParagraphDatabase | KjvBibleDatabase | BibleXrefsDatabase | EGWApiClient
  >,
): Promise<A> => runtime.runPromise(effect);
