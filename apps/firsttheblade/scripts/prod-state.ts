/**
 * The prod state check: it stops a prod plan or deploy when Alchemy's state
 * for stage `prod` (`.alchemy/state/firsttheblade/prod`, git-ignored, local
 * to the main checkout) does not record the live site's resources. Without
 * that state Alchemy plans every resource as new: it makes a second D1 and
 * queue and binds the live Worker to them (`docs/lessons.md`
 * `prod-deploy-needs-prod-state`). The stack runs it on stage `prod`
 * (`prodStateGate`, in `alchemy.run.ts`); `bun run deploy` also runs it
 * first, so a refusal does not wait for `test:slow`.
 *
 *   bun scripts/prod-state.ts    # exits 1 with one line when the app's prod state is not here
 *
 * Alchemy's local state keeps one JSON file per resource, named by its
 * logical id, with the resource's type and, under `attr`, what the cloud
 * gave back. The check reads the Worker, the list's D1 and the film queue,
 * each by the name the live resource has.
 */
import { BunRuntime, BunServices } from '@effect/platform-bun';
import { dotAlchemyDirectory } from 'alchemy/AlchemyContext';
import { Stage } from 'alchemy/Stage';
import { Console, Data, Effect, FileSystem, Option, Path, Schema } from 'effect';

/** The prod stage's state folder, under the `.alchemy` folder Alchemy keeps its state in. */
const PROD_STATE = 'state/firsttheblade/prod';

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

class ProdStateMissing extends Data.TaggedError('ProdStateMissing')<{
  readonly reason: string;
}> {
  override get message() {
    return `prod-state: ${this.reason}. Copy the main checkout's apps/firsttheblade/.alchemy/${PROD_STATE} there, or deploy from the main checkout's apps/firsttheblade.`;
  }
}

/**
 * A live resource whose file records another resource: what it records,
 * what `LIVE` expects, and where to change `LIVE` when the resource was
 * replaced on purpose.
 */
const differs = (live: Live, found: string, expected: string) =>
  `${live.label} (${live.file} records ${found}, not ${expected}; if it was replaced on purpose, change LIVE in apps/firsttheblade/scripts/prod-state.ts)`;

/** What `live` lacks in the state folder `dir`, if anything. */
const lacking = Effect.fn('ProdState.lacking')(function* (dir: string, live: Live) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const text = yield* Effect.option(fs.readFileString(path.join(dir, live.file)));
  const recorded = Option.flatMap(text, decodeRecorded);
  if (Option.isNone(recorded)) {
    return Option.some(`${live.label} (${live.file} is missing or unreadable)`);
  }
  const { resourceType, attr } = recorded.value;
  if (resourceType !== live.resourceType) {
    return Option.some(differs(live, `a ${resourceType}`, `a ${live.resourceType}`));
  }
  const name = Schema.decodeUnknownOption(Schema.String)(attr[live.field]);
  if (Option.contains(name, live.name)) return Option.none();
  const found = Option.getOrElse(name, () => `no ${live.field}`);
  return Option.some(differs(live, found, live.name));
});

/** Fails with `ProdStateMissing` unless the prod state under the `.alchemy` folder `dotAlchemy` records every live resource. */
export const checkProdState = Effect.fn('ProdState.check')(function* (dotAlchemy: string) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const dir = path.resolve(dotAlchemy, PROD_STATE);
  const files = yield* Effect.orElseSucceed(fs.readDirectory(dir), () => []);
  if (files.length === 0) {
    return yield* new ProdStateMissing({ reason: `no prod Alchemy state at ${dir}` });
  }
  const missing = (yield* Effect.forEach(LIVE, (live) => lacking(dir, live))).flatMap((gap) =>
    Option.toArray(gap),
  );
  if (missing.length > 0) {
    return yield* new ProdStateMissing({
      reason: `the prod state at ${dir} does not record ${missing.join('; ')}`,
    });
  }
});

/**
 * The stack's check: `checkProdState` on stage `prod`, over the `.alchemy`
 * folder this run of Alchemy reads its state from; nothing on any other
 * stage. `alchemy.run.ts` runs it first, while Alchemy is still building the
 * stack and before it plans, so every prod plan and deploy runs it, whatever
 * command starts it.
 */
export const prodStateGate = Effect.fn('ProdState.gate')(function* () {
  if ((yield* Stage) !== 'prod') return;
  yield* checkProdState(yield* dotAlchemyDirectory);
});

if (import.meta.main)
  Effect.gen(function* () {
    const path = yield* Path.Path;
    yield* checkProdState(path.join(path.dirname(import.meta.dir), '.alchemy'));
  }).pipe(
    Effect.tapError((error) => Console.error(error.message)),
    Effect.provide(BunServices.layer),
    (program) => BunRuntime.runMain(program, { disableErrorReporting: true }),
  );
