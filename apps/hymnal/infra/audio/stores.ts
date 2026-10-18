/**
 * The copy job's three stores and its hashes, each a service, so the job
 * (`./job.ts`) runs the same against the real adapters and the tests' fakes.
 *
 * - `Source`: the S3 bucket the old app plays from (`./s3.ts`).
 * - `Fill`: the owner's `cevr/sda-hymns` repo at a pinned commit, for a key
 *   S3 never had (`./github.ts`).
 * - `Target`: the R2 bucket (`./r2.ts`).
 * - `Hash`: MD5 and git's blob SHA-1 (`./hash-bun.ts`).
 *
 * Every store answers what it holds and checks nothing: the job decides
 * whether bytes match what their store promised.
 */
import { Context, Schema } from 'effect';
import type { Effect, Option } from 'effect';

/** What S3 says of a recording: its size, its ETag (quotes kept) and type. */
export interface SourceHead {
  readonly size: number;
  readonly etag: string;
  readonly contentType: string;
}

/** A recording in the fill repo's tree: its path, size and git blob SHA-1. */
export interface FillEntry {
  readonly hymn: number;
  readonly path: string;
  readonly size: number;
  readonly sha: string;
}

/** What R2 holds at a key: its size and its ETag. */
export interface TargetObject {
  readonly size: number;
  readonly etag: string;
}

/** The HTTP metadata an upload stores with its object. */
export interface PutMetadata {
  readonly contentType: string;
  readonly cacheControl: string;
}

/** A store that could not answer: a transport error, a refusal, a bad reply. */
export class StoreFailed extends Schema.TaggedError<StoreFailed>()('StoreFailed', {
  store: Schema.Literals(['s3', 'github', 'r2']),
  reason: Schema.String,
}) {
  override get message() {
    return `${this.store}: ${this.reason}`;
  }
}

export class Source extends Context.Service<
  Source,
  {
    /** `None` when S3 answers 403 or 404: a missing key is refused, not 404. */
    readonly head: (hymn: number) => Effect.Effect<Option.Option<SourceHead>, StoreFailed>;
    readonly get: (hymn: number) => Effect.Effect<Uint8Array, StoreFailed>;
  }
>()('@bible/hymnal-app/infra/audio/Source') {}

export class Fill extends Context.Service<
  Fill,
  {
    /** The pinned tree's recordings, by hymn number: one call. */
    readonly tree: Effect.Effect<ReadonlyMap<number, FillEntry>, StoreFailed>;
    readonly get: (entry: FillEntry) => Effect.Effect<Uint8Array, StoreFailed>;
  }
>()('@bible/hymnal-app/infra/audio/Fill') {}

export class Target extends Context.Service<
  Target,
  {
    /** Every object under `prefix`, by key. */
    readonly list: (
      prefix: string,
    ) => Effect.Effect<ReadonlyMap<string, TargetObject>, StoreFailed>;
    /** The object as R2 stored it. */
    readonly put: (
      key: string,
      bytes: Uint8Array,
      metadata: PutMetadata,
    ) => Effect.Effect<TargetObject, StoreFailed>;
  }
>()('@bible/hymnal-app/infra/audio/Target') {}

export class Hash extends Context.Service<
  Hash,
  {
    /** The MD5 digest, lowercase hex: what a single-part ETag holds. */
    readonly md5: (bytes: Uint8Array) => string;
    /** Git's blob id, lowercase hex: `sha1("blob <length>\0" + bytes)`. */
    readonly gitBlobSha1: (bytes: Uint8Array) => string;
  }
>()('@bible/hymnal-app/infra/audio/Hash') {}
