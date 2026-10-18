/**
 * The source: the public S3 bucket `cvr-hymns`, read without credentials.
 *
 * The bucket refuses to list and answers 403 for a key it lacks, so only 200
 * means present, and 403 or 404 mean absent. Any other status (a 5xx, a 429)
 * is retried as transient and then fails: it never reads as absent.
 */
import { Effect, Layer, Option, Schedule } from 'effect';
import { HttpClient, HttpClientRequest } from 'effect/http';
import type { HttpClientError } from 'effect/http';

import type { SourceHead } from './stores.ts';
import { Source, StoreFailed } from './stores.ts';

const S3_ORIGIN = 'https://cvr-hymns.s3.amazonaws.com';

export const s3Url = (hymn: number) => `${S3_ORIGIN}/${hymn}.mp3`;

const failure = (reason: string) => StoreFailed.make({ store: 's3', reason });

const transport = (hymn: number) => (error: HttpClientError.HttpClientError) =>
  failure(`${hymn}.mp3: ${error.message}`);

/** What a HEAD's status and headers say of a hymn's key. */
export const headOf = (
  hymn: number,
  status: number,
  headers: Readonly<Record<string, string>>,
): Effect.Effect<Option.Option<SourceHead>, StoreFailed> => {
  if (status === 403 || status === 404) return Effect.succeedNone;
  if (status !== 200) return Effect.fail(failure(`${hymn}.mp3: HEAD answered ${status}`));
  const header = (name: string) =>
    Option.filter(Option.fromUndefinedOr(headers[name]), (value) => value !== '');
  const size = Option.filter(Option.map(header('content-length'), Number), Number.isSafeInteger);
  const etag = header('etag');
  if (Option.isNone(size) || Option.isNone(etag)) {
    return Effect.fail(failure(`${hymn}.mp3: HEAD answered no content-length or etag`));
  }
  const contentType = Option.getOrElse(header('content-type'), () => 'audio/mpeg');
  return Effect.succeedSome({ size: size.value, etag: etag.value, contentType });
};

export const SourceS3 = Layer.effect(
  Source,
  Effect.gen(function* () {
    const client = (yield* HttpClient.HttpClient).pipe(
      HttpClient.retryTransient({
        schedule: Schedule.exponential('250 millis'),
        times: 4,
      }),
    );
    const ok = client.pipe(HttpClient.filterStatusOk);

    const head = Effect.fn('Source.head')(function* (hymn: number) {
      const response = yield* client
        .execute(HttpClientRequest.head(s3Url(hymn)))
        .pipe(Effect.mapError(transport(hymn)));
      return yield* headOf(hymn, response.status, response.headers);
    });

    const get = Effect.fn('Source.get')(function* (hymn: number) {
      const response = yield* ok.get(s3Url(hymn)).pipe(Effect.mapError(transport(hymn)));
      const body = yield* response.arrayBuffer.pipe(Effect.mapError(transport(hymn)));
      return new Uint8Array(body);
    });

    return Source.of({ head, get });
  }),
);
