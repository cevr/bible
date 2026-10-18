/**
 * The target: the R2 bucket `cvr-hymns`, written through Cloudflare's REST
 * API with the credentials of the owner's Alchemy profile
 * (`Cloudflare.CloudflareApiLive()`, provided by `./copy.ts` on a real run
 * alone, so a dry run never reads the profile).
 *
 * Listing goes through distilled's `listBucketObjects`, page by page. The
 * upload is a PUT of its own: distilled's `uploadBucketObject` escapes the
 * whole key as one path label, so `audio/sdah/1.mp3` would travel as
 * `audio%2Fsdah%2F1.mp3`, and R2 takes a key's slashes only literally.
 */
import * as CloudflareCredentials from '@distilled.cloud/cloudflare/Credentials';
import * as r2 from '@distilled.cloud/cloudflare/r2';
import * as Cloudflare from 'alchemy/Cloudflare';
import { Effect, Layer, Option, Schedule, Schema, Stream } from 'effect';
import { HttpClient, HttpClientRequest, HttpClientResponse } from 'effect/http';

import type { PutMetadata, TargetObject } from './stores.ts';
import { StoreFailed, Target } from './stores.ts';

const BUCKET = 'cvr-hymns';

/** An object's REST address: the key's segments escaped, its slashes kept. */
export const objectUrl = (apiBase: string, accountId: string, key: string) =>
  `${apiBase}/accounts/${encodeURIComponent(accountId)}/r2/buckets/${BUCKET}/objects/${key.split('/').map(encodeURIComponent).join('/')}`;

/** Cloudflare's envelope around an upload's answer; R2 gives the size as a string. */
const Uploaded = Schema.Struct({
  result: Schema.Struct({
    etag: Schema.String,
    size: Schema.Union([Schema.Finite, Schema.FiniteFromString]),
  }),
});

const failure = (reason: string) => StoreFailed.make({ store: 'r2', reason });

const reasonOf = (error: { readonly message: string }) => error.message;

export const TargetR2 = Layer.effect(
  Target,
  Effect.gen(function* () {
    const { accountId } = yield* yield* Cloudflare.CloudflareEnvironment;
    const credentials = yield* CloudflareCredentials.Credentials;
    const listObjects = yield* r2.listBucketObjects;
    const client = (yield* HttpClient.HttpClient).pipe(
      HttpClient.filterStatusOk,
      HttpClient.retryTransient({ schedule: Schedule.exponential('500 millis'), times: 4 }),
    );

    const list = Effect.fn('Target.list')(function* (prefix: string) {
      const objects = yield* listObjects
        .items({ accountId, bucketName: BUCKET, prefix, perPage: 1000 })
        .pipe(
          Stream.runCollect,
          Effect.mapError((error) => failure(`list ${prefix}: ${reasonOf(error)}`)),
        );
      const listed = new Map<string, TargetObject>();
      for (const object of objects) {
        const key = Option.fromNullishOr(object.key);
        if (Option.isNone(key)) continue;
        listed.set(key.value, { size: object.size ?? -1, etag: object.etag ?? '' });
      }
      return listed;
    });

    const put = Effect.fn('Target.put')(function* (
      key: string,
      bytes: Uint8Array,
      metadata: PutMetadata,
    ) {
      const resolved = yield* credentials.pipe(
        Effect.mapError((error) => failure(`credentials: ${reasonOf(error)}`)),
      );
      const request = HttpClientRequest.put(objectUrl(resolved.apiBaseUrl, accountId, key)).pipe(
        HttpClientRequest.setHeaders(CloudflareCredentials.formatHeaders(resolved)),
        HttpClientRequest.setHeader('cache-control', metadata.cacheControl),
        HttpClientRequest.bodyUint8Array(bytes, metadata.contentType),
      );
      const answer = yield* client.execute(request).pipe(
        Effect.flatMap(HttpClientResponse.schemaBodyJson(Uploaded)),
        Effect.mapError((error) => failure(`put ${key}: ${reasonOf(error)}`)),
      );
      return { size: answer.result.size, etag: answer.result.etag };
    });

    return Target.of({ list, put });
  }),
);
