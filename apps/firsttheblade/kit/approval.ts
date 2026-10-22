/**
 * The stills the owner approved, by their bytes. Two rules:
 *
 * - A still is approved only if its SHA-256 equals a file that an image
 *   block of the approving ask showed, and that ask's `stills` answer is
 *   `approve`. An approval binds the bytes the owner was shown, not his
 *   word alone.
 * - Every image file of the built site (`dist/` after `bun run build`, each
 *   found by its bytes, `./build-walk.ts`) is an approved still or an image
 *   outside the rule (`OUTSIDE`, `./served.ts`, each with its reason). The
 *   build walk is the guard; the source reader (`servedImages`) is a fast
 *   check the kit and the tests run before a build.
 *
 * Whether a still's light comes from the sun is his look, given once per
 * change through a lab ask that shows each still byte for byte as an image
 * block; the code holds only that what ships is what he was shown.
 *
 * `kit/approved-stills.json` holds the approval (the lab ask that shows him
 * the stills: pending until he answers, then approved with the lab it was
 * read from, the label of his answer, all his answers, and the SHA-256 of
 * each file the ask showed) and the SHA-256 of each still: every served
 * image (`servedImages`) not outside the rule.
 *
 * `unapproved` names each still whose bytes differ from the record, each the
 * record does not name, and each the record names with no file;
 * `kit/field-still.test.ts` holds it empty. `bun run kit` and
 * `bun run kit:field` print it after they write, and never write the record.
 * `pin` (`bun run kit:pin`, `./pin.ts`) writes the record pending on an ask,
 * from the stills as they stand. `approve` (`bun run kit:approve`,
 * `./approve.ts`) turns it approved from the lab's record of the ask: its
 * answer, and the files its image blocks showed. `shippable`
 * (`bun run kit:shippable`, and first in `alchemy.run.ts` on stage `prod`)
 * refuses a record that is not approved, a still the approval's shown files
 * do not hold, and each image of a fresh build the record and `OUTSIDE` do
 * not hold.
 */
import { Effect, FileSystem, Option, Path, Schema } from 'effect';

import { type BuiltImage, buildSite, builtImages, Format, sha256 } from './build-walk.ts';
import { AskAnswers, type LabAsk, LabAsks } from './lab-asks.ts';
import { OUTSIDE, servedImages } from './served.ts';

/** The record, from the app. */
export const RECORD = 'kit/approved-stills.json';

/** The question of an ask that asks the owner to approve the stills it shows, by its id, and the option that approves them. */
export const STILLS_QUESTION = 'stills';
export const APPROVE = 'approve';

/**
 * The owner's approval: the lab ask that shows him the stills, pending
 * until he answers, then approved with the lab it was read from, when he
 * answered the stills question and the label of his answer, every answer he
 * gave in that ask in the lab's words, and the SHA-256 of each file its
 * image blocks showed, by the block's `src`.
 */
