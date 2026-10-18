/**
 * The target: the R2 bucket `cvr-hymns`, written through Cloudflare's REST
 * API with the credentials of the owner's Alchemy profile
 * (`Cloudflare.CloudflareApiLive()`, provided by `./copy.ts` on a real run
 * alone, so a dry run never reads the profile).
 *
 * Both calls are distilled operations, so each is encoded, decoded, classed
 * and retried by distilled's Cloudflare protocol and its default retry
 * policy. Listing is distilled's `listBucketObjects`, page by page. The
 * upload is an operation of its own, built with distilled's `API.make` on the
 * same route as its `uploadBucketObject`: that one escapes the whole key as
 * one path label (`audio%2Fsdah%2F1.mp3`), and R2 takes a key's slashes only
 * literally, so this one names the key as a greedy label (`{object_name+}`),
 * each segment escaped and the slashes kept.
 */
import * as CloudflareErrors from '@distilled.cloud/cloudflare/Errors';
import { CloudflareProtocol } from '@distilled.cloud/cloudflare/Protocol';
import * as r2 from '@distilled.cloud/cloudflare/r2';
import * as Retry from '@distilled.cloud/cloudflare/Retry';
import * as T from '@distilled.cloud/cloudflare/Traits';
import * as API from '@distilled.cloud/core/api';
import * as Cloudflare from 'alchemy/Cloudflare';
import { Effect, Layer, Option, Predicate, Schema, Stream } from 'effect';
import { HttpClientError } from 'effect/http';

import type { PutMetadata, TargetObject } from './stores.ts';
import { StoreFailed, Target } from './stores.ts';

const BUCKET = 'cvr-hymns';

/** How long one upload, or the whole listing, may take, retries included. */
const PUT_TIMEOUT = '3 minutes';
const LIST_TIMEOUT = '3 minutes';

/**
 * Cloudflare's authentication and permission codes, kept with their code:
 * distilled's global map would answer them as an `Unauthorized` or a
 * `Forbidden` that carries the message alone. A matched class is tagged
 * retryable by the same message rule (`isTransientAuthBlip` in distilled's
 * protocol), so a blip retries and a denial fails, as before.
 */
class CloudflareDenied extends T.applyErrorMatchers(
  Schema.TaggedError<CloudflareDenied>()('CloudflareDenied', {
    code: Schema.Finite,
    message: Schema.String,
  }),
  [{ code: 10000 }, { code: 10001 }],
) {}

const PutObjectRequest = Schema.Struct({
  accountId: Schema.String.pipe(T.Label('account_id')),
  bucketName: Schema.String.pipe(T.Label('bucket_name')),
  objectName: Schema.String.pipe(T.Label('object_name')),
  body: Schema.Uint8Array.pipe(T.HttpBody()),
  contentType: Schema.String.pipe(T.Header('Content-Type')),
  cacheControl: Schema.String.pipe(T.Header('Cache-Control')),
}).pipe(
  T.Http({
    method: 'PUT',
    uri: '/accounts/{account_id}/r2/buckets/{bucket_name}/objects/{object_name+}',
    code: 200,
    bodyMediaType: 'application/octet-stream',
  }),
);

/** The envelope's `result`: R2 gives the size as a string. */
const PutObjectResponse = Schema.Struct({
  etag: Schema.optional(Schema.NullOr(Schema.String)),
  size: Schema.optional(Schema.NullOr(Schema.String)),
});

const putObject = API.make(() => ({
  input: PutObjectRequest,
  output: PutObjectResponse,
  errors: [CloudflareDenied, r2.NoSuchBucket, CloudflareErrors.CloudflareRateLimited],
  protocol: CloudflareProtocol,
  retry: Retry.Retry,
}));

const failure = (reason: string) => StoreFailed.make({ store: 'r2', reason });

/**
 * An answer whose body is lost after its headers fails as `StoreFailed`.
 * Distilled reads each body with `Effect.orDie`, so a broken read arrives as
 * a defect that carries the `HttpClientError`. That key then fails alone and
 * the run goes on. Every other defect stays a defect.
 */
const bodyLost =
  (what: string) =>
  <A, E, R>(self: Effect.Effect<A, E, R>) =>
    Effect.catchDefect(self, (defect) => {
      if (!HttpClientError.isHttpClientError(defect)) return Effect.die(defect);
      return Effect.fail(failure(`${what}: the answer lost its body: ${defect.message}`));
    });

/** A failure as Cloudflare said it: its class, its code when it gave one, its message. */
const reasonOf = (error: { readonly message: string }) => {
  const tag = Option.liftPredicate(Reflect.get(error, '_tag'), Predicate.isString);
  const code = Option.liftPredicate(Reflect.get(error, 'code'), Predicate.isNumber);
  const head = [Option.getOrElse(tag, () => 'Error'), ...Option.toArray(code)].join(' ');
  return `${head}: ${error.message}`;
};

export const TargetR2 = Layer.effect(
  Target,
  Effect.gen(function* () {
    const { accountId } = yield* yield* Cloudflare.CloudflareEnvironment;
    const listObjects = yield* r2.listBucketObjects;
    const upload = yield* putObject;

    const list = Effect.fn('Target.list')(function* (prefix: string) {
      const objects = yield* listObjects
        .items({ accountId, bucketName: BUCKET, prefix, perPage: 1000 })
        .pipe(
          Stream.runCollect,
          Effect.mapError((error) => failure(`list ${prefix}: ${reasonOf(error)}`)),
          bodyLost(`list ${prefix}`),
          Effect.timeoutOrElse({
            duration: LIST_TIMEOUT,
            orElse: () =>
              Effect.fail(failure(`list ${prefix}: did not complete in ${LIST_TIMEOUT}`)),
          }),
        );
      const listed = new Map<string, TargetObject>();
      for (const object of objects) {
        const key = Option.fromNullishOr(object.key);
        if (Option.isNone(key)) continue;
        listed.set(key.value, {
          size: Option.getOrElse(Option.fromNullishOr(object.size), () => -1),
          etag: Option.getOrElse(Option.fromNullishOr(object.etag), () => ''),
        });
      }
      return listed;
    });

    const put = Effect.fn('Target.put')(function* (
      key: string,
      bytes: Uint8Array,
      metadata: PutMetadata,
    ) {
      const answer = yield* upload({
        accountId,
        bucketName: BUCKET,
        objectName: key,
        body: bytes,
        contentType: metadata.contentType,
        cacheControl: metadata.cacheControl,
      }).pipe(
        Effect.mapError((error) => failure(`put ${key}: ${reasonOf(error)}`)),
        bodyLost(`put ${key}`),
        Effect.timeoutOrElse({
          duration: PUT_TIMEOUT,
          orElse: () => Effect.fail(failure(`put ${key}: did not complete in ${PUT_TIMEOUT}`)),
        }),
      );
      const size = Option.fromNullishOr(answer.size).pipe(
        Option.map(Number),
        Option.filter(Number.isSafeInteger),
      );
      const etag = Option.fromNullishOr(answer.etag);
      if (Option.isNone(size) || Option.isNone(etag)) {
        return yield* failure(`put ${key}: the answer gave no size or etag`);
      }
      return { size: size.value, etag: etag.value };
    });

    return Target.of({ list, put });
  }),
);
