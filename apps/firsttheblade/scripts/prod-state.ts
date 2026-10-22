/**
 * The prod state check: `bun run plan` and `bun run deploy` run it before
 * anything else, and stop when this checkout's Alchemy state for stage
 * `prod` (`.alchemy/state/firsttheblade/prod`, git-ignored, local only) does
 * not record the live site's resources. Without that state Alchemy plans
 * every resource as new: it makes a second D1 and queue and binds the live
 * Worker to them (`docs/lessons.md` `prod-deploy-needs-prod-state`).
 *
 *   bun scripts/prod-state.ts    # exits 1 with one line when the prod state is not here
 *
 * Alchemy's local state keeps one JSON file per resource, named by its
 * logical id, with the resource's type and, under `attr`, what the cloud
 * gave back. The check reads the Worker, the list's D1 and the film queue,
 * each by the name the live resource has.
 */
import { BunRuntime, BunServices } from '@effect/platform-bun';
import { Console, Data, Effect, FileSystem, Option, Path, Schema } from 'effect';

/** The prod stage's state folder, from the app. */
export const PROD_STATE = '.alchemy/state/firsttheblade/prod';

/** A live resource as the prod state records it: its file, its type, and its name under `attr`. */
interface Live {
  readonly label: string;
  readonly file: string;
  readonly resourceType: string;
  readonly field: string;
  readonly name: string;
}

/** The resources the live site runs on. */
const LIVE: ReadonlyArray<Live> = [
  {
    label: 'the Site Worker',
    file: 'Site.json',
    resourceType: 'Cloudflare.Worker',
    field: 'workerName',
    name: 'firsttheblade',
  },
  {
    label: 'the Mail D1',
    file: 'Mail.json',
    resourceType: 'Cloudflare.D1Database',
    field: 'databaseName',
    name: 'firsttheblade-Mail-prod-kbdnjw67amvppcia',
  },
  {
    label: 'the FilmQueue queue',
    file: 'FilmQueue.json',
    resourceType: 'Cloudflare.Queues.Queue',
    field: 'queueName',
    name: 'firsttheblade-filmqueue-prod-ybriolxcgdeqcqtq',
  },
];

/** The part of a resource's state file the check reads. */
const Recorded = Schema.Struct({
  resourceType: Schema.String,
  attr: Schema.Record(Schema.String, Schema.Unknown),
});

const decodeRecorded = Schema.decodeOption(Schema.fromJsonString(Recorded));

export class ProdStateMissing extends Data.TaggedError('ProdStateMissing')<{
  readonly reason: string;
}> {
  override get message() {
    return `prod-state: ${this.reason}. Copy the main checkout's apps/firsttheblade/${PROD_STATE} into this checkout, or run this from the main checkout.`;
  }
}

/** What `live` lacks in the state folder `dir`, if anything. */
const lacking = Effect.fn('ProdState.lacking')(function* (dir: string, live: Live) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const text = yield* Effect.option(fs.readFileString(path.join(dir, live.file)));
  const recorded = Option.flatMap(text, decodeRecorded);
  if (Option.isNone(recorded)) return Option.some(`${live.label} (${live.file})`);
  const { resourceType, attr } = recorded.value;
  if (resourceType === live.resourceType && attr[live.field] === live.name) return Option.none();
  return Option.some(`${live.label} ${live.name}`);
});

/** Fails with `ProdStateMissing` unless the state folder of the app at `app` records every live resource. */
export const checkProdState = Effect.fn('ProdState.check')(function* (app: string) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const dir = path.join(app, PROD_STATE);
  const files = yield* Effect.orElseSucceed(fs.readDirectory(dir), () => []);
  if (files.length === 0) {
    return yield* new ProdStateMissing({ reason: `no prod Alchemy state at ${PROD_STATE}` });
  }
  const missing = (yield* Effect.forEach(LIVE, (live) => lacking(dir, live))).flatMap((gap) =>
    Option.toArray(gap),
  );
  if (missing.length > 0) {
    return yield* new ProdStateMissing({
      reason: `the prod state at ${PROD_STATE} does not record ${missing.join(', ')}`,
    });
  }
});

if (import.meta.main)
  Effect.gen(function* () {
    const path = yield* Path.Path;
    yield* checkProdState(path.dirname(import.meta.dir));
  }).pipe(
    Effect.tapError((error) => Console.error(error.message)),
    Effect.provide(BunServices.layer),
    (program) => BunRuntime.runMain(program, { disableErrorReporting: true }),
  );
