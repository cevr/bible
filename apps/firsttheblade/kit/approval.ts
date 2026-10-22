/**
 * The stills the owner approved, by name. The rule: every image the site
 * serves is in the approval record or in a named list of images outside the
 * rule, each with its reason (`OUTSIDE`, `./served.ts`); and an approval
 * names an ask the owner answered with approval, and the stills that ask
 * showed. Whether a still's light comes from the sun is his look, given once
 * per change through a lab ask with 1:1 crops; the code holds only that what
 * ships is what he looked at.
 *
 * `kit/approved-stills.json` holds the approval (the lab ask that shows him
 * the stills: pending until he answers, then approved with the lab's record
 * of his answers) and the SHA-256 of each still: every served image
 * (`servedImages`) not outside the rule.
 *
 * `unapproved` names each still whose bytes differ from the record, each the
 * record does not name, and each the record names with no file;
 * `kit/field-still.test.ts` holds it empty. `bun run kit` and
 * `bun run kit:field` print it after they write, and never write the record.
 * `pin` (`bun run kit:pin`, `./pin.ts`) writes the record pending on an ask,
 * from the stills as they stand when the ask shows them. `approve`
 * (`bun run kit:approve`, `./approve.ts`) turns it approved from the lab's
 * answer, the stills unchanged. `shippable` (`bun run kit:shippable`, run
 * first by the prod deploy) refuses a record that is not approved, or stills
 * it does not hold.
 */
import { createHash } from 'node:crypto';

import { Effect, FileSystem, Option, Path, Schema } from 'effect';

import { AskAnswers, LabAsks } from './lab-asks.ts';
import { OUTSIDE, servedImages } from './served.ts';

/** The record, from the app. */
export const RECORD = 'kit/approved-stills.json';

/** The question of an ask that asks the owner to approve the stills it shows, by its id, and the option that approves them. */
export const STILLS_QUESTION = 'stills';
export const APPROVE = 'approve';

/**
 * The owner's approval: the lab ask that shows him the stills, pending
 * until he answers, then approved with when he answered the stills question
 * and every answer he gave in that ask, in the lab's words.
 */
export const Approval = Schema.Union([
  Schema.Struct({ status: Schema.Literal('pending'), ask: Schema.String }),
  Schema.Struct({
    status: Schema.Literal('approved'),
    ask: Schema.String,
    answered: Schema.String,
    answers: AskAnswers,
  }),
]);
export type Approval = typeof Approval.Type;

/** The record: the approval, and each still's path (from the app) with the SHA-256 of its bytes. */
export const Approved = Schema.Struct({
  approval: Approval,
  stills: Schema.Record(Schema.String, Schema.String),
});
export type Approved = typeof Approved.Type;

const RecordJson = Schema.fromJsonString(Approved, { space: 2 });

/** The SHA-256 of bytes, in hex. */
export const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

const outside = new Set(OUTSIDE.map(({ image }) => image));

/** Every still: each image the site serves that is not outside the rule, by its path from the app, sorted. */
export const servedStills = Effect.fn('Approval.served')(function* (app: string) {
  return (yield* servedImages(app)).filter((image) => !outside.has(image));
});

/** Each still with the SHA-256 of its bytes as they stand. */
export const hashedStills = Effect.fn('Approval.hashed')(function* (app: string) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  return yield* Effect.forEach(yield* servedStills(app), (still) =>
    Effect.map(fs.readFile(path.join(app, still)), (bytes) => [still, sha256(bytes)] as const),
  );
});

/** The record as it stands. */
export const readRecord = Effect.fn('Approval.read')(function* (app: string) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  return yield* Schema.decodeEffect(RecordJson)(yield* fs.readFileString(path.join(app, RECORD)));
});

const writeRecord = Effect.fn('Approval.write')(function* (app: string, record: Approved) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const json = yield* Schema.encodeEffect(RecordJson)(record);
  yield* fs.writeFileString(path.join(app, RECORD), `${json}\n`);
  return record;
});

/** Why a still is not one the owner approved. */
export const Why = Schema.Literals(['changed', 'not in the record', 'no file']);
export type Why = typeof Why.Type;

/** A still that is not one the owner approved, and why. */
export const Unapproved = Schema.Struct({ still: Schema.String, why: Why });
export type Unapproved = typeof Unapproved.Type;

/**
 * Each still that is not one the record holds: served with bytes other than
 * the record's, served and not in the record, or in the record and not
 * served. Empty when what ships is what the record holds.
 */
export const unapproved = Effect.fn('Approval.unapproved')(function* (app: string) {
  const { stills: approved } = yield* readRecord(app);
  const served = yield* hashedStills(app);
  const named = new Set(served.map(([still]) => still));
  const found: Array<Unapproved> = [];
  for (const [still, hash] of served) {
    const known = Object.hasOwn(approved, still);
    if (!known) found.push({ still, why: 'not in the record' });
    if (known && approved[still] !== hash) found.push({ still, why: 'changed' });
  }
  for (const still of Object.keys(approved))
    if (!named.has(still)) found.push({ still, why: 'no file' });
  return found.toSorted((a, b) => a.still.localeCompare(b.still));
});

const listed = (stills: ReadonlyArray<Unapproved>) =>
  stills.map(({ still, why }) => `${still} (${why})`).join(', ');

/** The owner has not answered the ask's stills question. */
export class AskUnanswered extends Schema.TaggedError<AskUnanswered>()('AskUnanswered', {
  ask: Schema.String,
}) {
  override get message() {
    return `the owner has not answered ask ${this.ask}'s ${STILLS_QUESTION} question: wait on it (bun cli.ts ask wait ${this.ask}, from apps/animations)`;
  }
}

