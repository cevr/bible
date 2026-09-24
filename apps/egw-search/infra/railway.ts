/**
 * The Railway resources EGW Search runs on, declared once for both stacks.
 *
 * Everything here already exists in production except the `egw-celld` bucket.
 * Two rules protect it:
 *
 * - **Adopt, never create.** The project and the service have names that do
 *   not match Alchemy's generated-name pattern, so their `read` returns them as
 *   `Unowned` (`alchemy/src/Railway/Project.ts:376`,
 *   `ServiceProvider.ts:1008-1010`). `adopt(true)` takes them over without the
 *   `--adopt` flag and re-adopts them if the local state is ever lost. The
 *   custom domain has no ownership check and is adopted silently.
 * - **Retain, never delete.** `retain()` makes the engine skip the provider's
 *   `delete` when a resource is destroyed, removed from the stack, or replaced
 *   (`alchemy/src/RemovalPolicy.ts`, `Plan.ts:2040`, `Apply.ts:1199,2168`).
 *   `alchemy destroy` can only make Alchemy forget these resources.
 *
 * **The `/data` volume is deliberately not declared.** `Railway.Volume` has no
 * `name` prop. Its `read` looks for a generated name that carries a random
 * instance suffix (`Volume.ts:707,727`, `PhysicalName.ts:77-81`), so it can
 * never find `egw-search-volume`. Declaring it would plan a *create*, and
 * reconcile would then rename the existing volume (`Volume.ts:877`). Left
 * undeclared, no resource in these stacks can reach `deleteVolume`. The
 * service keeps the volume attached because the service provider only
 * attaches volumes that are bound to it and never detaches others
 * (`ServiceProvider.ts:1258-1272,1375`).
 */
import * as Alchemy from 'alchemy';
// Subpath imports: the `alchemy/Railway` index re-exports `Website`, whose
// framework adapters statically import the optional peer
// `@alchemy.run/frontend-frameworks`, which this app does not install.
import { Bucket } from 'alchemy/Railway/Bucket';
import { Project } from 'alchemy/Railway/Project';

/** Railway ids observed with read-only `railway` commands on 2026-09-23. */
export const Ids = {
  workspace: 'e7bf0e51-695c-4c12-aea3-d46949594a0f',
  project: 'a341bf13-b7ec-4522-9e74-04db9bb045c5',
  /** `production`, the project's primary environment. */
  environment: 'e53ce17e-9679-4dea-bd26-44e31a4815c9',
  service: 'c65364b4-fa55-4cbc-b880-1b9156feb96c',
  /** `egw-search-volume` at `/data`. Managed by Railway, not by these stacks. */
  volume: '18a9a819-f733-4af3-b783-434fd71e01f4',
};

/** The port `server/main.ts` listens on and `egw.cvr.im` targets. */
export const PORT = 3101;

/**
 * `bible-studies`, found by name in the pinned workspace.
 *
 * `workspaceId` is pinned to the value the project already has. A different
 * value is the one prop change that replaces a project (`Project.ts:348-353`).
 * The `studies` service lives in this project too. No stack here declares it,
 * so no stack can change it.
 */
export const BibleStudies = Project('BibleStudies', {
  name: 'bible-studies',
  workspaceId: Ids.workspace,
}).pipe(Alchemy.AdoptPolicy.adopt(true), Alchemy.RemovalPolicy.retain());

/**
 * The new S3-compatible bucket.
 *
 * `iad` keeps it in US East beside the service (`us-east4`). The region cannot
 * change after create, and a change would replace the bucket (`Bucket.ts:612-618`).
 * It is retained like the adopted resources because it will hold production
 * data.
 */
export const EgwCelld = Bucket('EgwCelld', {
  project: BibleStudies,
  name: 'egw-celld',
  region: 'iad',
}).pipe(Alchemy.AdoptPolicy.adopt(true), Alchemy.RemovalPolicy.retain());

/** What a deploy prints about the bucket. The two keys stay `Redacted`, and
 *  `util.inspect` renders them as `<redacted>`. */
export const bucketOutputs = (bucket: Bucket) => ({
  name: bucket.name,
  s3BucketName: bucket.s3BucketName,
  endpoint: bucket.endpoint,
  region: bucket.s3Region,
  urlStyle: bucket.urlStyle,
  accessKeyId: bucket.accessKeyId,
  secretAccessKey: bucket.secretAccessKey,
});
