/**
 * `bun run audio:upload --set DIR [--dry-run]`: a rendered set of hymn
 * recordings (`packages/hymnal/scripts/render/`) into the R2 bucket, under
 * `audio/<set>/sdah/<n>.mp3`, beside the copied recordings.
 *
 * 1. Read the set's `manifest.json` and refuse it unless it is the set the
 *    app plays and holds every hymn 1 to 695 once, each passed
 *    (`./upload-plan.ts`).
 * 2. Read every MP3 of the set and refuse the set if any is missing or its
 *    sha256 or MD5 is not the manifest's: nothing is uploaded from a set that
 *    does not match its manifest.
 * 3. List the set's prefix in R2 once (a dry run lists nothing and never
 *    touches R2 or the credentials).
 * 4. Plan each hymn: keep, upload or conflict. A conflict is a key R2 holds
 *    with other bytes; it is never replaced, and the run says to bump the set.
 * 5. Upload, 4 at a time, as `audio/mpeg` with a year's `immutable` cache;
 *    R2's answer must carry the manifest's MD5 and size.
 * 6. List the prefix again and check every hymn.
 *
 * A failed hymn never stops the others; the run fails at the end unless
 * every hymn is verified. The last line sums it:
 * `audio-upload <run|dry-run> set=<set> kept K uploaded U conflict C failed F verified V/695`.
 *
 * A real run writes with the owner's Alchemy Cloudflare profile, as
 * `./copy.ts` does.
 */
import * as BunRuntime from '@effect/platform-bun/BunRuntime';
import * as BunServices from '@effect/platform-bun/BunServices';
import { ManifestJson, type RecordingManifest } from '@bible/hymnal/recording-manifest';
import { AuthProviders } from 'alchemy/Auth';
import * as Cloudflare from 'alchemy/Cloudflare';
import { Console, Data, Effect, FileSystem, Layer, Option, Path, Schema } from 'effect';
import { Command } from 'effect/cli';
import { FetchHttpClient } from 'effect/http';

import { audioUploadCommand } from './command.ts';
import { HashBun } from './hash-bun.ts';
import { SDAH_HYMNS, holds, unquote } from './plan.ts';
import { TargetR2 } from './r2.ts';
import type { TargetObject } from './stores.ts';
import { Hash, Target } from './stores.ts';
import {
  SET_CACHE_CONTROL,
  UploadItem,
  manifestRefusals,
  planUpload,
  setPrefix,
} from './upload-plan.ts';

/** The set could not be uploaded at all: its manifest or its files refused, with why. */
export class UploadRefused extends Schema.TaggedError<UploadRefused>()('UploadRefused', {
  reasons: Schema.Array(Schema.String),
}) {
  override get message() {
    return `audio upload refused:\n  ${this.reasons.join('\n  ')}`;
  }
}

/** The run ended with a hymn failed, in conflict or not verified. */
export class UploadIncomplete extends Schema.TaggedError<UploadIncomplete>()('UploadIncomplete', {
  failed: Schema.Finite,
  conflict: Schema.Finite,
  verified: Schema.Finite,
}) {
  override get message() {
    return `audio upload incomplete: failed=${this.failed} conflict=${this.conflict} verified=${this.verified}/${SDAH_HYMNS.length}; run it again to resume, and for a conflict bump the set (warm-2)`;
  }
}

type Outcome = Data.TaggedEnum<{
  Kept: { readonly hymn: number };
  Uploaded: { readonly hymn: number };
  Conflict: { readonly hymn: number };
  Failed: { readonly hymn: number };
}>;
const Outcome = Data.taggedEnum<Outcome>();

const sha256Hex = (bytes: Uint8Array) => {
  const hasher = new Bun.CryptoHasher('sha256');
  hasher.update(bytes);
  return hasher.digest('hex');
};

/** The set's manifest, refused unless it reads and can be uploaded. */
const readManifest = (dir: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const file = path.join(dir, 'manifest.json');
    const text = yield* fs
      .readFileString(file)
      .pipe(Effect.mapError((e) => UploadRefused.make({ reasons: [`${file}: ${e.message}`] })));
    const manifest = yield* Schema.decodeEffect(ManifestJson)(text).pipe(
      Effect.mapError((e) => UploadRefused.make({ reasons: [`${file}: ${e.message}`] })),
    );
    const reasons = manifestRefusals(manifest);
    if (reasons.length > 0) return yield* UploadRefused.make({ reasons });
    return manifest;
  });

/** A hymn's MP3 as the set holds it, or why it is not the manifest's. */
const readHymn = (dir: string, hymn: RecordingManifest['hymns'][number]) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const hash = yield* Hash;
    const file = path.join(dir, hymn.file);
    const bytes = yield* fs
      .readFile(file)
      .pipe(Effect.mapError((e) => `${hymn.file}: ${e.message}`));
    const sha = sha256Hex(bytes);
    if (sha !== hymn.sha256)
      return yield* Effect.fail(`${hymn.file}: sha256 ${sha}, manifest ${hymn.sha256}`);
    const md5 = hash.md5(bytes);
    if (md5 !== hymn.md5 || bytes.byteLength !== hymn.bytes)
      return yield* Effect.fail(
        `${hymn.file}: md5 ${md5} size ${bytes.byteLength}, manifest ${hymn.md5} size ${hymn.bytes}`,
      );
    return bytes;
  });

/** Every MP3 of the set read once and held to the manifest; the set is refused on any miss. */
const checkFiles = (dir: string, manifest: RecordingManifest) =>
  Effect.gen(function* () {
    const misses = yield* Effect.forEach(
      manifest.hymns,
      (hymn) =>
        readHymn(dir, hymn).pipe(
          Effect.as(Option.none<string>()),
          Effect.catch((reason) => Effect.succeedSome(reason)),
        ),
      { concurrency: 4 },
    );
    const reasons = misses.flatMap((miss) => Option.toArray(miss));
    if (reasons.length > 0) return yield* UploadRefused.make({ reasons });
  });