/** The owner's answer to the stills question is not the approve choice. */
export class AskNotApproval extends Schema.TaggedError<AskNotApproval>()('AskNotApproval', {
  ask: Schema.String,
  answer: Schema.String,
}) {
  override get message() {
    return `ask ${this.ask}'s ${STILLS_QUESTION} answer is ${this.answer}, not the ${APPROVE} choice: the stills are not approved`;
  }
}

/** The record is not pending on the ask named, so that ask did not show the stills it pins. */
export class RecordNotPending extends Schema.TaggedError<RecordNotPending>()('RecordNotPending', {
  ask: Schema.String,
  approval: Approval,
}) {
  override get message() {
    return `the record is ${this.approval.status} on ask ${this.approval.ask}, not pending on ask ${this.ask}: pin the stills on the ask that shows them (bun run kit:pin --ask <id>)`;
  }
}

/** The stills are not the ones the pending record pinned when the ask showed them. */
export class StillsMoved extends Schema.TaggedError<StillsMoved>()('StillsMoved', {
  ask: Schema.String,
  stills: Schema.Array(Unapproved),
}) {
  override get message() {
    return `the stills are not the ones ask ${this.ask} showed: ${listed(this.stills)}; show the owner these as a new ask and pin them on it`;
  }
}

/** The record is pending: the owner has not approved the stills. */
export class ShipPending extends Schema.TaggedError<ShipPending>()('ShipPending', {
  ask: Schema.String,
}) {
  override get message() {
    return `the stills are pending on ask ${this.ask}: nothing ships until the owner approves them (bun run kit:approve --ask ${this.ask})`;
  }
}

/** Stills the site would serve that the record does not hold. */
export class ShipUnapproved extends Schema.TaggedError<ShipUnapproved>()('ShipUnapproved', {
  stills: Schema.Array(Unapproved),
}) {
  override get message() {
    return `the site would serve stills the owner did not approve: ${listed(this.stills)}`;
  }
}

/** The record written pending on `ask`, from the stills as they stand: run when the ask shows them, which the lab must hold. */
export const pin = Effect.fn('Approval.pin')(function* (app: string, ask: string) {
  yield* (yield* LabAsks).read(ask);
  return yield* writeRecord(app, {
    approval: { status: 'pending', ask },
    stills: Object.fromEntries(yield* hashedStills(app)),
  });
});

/**
 * The pending record turned approved on `ask`, from the lab's record of the
 * owner's answers. Refused unless the record is pending on that ask, the lab
 * holds the ask, the owner answered it, his answer to the stills question is
 * the approve choice, and every still is the one the record pinned.
 */
export const approve = Effect.fn('Approval.approve')(function* (app: string, ask: string) {
  const record = yield* readRecord(app);
  if (record.approval.status !== 'pending' || record.approval.ask !== ask)
    return yield* RecordNotPending.make({ ask, approval: record.approval });
  const held = yield* (yield* LabAsks).read(ask);
  if (held.state._tag === 'Asking') return yield* AskUnanswered.make({ ask });
  const answer = yield* Effect.fromOption(
    Option.fromUndefinedOr(held.state.answers[STILLS_QUESTION]),
  ).pipe(Effect.mapError(() => AskUnanswered.make({ ask })));
  if (answer.kind === 'free_text' || answer.kind === 'skipped')
    return yield* AskNotApproval.make({ ask, answer: answer.kind });
  if (answer.value !== APPROVE)
    return yield* AskNotApproval.make({ ask, answer: `the ${answer.value} choice` });
  const step = yield* Effect.fromOption(
    Option.fromUndefinedOr(
      held.answered.find(({ values }) => Object.hasOwn(values, STILLS_QUESTION)),
    ),
  ).pipe(Effect.mapError(() => AskUnanswered.make({ ask })));
  const moved = yield* unapproved(app);
  if (moved.length > 0) return yield* StillsMoved.make({ ask, stills: moved });
  const answers = Object.fromEntries(
    Object.entries(held.state.answers).filter(([, given]) => given.kind !== 'skipped'),
  );
  return yield* writeRecord(app, {
    approval: { status: 'approved', ask, answered: step.at, answers },
    stills: record.stills,
  });
});

/** The record as the prod deploy needs it: approved, and holding every still the site would serve. */
export const shippable = Effect.fn('Approval.shippable')(function* (app: string) {
  const { approval } = yield* readRecord(app);
  if (approval.status === 'pending') return yield* ShipPending.make({ ask: approval.ask });
  const found = yield* unapproved(app);
  if (found.length > 0) return yield* ShipUnapproved.make({ stills: found });
  return approval;
});

/** The stills against the record, logged: each one not approved, or that all are. */
export const reportAgainstRecord = Effect.fn('Approval.report')(function* (app: string) {
  const found = yield* unapproved(app);
  if (found.length === 0) return yield* Effect.logInfo('kit.stills.approved');
  yield* Effect.forEach(found, ({ still, why }) =>
    Effect.logWarning('kit.stills.unapproved').pipe(Effect.annotateLogs({ still, why })),
  );
  yield* Effect.logWarning('kit.stills.ask').pipe(
    Effect.annotateLogs({
      unapproved: found.length,
      next: 'show the owner the stills as a lab ask with 1:1 crops, then bun run kit:pin --ask <id>, and once he approves bun run kit:approve --ask <id>',
    }),
  );
});
