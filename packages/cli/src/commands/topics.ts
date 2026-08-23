/** §3.6's two operator commands.
 *
 * `bible topics status [--json]` reports what is installed, what the manifest
 * offers, and the decision — with **no mutation of any kind**. That is the
 * whole contract: an operator asking what state a machine is in must not change
 * the state by asking. `ContentUpdate.status` reads the installer's activated
 * generation rather than running the install pipeline, which is what makes the
 * guarantee structural rather than a promise in this docstring.
 *
 * `bible topics update [--json]` runs the same decision and, only on an offer,
 * installs through the File Corpus lifecycle. A digest or size mismatch leaves
 * the installed generation active and is reported as an update that activated
 * nothing — not as an error the caller has to catch to learn that its working
 * content is still working.
 *
 * The `--json` payloads are produced by **the core schemas themselves**
 * (`ContentStatusJson`, `ContentUpdateJson`), not by a hand-written projection.
 * `v1.content.status` and `v1.content.update` encode the same schemas, so the
 * two seams cannot disagree, and a field added to the model reaches both at
 * once instead of silently missing from one.
 */

import {
  ContentStatusJson,
  ContentUpdate,
  ContentUpdateJson,
  type ContentDecision,
  type ContentStatus,
} from '@bible/core/content-update';
import { Console, Effect, Option, Schema } from 'effect';
import { Command, Flag } from 'effect/unstable/cli';

import { contentService } from './topics-layer.js';

/** The two core encoders. Nothing below names a field of a status: the schema
 *  is the wire contract, so the CLI's job is to run it — the same encoder the
 *  RPC handler runs, which is what `test/commands/topics.test.ts` checks by
 *  comparing bytes. */
const encodeStatus = Schema.encodeEffect(Schema.fromJsonString(ContentStatusJson, { space: 2 }));
const encodeUpdate = Schema.encodeEffect(Schema.fromJsonString(ContentUpdateJson, { space: 2 }));

const json = Flag.boolean('json').pipe(
  Flag.withDescription('Output the raw JSON payload'),
  Flag.withDefault(false),
);

/** One human-readable line per decision, exhaustive over the union.
 *
 *  A `switch` over `_tag` rather than a lookup keyed by string: adding a
 *  decision to §3.6 is then a compile error here until the operator has been
 *  told what to do about it. */
const describeDecision = (decision: ContentDecision): string => {
  switch (decision._tag) {
    case 'offer':
      return `update available: ${String(decision.entry.revision)} (${String(decision.entry.size)} bytes)`;
    case 'up-to-date':
      return 'up to date';
    case 'refused':
      return `refused (${decision.reason}): ${String(decision.available.revision)} needs a newer app`;
    case 'offline':
      return `offline: ${decision.detail} — the compiled pin stands`;
  }
};

const printStatus = (status: ContentStatus) =>
  Effect.gen(function* () {
    yield* Console.log(`corpus     ${status.corpus}`);
    yield* Console.log(
      `installed  ${Option.match(status.installed, {
        onNone: () => '(none)',
        onSome: (revision) => String(revision),
      })}`,
    );
    yield* Console.log(
      `pinned     ${Option.match(status.floor.pinned, {
        onNone: () => '(none)',
        onSome: (revision) => String(revision),
      })}`,
    );
    yield* Console.log(`schema     ${String(status.floor.schemaMajor)}`);
    yield* Console.log(describeDecision(status.decision));
  });

export const topicsStatus = Command.make('status', { json }, (args) =>
  Effect.gen(function* () {
    const status = yield* contentService(
      Effect.flatMap(ContentUpdate, (service) => service.status('topics')),
    );
    if (args.json) {
      yield* Console.log(yield* encodeStatus(status));
      return;
    }
    yield* printStatus(status);
  }),
);

/** What "activated nothing" means, which depends on whether anything is
 *  installed.
 *
 *  On a host that already holds a generation this is §3.6's mismatch posture —
 *  "leaves the installed version active", and nothing failed. On a host whose
 *  *first* install just failed, nothing is active at all, and reporting that
 *  the installed generation still serves is a claim about a generation that
 *  does not exist (round-4 B3). `status` is the post-run one, so its
 *  `installed` is the answer. */
const activatedNothing = (status: ContentStatus): string => {
  if (Option.isNone(status.installed)) {
    return 'activated  (nothing — no content is installed; this update did not complete)';
  }
  return 'activated  (nothing — the installed generation is still active)';
};

export const topicsUpdate = Command.make('update', { json }, (args) =>
  Effect.gen(function* () {
    const outcome = yield* contentService(
      Effect.flatMap(ContentUpdate, (service) => service.update('topics')),
    );
    if (args.json) {
      yield* Console.log(yield* encodeUpdate(outcome));
      return;
    }
    yield* printStatus(outcome.status);
    yield* Console.log(
      Option.match(outcome.activated, {
        onNone: () => activatedNothing(outcome.status),
        onSome: (revision) => `activated  ${String(revision)}`,
      }),
    );
  }),
);

export const topics = Command.make('topics', {}, () =>
  Console.log(`Usage: bible topics status [--json]\n       bible topics update [--json]`),
).pipe(Command.withSubcommands([topicsStatus, topicsUpdate]));