export const Approval = Schema.Union([
  Schema.Struct({ status: Schema.Literal('pending'), ask: Schema.String }),
  Schema.Struct({
    status: Schema.Literal('approved'),
    ask: Schema.String,
    lab: Schema.String,
    answered: Schema.String,
    answer: Schema.String,
    answers: AskAnswers,
    shown: Schema.Record(Schema.String, Schema.String),
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

/** Pinned stills whose bytes no file the ask's image blocks showed holds. */
export class StillsNotShown extends Schema.TaggedError<StillsNotShown>()('StillsNotShown', {
  ask: Schema.String,
  stills: Schema.Array(Schema.String),
}) {
  override get message() {
    return `ask ${this.ask} showed no file with the bytes of ${this.stills.join(', ')}: show the owner each still byte for byte as an image block of a new ask, and pin the stills on it`;
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

/** An image of the built site that is no approved still and no image outside the rule: its path from `dist/` and its format. */
export const BuiltUnapproved = Schema.Struct({ image: Schema.String, format: Format });
export type BuiltUnapproved = typeof BuiltUnapproved.Type;

/** Images the built site would serve that the record and `OUTSIDE` do not hold. */
export class ShipUnapproved extends Schema.TaggedError<ShipUnapproved>()('ShipUnapproved', {
  images: Schema.Array(BuiltUnapproved),
}) {
  override get message() {
    const images = this.images.map(({ image, format }) => `dist/${image} (${format})`);
    return `the built site would serve images the owner did not approve: ${images.join(', ')}`;
  }
}

/** The record written pending on `ask`, from the stills as they stand; the lab must hold the ask. */
export const pin = Effect.fn('Approval.pin')(function* (app: string, ask: string) {
  yield* (yield* LabAsks).read(ask);
  return yield* writeRecord(app, {
    approval: { status: 'pending', ask },
    stills: Object.fromEntries(yield* hashedStills(app)),
  });
});

/** The `src` of each image block the ask shows, in its steps' order, once each. */
export const imagesShown = (ask: LabAsk) => [
  ...new Set(
    Object.values(ask.ask.steps).flatMap(({ blocks = [] }) =>
      blocks
        .filter(({ kind }) => kind === 'image')
        .flatMap(({ image }) =>
          Option.toArray(
            Option.flatMap(Option.fromUndefinedOr(image), ({ src }) => Option.fromUndefinedOr(src)),
          ),
        ),
    ),
  ),
];

/** Each pinned still (sorted) whose SHA-256 no shown file has. */
export const stillsNotShown = (
  stills: Approved['stills'],
  shown: Readonly<Record<string, string>>,
) => {
  const hashes = new Set(Object.values(shown));
  return Object.keys(stills)
    .filter((still) => !hashes.has(stills[still] ?? ''))
    .toSorted();
};

/**
 * The pending record turned approved on `ask`, from the lab's record of the
 * ask. Refused unless the record is pending on that ask, the lab holds the
 * ask, the owner answered it, his answer to the stills question is the
 * approve choice, every pinned still's SHA-256 is that of a file one of the
 * ask's image blocks showed (each other named), and every still is the one
 * the record pinned.
 */
export const approve = Effect.fn('Approval.approve')(function* (app: string, ask: string) {
  const record = yield* readRecord(app);
  if (record.approval.status !== 'pending' || record.approval.ask !== ask)
    return yield* RecordNotPending.make({ ask, approval: record.approval });
  const lab = yield* LabAsks;
  const held = yield* lab.read(ask);
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
  const shown = Object.fromEntries(
    yield* Effect.forEach(imagesShown(held), (src) =>
      Effect.map(lab.shownHash(src), (hash) => [src, hash] as const),
    ),
  );
  const notShown = stillsNotShown(record.stills, shown);
  if (notShown.length > 0) return yield* StillsNotShown.make({ ask, stills: notShown });
  const moved = yield* unapproved(app);
  if (moved.length > 0) return yield* StillsMoved.make({ ask, stills: moved });
  const answers = Object.fromEntries(
    Object.entries(held.state.answers).filter(([, given]) => given.kind !== 'skipped'),
  );
  const approval = {
    status: 'approved' as const,
    ask,
    lab: lab.url,
    answered: step.at,
    answer: answer.label,
    answers,
    shown,
  };
  yield* writeRecord(app, { approval, stills: record.stills });
  return { approval, stills: record.stills };
});

/**
 * Each image of the built site at `dist` (by its bytes) whose SHA-256 is no
 * still's in the record and no image's outside the rule, sorted by path.
 */
export const unapprovedBuilt = Effect.fn('Approval.unapprovedBuilt')(function* (
  app: string,
  dist: string,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const { stills } = yield* readRecord(app);
  const outside = yield* Effect.forEach(OUTSIDE, ({ image }) =>
    Effect.map(fs.readFile(path.join(app, image)), sha256),
  );
  const held = new Set([...Object.values(stills), ...outside]);
  return (yield* builtImages(dist))
    .filter(({ hash }: BuiltImage) => !held.has(hash))
    .map(({ file, format }) => ({ image: file, format }));
});

/**
 * The record as the prod deploy needs it, and the build it ships: the record
 * approved, each still's SHA-256 that of a file the approving ask showed,
 * then a fresh `bun run build` whose every image (by its bytes) the record
 * or `OUTSIDE` holds.
 */
export const shippable = Effect.fn('Approval.shippable')(function* (app: string) {
  const path = yield* Path.Path;
  const { approval, stills } = yield* readRecord(app);
  if (approval.status === 'pending') return yield* ShipPending.make({ ask: approval.ask });
  const notShown = stillsNotShown(stills, approval.shown);
  if (notShown.length > 0)
    return yield* StillsNotShown.make({ ask: approval.ask, stills: notShown });
  yield* buildSite(app);
  const found = yield* unapprovedBuilt(app, path.join(app, 'dist'));
  if (found.length > 0) return yield* ShipUnapproved.make({ images: found });
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
      next: 'show the owner each still byte for byte as an image block of a lab ask, then bun run kit:pin --ask <id>, and once he approves bun run kit:approve --ask <id>',
    }),
  );
});