const failed = (hymn: number, reason: string) =>
  Console.log(`failed ${hymn} ${reason.replaceAll('\n', ' ')}`).pipe(
    Effect.as(Outcome.Failed({ hymn })),
  );

/** Upload one hymn and check R2 stored the manifest's MD5 and size. */
const put = (dir: string, item: Extract<UploadItem, { readonly _tag: 'Upload' }>) =>
  Effect.gen(function* () {
    const target = yield* Target;
    const { hymn, key } = item;
    const bytes = yield* readHymn(dir, hymn);
    const stored = yield* target
      .put(key, bytes, { contentType: 'audio/mpeg', cacheControl: SET_CACHE_CONTROL })
      .pipe(Effect.mapError((e) => e.message));
    if (!holds(stored, hymn.bytes, hymn.md5))
      return yield* Effect.fail(
        `r2 stored etag ${unquote(stored.etag)} size ${stored.size}, expected ${hymn.md5} size ${hymn.bytes}`,
      );
    yield* Console.log(`upload ${hymn.hymn} ${hymn.bytes}`);
    return Outcome.Uploaded({ hymn: hymn.hymn });
  }).pipe(Effect.catch((reason) => failed(item.hymn.hymn, reason)));

const act = (dir: string) => (item: UploadItem) =>
  UploadItem.$match(item, {
    Keep: ({ hymn }) => Effect.succeed(Outcome.Kept({ hymn: hymn.hymn })),
    Upload: (upload) => put(dir, upload),
    Conflict: ({ hymn, key, held }) =>
      Console.log(
        `conflict ${hymn.hymn} r2 holds ${key} as etag ${unquote(held.etag)} size ${held.size}, the set has md5 ${hymn.md5} size ${hymn.bytes}: bump the set to warm-2`,
      ).pipe(Effect.as(Outcome.Conflict({ hymn: hymn.hymn }))),
  });

const count = (outcomes: ReadonlyArray<Outcome>, tag: Outcome['_tag']) =>
  outcomes.filter((outcome) => outcome._tag === tag).length;

/** The hymns R2 holds as the manifest has them: the run's last check. */
const verify = (manifest: RecordingManifest) =>
  Effect.gen(function* () {
    const target = yield* Target;
    const listed = yield* target
      .list(setPrefix(manifest.set))
      .pipe(
        Effect.catchTag('StoreFailed', (error) =>
          Console.log(`failed verify ${error.message}`).pipe(
            Effect.as(new Map<string, TargetObject>()),
          ),
        ),
      );
    return planUpload(manifest, listed).filter(UploadItem.$is('Keep')).length;
  });

const summary = (
  mode: 'run' | 'dry-run',
  set: string,
  n: { kept: number; uploaded: number; conflict: number; failed: number; verified: number },
) =>
  Console.log(
    `audio-upload ${mode} set=${set} kept ${n.kept} uploaded ${n.uploaded} conflict ${n.conflict} failed ${n.failed} verified ${n.verified}/${SDAH_HYMNS.length}`,
  );

/** Read and check the set, R2 never: what a run would upload. */
export const dryRun = (set: string) =>
  Effect.gen(function* () {
    const dir = (yield* Path.Path).resolve(set);
    const manifest = yield* readManifest(dir);
    yield* checkFiles(dir, manifest);
    const bytes = manifest.hymns.reduce((total, h) => total + h.bytes, 0);
    yield* Console.log(
      `would upload ${manifest.hymns.length} hymns, ${bytes} bytes, unless R2 holds them`,
    );
    yield* summary('dry-run', manifest.set, {
      kept: 0,
      uploaded: 0,
      conflict: 0,
      failed: 0,
      verified: 0,
    });
  });

/** Upload every hymn of the set R2 lacks, then check R2 holds them all. */
export const run = (set: string) =>
  Effect.gen(function* () {
    const dir = (yield* Path.Path).resolve(set);
    const manifest = yield* readManifest(dir);
    yield* checkFiles(dir, manifest);
    const target = yield* Target;
    const listed = yield* target.list(setPrefix(manifest.set));
    const outcomes = yield* Effect.forEach(planUpload(manifest, listed), act(dir), {
      concurrency: 4,
    });
    const verified = yield* verify(manifest);
    const n = {
      kept: count(outcomes, 'Kept'),
      uploaded: count(outcomes, 'Uploaded'),
      conflict: count(outcomes, 'Conflict'),
      failed: count(outcomes, 'Failed'),
      verified,
    };
    yield* summary('run', manifest.set, n);
    if (verified !== SDAH_HYMNS.length || n.conflict + n.failed > 0)
      return yield* UploadIncomplete.make({
        failed: n.failed,
        conflict: n.conflict,
        verified,
      });
  });

/** R2 behind the owner's profile, built only for a real run (as `./copy.ts` builds it). */
const Writes = TargetR2.pipe(
  Layer.provide(Cloudflare.CloudflareApiLive()),
  Layer.provide(Layer.succeed(AuthProviders, AuthProviders.of({}))),
  Layer.provide(FetchHttpClient.layer),
);

const audioUpload = audioUploadCommand.pipe(
  Command.withHandler(({ set, dryRun: dry }) => {
    if (dry) return dryRun(set).pipe(Effect.provide(HashBun));
    return run(set).pipe(Effect.provide(Layer.merge(HashBun, Writes)));
  }),
);

if (import.meta.main)
  Command.run(audioUpload, { version: '1.0.0' }).pipe(
    Effect.provide(BunServices.layer),
    BunRuntime.runMain,
  );
