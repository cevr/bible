/**
 * `bun run audio:copy [--dry-run]`: copy the hymn recordings from S3 into the
 * R2 bucket (`./job.ts`).
 *
 * A dry run reads only the public sources (S3's HEADs, the GitHub tree, a
 * fill's bytes) and builds no Cloudflare layer, so it needs no credentials.
 * A real run writes with the owner's Alchemy Cloudflare profile, which must
 * allow R2 object writes.
 */
import * as BunRuntime from '@effect/platform-bun/BunRuntime';
import * as BunServices from '@effect/platform-bun/BunServices';
import { AuthProviders } from 'alchemy/Auth';
import * as Cloudflare from 'alchemy/Cloudflare';
import { Effect, Layer } from 'effect';
import { Command } from 'effect/cli';
import { FetchHttpClient } from 'effect/http';

import { audioCopyCommand } from './command.ts';
import { FillGitHub } from './github.ts';
import { HashBun } from './hash-bun.ts';
import { dryRun, run } from './job.ts';
import { TargetR2 } from './r2.ts';
import { SourceS3 } from './s3.ts';

/** What every run reads: S3, the GitHub fill, the hashes. */
const Sources = Layer.mergeAll(SourceS3, FillGitHub, HashBun).pipe(
  Layer.provide(FetchHttpClient.layer),
);

/**
 * R2, behind the owner's profile: built only for a real run. The empty
 * `AuthProviders` registry is the one the Cloudflare auth layer registers
 * into, as the Alchemy CLI starts it.
 */
const Writes = TargetR2.pipe(
  Layer.provide(Cloudflare.CloudflareApiLive()),
  Layer.provide(Layer.succeed(AuthProviders, AuthProviders.of({}))),
  Layer.provide(FetchHttpClient.layer),
);

const audioCopy = audioCopyCommand.pipe(
  Command.withHandler(({ dryRun: dry }) => {
    if (dry) return dryRun.pipe(Effect.provide(Sources));
    return run.pipe(Effect.provide(Layer.merge(Sources, Writes)));
  }),
);

Command.run(audioCopy, { version: '1.0.0' }).pipe(
  Effect.provide(BunServices.layer),
  BunRuntime.runMain,
);
