/** The Topics semantic verifier (§3.5), written once against a two-method
 *  reader rather than twice against two SQLite drivers.
 *
 *  The native host runs `better-sqlite3` (what Electron loads) and the browser
 *  host runs `wa-sqlite`; nothing in the *rules* depends on which. Splitting the
 *  driver out means the gate a candidate must pass is one function with one
 *  definition, and the adapters carry only the part that genuinely differs — how
 *  to run a statement. Two implementations that agree today are not a gate; one
 *  implementation is.
 *
 *  The rules are: SQLite integrity, a schema major this build can read, and the
 *  two positive counts the spec requires — pages, and the phrase dictionary that
 *  makes them reachable. It returns the page count the Activation reports as
 *  `installed`.
 *
 *  An empty artifact is honest output from the compiler when every authored core
 *  is still `status: draft`, but honest is not the same as installable:
 *  activating it would swap a working generation out for a file that can never
 *  answer a lookup. Refusing it is exactly this verifier's job — the compiler
 *  says what it built, the verifier says what may be installed. */

import { Effect, Option } from 'effect';

import { readTopicsSchemaMajor, TOPICS_SCHEMA_MAJOR } from './file-artifact.js';

/** What a driver must be able to do for the verifier to run. Three reads, all
 *  of them the driver's own concern to execute and the verifier's to interpret.
 *
 *  Every method fails rather than throwing: a missing table is a verification
 *  failure like any other — the artifact is not the artifact it claims to be —
 *  and the adapter is responsible for turning its driver's exception into that
 *  failure before the verifier sees it. */
export interface TopicsArtifactReader {
  /** The `integrity_check` pragma's single value. */
  readonly integrity: Effect.Effect<string, unknown>;
  /** `meta.value` for a key, or `None` when no such row exists. */
  readonly meta: (key: string) => Effect.Effect<Option.Option<string>, unknown>;
  /** `SELECT COUNT(*)` over one table. Fails when the table is absent. */
  readonly count: (table: string) => Effect.Effect<number, unknown>;
}

/** Every way the Topics verifier refuses a candidate, as the exact message both
 *  adapters report. Held here rather than written out at each call site so the
 *  native and browser gates cannot drift apart in their wording — a difference
 *  in what an operator is told is a difference in the gate. */
export const TOPICS_VERIFY_MESSAGES = {
  integrity: 'SQLite integrity check failed',
  unreadableSchemaMajor: 'Topics Artifact has no readable schema_major',
  schemaTooNew: (major: number): string =>
    `Topics Artifact schema_major ${String(major)} exceeds ${String(TOPICS_SCHEMA_MAJOR)}`,
  noPages: 'Topics Artifact has no pages',
  noAliases: 'Topics Artifact has no phrase dictionary',
} satisfies Record<string, string | ((major: number) => string)>;

export const verifyTopicsArtifact = Effect.fn('TopicsVerifier.verify')(function* (
  reader: TopicsArtifactReader,
) {
  const integrity = yield* reader.integrity;
  if (integrity !== 'ok') {
    return yield* Effect.fail(TOPICS_VERIFY_MESSAGES.integrity);
  }
  const stored = yield* reader.meta('schema_major');
  const parsed = Option.flatMap(stored, readTopicsSchemaMajor);
  if (Option.isNone(parsed)) {
    return yield* Effect.fail(TOPICS_VERIFY_MESSAGES.unreadableSchemaMajor);
  }
  const major = parsed.value;
  if (major > TOPICS_SCHEMA_MAJOR) {
    return yield* Effect.fail(TOPICS_VERIFY_MESSAGES.schemaTooNew(major));
  }
  const topics = yield* reader.count('topics');
  const aliases = yield* reader.count('topic_aliases');
  // These two counts are discarded; reading them at all is the point, because a
  // missing table makes the read fail and fails the candidate.
  yield* reader.count('topic_edges');
  yield* reader.count('topic_catalog_keys');
  if (topics === 0) {
    return yield* Effect.fail(TOPICS_VERIFY_MESSAGES.noPages);
  }
  if (aliases === 0) {
    return yield* Effect.fail(TOPICS_VERIFY_MESSAGES.noAliases);
  }
  return topics;
});
