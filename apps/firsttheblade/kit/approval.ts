/**
 * The stills the owner approved, by their bytes. Two rules:
 *
 * - A still is approved only if its SHA-256 equals a file that an image
 *   block of an approving ask showed, on a step his answer reached, and
 *   that ask's `stills` answer is `approve`. The hash is the lab's receipt
 *   (`./lab-asks.ts`), kept by its receipt rule: an image whose src the
 *   receipt names is served only as its copy. Each file-served image of an
 *   image block or an option is copied as the ask is made, or the make is
 *   refused (`AskRefused`, naming the src). A board block's panels and a
 *   video's poster or frame show live and bind nothing. The lab refuses an
 *   answer while a copy no longer holds its hash. The kit counts only the
 *   images the receipt names (`shownOn`): one it holds no hash of shows
 *   nothing, so a src outside the rule approves no still. So an approval
 *   binds the bytes the owner was shown before he answered, not his word
 *   alone and not the set's file as it stands later, and stays true of
 *   those bytes: a later ask need show only the stills that changed.
 * - Every image file of the built site (`dist/` after `bun run build`, each
 *   found by its bytes, `./build-walk.ts`) is an approved still or an image
 *   outside the rule (`OUTSIDE`, `./served.ts`, each with its reason). The
 *   build walk is the guard; the source reader (`servedImages`) is a fast
 *   check the kit and the tests run before a build. An image inside
 *   another file (a data URL) is no file the walk finds: the content
 *   policy every response carries (`img-src 'self'`,
 *   `../src/worker/respond.ts`) has the browser refuse it, so it never
 *   paints.
 *
 * Whether a still's light comes from the sun is his look, given once per
 * change through a lab ask that shows each still byte for byte as an image
 * block; the code holds only that what ships is what he was shown.
 *
 * `kit/approved-stills.json` holds the approval (the lab ask that shows him
 * the stills: pending until he answers, then approved with the lab it was
 * read from, the label of his answer, all his answers, and the SHA-256 of
 * each file the ask showed on the steps he reached), the earlier approvals
 * that showed a still's bytes as they stand, and the SHA-256 of each still:
 * every served image (`servedImages`) not outside the rule. Each ask it
 * names is saved beside it (`savedAsk`): the lab's record of the ask, and
 * the hash of each file it showed. Each approval the record keeps is held
 * to its saved ask (`checkKept`, which `approve` and `shippable` share).
 *
 * `unapproved` names each still whose bytes differ from the record, each the
 * record does not name, and each the record names with no file;
 * `kit/field-still.slow.test.ts` holds it empty. `bun run kit` and
 * `bun run kit:field` print it after they write, and never write the record.
 * `pin` (`bun run kit:pin`, `./pin.ts`) writes the record pending on an ask,
 * from the stills as they stand, and saves the ask. `approve`
 * (`bun run kit:approve`, `./approve.ts`) turns it approved from the lab's
 * record of the ask: its answer, and the receipt of the files its reached
 * image blocks showed; and saves the ask as answered. `shippable`
 * (`bun run kit:shippable`, and first in `alchemy.run.ts` on stage `prod`)
 * refuses a record that is not approved, an approval its saved ask does not
 * hold, a still no approval's shown files hold, and each image of a fresh
 * build the record and `OUTSIDE` do not hold.
 */
import { Effect, FileSystem, Option, Path, Predicate, Schema } from 'effect';

import { type BuiltImage, buildSite, builtImages, Format, sha256 } from './build-walk.ts';
import { AskAnswers, type AskRead, LabAsk, LabAsks } from './lab-asks.ts';
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
 * image blocks showed on the steps he reached, by the block's `src`, as the
 * lab's receipt holds it.
 */
export const Given = Schema.Struct({
  status: Schema.Literal('approved'),
  ask: Schema.String,
  lab: Schema.String,
  answered: Schema.String,
  answer: Schema.String,
  answers: AskAnswers,
  shown: Schema.Record(Schema.String, Schema.String),
});
export type Given = typeof Given.Type;

export const Approval = Schema.Union([
  Schema.Struct({ status: Schema.Literal('pending'), ask: Schema.String }),
  Given,
]);
export type Approval = typeof Approval.Type;

/**
 * The record: the approval; the approvals of earlier asks, each kept while
 * it showed the bytes of a pinned still, so a still unchanged since he
 * approved it stays approved when a later ask shows only what changed; and
 * each still's path (from the app) with the SHA-256 of its bytes.
 */
export const Approved = Schema.Struct({
  approval: Approval,
  earlier: Schema.Array(Given),
  stills: Schema.Record(Schema.String, Schema.String),
});
export type Approved = typeof Approved.Type;

/**
 * Where an ask the record names is saved, from the app: the lab's record of
 * it as the lab gave it, and the SHA-256 of each file its image blocks
 * showed, by `src`. `pin` saves the ask it pins on with its whole receipt,
 * `approve` saves it again as answered with the receipt of the steps he
 * reached (the approval's `shown`), so the committed record's asks are
 * always saved beside it.
 */
export const savedAsk = (ask: string) => ({
  record: `kit/fixtures/ask-${ask}.json`,
  shown: `kit/fixtures/ask-${ask}.shown.json`,
});

const BodyJson = Schema.fromJsonString(Schema.Unknown, { space: 2 });
const ShownJson = Schema.fromJsonString(Schema.Record(Schema.String, Schema.String), {
  space: 2,
});

/** Ask `ask`, as the lab gave it (`read`), saved at `savedAsk` with the hash of each file it showed (`shown`). */
const saveAsk = Effect.fn('Approval.saveAsk')(function* (
  app: string,
  ask: string,
  { body }: AskRead,
  shown: Readonly<Record<string, string>>,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const { record, shown: shownAt } = savedAsk(ask);
  yield* fs.makeDirectory(path.dirname(path.join(app, record)), { recursive: true });
  yield* fs.writeFileString(
    path.join(app, record),
    `${yield* Schema.encodeEffect(BodyJson)(body)}\n`,
  );
  yield* fs.writeFileString(
    path.join(app, shownAt),
    `${yield* Schema.encodeEffect(ShownJson)(shown)}\n`,
  );
});

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

/** The lab's record of the ask holds no receipt of the files its image blocks showed: it was made before the lab kept receipts. */
export class AskUnreceipted extends Schema.TaggedError<AskUnreceipted>()('AskUnreceipted', {
  ask: Schema.String,
}) {
  override get message() {
    return `the lab's record of ask ${this.ask} holds no receipt of the files its image blocks showed (it was made before the lab kept one): show the owner the stills on a new ask, and pin them on it`;
  }
}

/** Why an approval the record keeps is not one its saved ask holds. */
export const Unsound = Schema.Literals([
  'has no saved ask',
  'is not answered approve in its saved ask',
  'shows other files than its saved ask',
  'repeats the current ask',
]);
export type Unsound = typeof Unsound.Type;

/** An approval the record keeps that its saved ask (`savedAsk`) does not hold. */
export class ApprovalUnsound extends Schema.TaggedError<ApprovalUnsound>()('ApprovalUnsound', {
  ask: Schema.String,
  why: Unsound,
}) {
  override get message() {
    return `the record's approval on ask ${this.ask} ${this.why}: an approval is written by kit:approve from the lab's record, never by hand (bun run kit:pin --ask <id>, then bun run kit:approve --ask <id>)`;
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

/**
 * The record written pending on `ask`, from the stills as they stand; the
 * lab must hold the ask, with its receipt. It keeps each approval of another
 * ask (the record's own, once approved, and its earlier ones) that showed
 * the bytes of a pinned still, and saves the ask as the lab gave it with its
 * receipt.
 */
export const pin = Effect.fn('Approval.pin')(function* (app: string, ask: string) {
  const lab = yield* LabAsks;
  const read = yield* lab.read(ask);
  const shown = yield* receiptOf(read.record);
  const before = yield* readRecord(app);
  const stills = Object.fromEntries(yield* hashedStills(app));
  const pinned = new Set(Object.values(stills));
  const given = [before.approval].filter(Schema.is(Given));
  const earlier = [...given, ...before.earlier].filter(
    (approval) =>
      approval.ask !== ask && Object.values(approval.shown).some((hash) => pinned.has(hash)),
  );
  yield* saveAsk(app, ask, read, shown);
  return yield* writeRecord(app, { approval: { status: 'pending', ask }, earlier, stills });
});

/** The lab's receipt of the ask: the SHA-256 of each file its image blocks show, by `src`, as it made the ask; refused when it kept none. */
const receiptOf = (held: LabAsk) =>
  Effect.fromOption(Option.fromUndefinedOr(held.shown)).pipe(
    Effect.mapError(() => AskUnreceipted.make({ ask: held.id })),
  );

/**
 * The `src` of each image block on a step the owner's answers reached (the
 * steps `answered` names), in the order answered, once each. A step not
 * answered shows nothing here, and neither does one `answered` names that
 * the ask lacks: what is not known to be shown counts as not shown.
 */
export const imagesShown = (ask: LabAsk) => [
  ...new Set(
    ask.answered.flatMap(({ step }) =>
      Option.match(Option.fromUndefinedOr(ask.ask.steps[step]), {
        onNone: () => [],
        onSome: ({ blocks = [] }) =>
          blocks
            .filter(({ kind }) => kind === 'image')
            .flatMap(({ image }) =>
              Option.toArray(
                Option.flatMap(Option.fromUndefinedOr(image), ({ src }) =>
                  Option.fromUndefinedOr(src),
                ),
              ),
            ),
      }),
    ),
  ),
];

/** The receipt of each image block on a step the owner reached, by `src`: what the ask showed him. A block the receipt holds no hash of shows nothing. */
export const shownOn = Effect.fn('Approval.shownOn')(function* (held: LabAsk) {
  const receipt = yield* receiptOf(held);
  return Object.fromEntries(
    imagesShown(held).flatMap((src) =>
      Option.toArray(
        Option.map(Option.fromUndefinedOr(receipt[src]), (hash) => [src, hash] as const),
      ),
    ),
  );
});

/** Whether two shown sets name the same files with the same hashes. */
const sameShown = (a: Readonly<Record<string, string>>, b: Readonly<Record<string, string>>) => {
  const keys = Object.keys(a);
  return (
    keys.length === Object.keys(b).length &&
    keys.every((src) => Object.hasOwn(b, src) && b[src] === a[src])
  );
};

/**
 * Why an approval the record keeps is not one its saved ask holds, or none:
 * the saved ask is not there or is of another ask; it is still asking, or
 * its stills answer is not the approve choice; or the approval's shown files
 * are not the saved ones, not the image blocks the saved ask's reached
 * steps show, or (when the saved ask holds the lab's receipt) not the
 * receipt's hashes.
 */
const unsoundOf = Effect.fn('Approval.unsoundOf')(function* (app: string, given: Given) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const { record, shown } = savedAsk(given.ask);
  const saved = yield* Effect.all([
    fs
      .readFileString(path.join(app, record))
      .pipe(Effect.flatMap(Schema.decodeEffect(Schema.fromJsonString(LabAsk)))),
    fs.readFileString(path.join(app, shown)).pipe(Effect.flatMap(Schema.decodeEffect(ShownJson))),
  ]).pipe(Effect.option);
  if (Option.isNone(saved)) return Option.some<Unsound>('has no saved ask');
  const [held, files] = saved.value;
  if (held.id !== given.ask) return Option.some<Unsound>('has no saved ask');
  const answer = held.state.answers[STILLS_QUESTION];
  if (held.state._tag === 'Asking' || answer?.kind !== 'choose' || answer.value !== APPROVE)
    return Option.some<Unsound>('is not answered approve in its saved ask');
  const reached = imagesShown(held);
  const receipted = Option.match(Option.fromUndefinedOr(held.shown), {
    onNone: () => true,
    onSome: (receipt) =>
      sameShown(
        given.shown,
        Object.fromEntries(Object.keys(given.shown).map((src) => [src, receipt[src] ?? ''])),
      ),
  });
  const shows =
    sameShown(given.shown, files) &&
    receipted &&
    Object.keys(given.shown).every((src) => reached.includes(src));
  if (!shows) return Option.some<Unsound>('shows other files than its saved ask');
  return Option.none<Unsound>();
});

/**
 * The approvals the record keeps, each held to its saved ask (`unsoundOf`),
 * and none of the earlier ones on the ask `current` (the record's own):
 * refused with the first that is not, naming it and why. `approve` checks the
 * earlier ones before it reads the lab; `shippable`, the approval too.
 */
export const checkKept = Effect.fn('Approval.checkKept')(function* (
  app: string,
  current: string,
  kept: ReadonlyArray<Given>,
  earlier: ReadonlyArray<Given>,
) {
  const repeated = earlier.find(({ ask }) => ask === current);
  if (Predicate.isNotUndefined(repeated))
    return yield* ApprovalUnsound.make({ ask: repeated.ask, why: 'repeats the current ask' });
  for (const given of [...kept, ...earlier]) {
    const why = yield* unsoundOf(app, given);
    if (Option.isSome(why)) return yield* ApprovalUnsound.make({ ask: given.ask, why: why.value });
  }
});

/** Each pinned still (sorted) whose SHA-256 no file of any of the shown sets has. */
export const stillsNotShown = (
  stills: Approved['stills'],
  ...shown: ReadonlyArray<Readonly<Record<string, string>>>
) => {
  const hashes = new Set(shown.flatMap((files) => Object.values(files)));
  return Object.keys(stills)
    .filter((still) => !hashes.has(stills[still] ?? ''))
    .toSorted();
};

/**
 * The pending record turned approved on `ask`, from the lab's record of the
 * ask. Refused unless the record is pending on that ask, each earlier
 * approval it keeps is held by its saved ask (`checkKept`), the lab holds
 * the ask with its receipt, the owner answered it, his answer to the stills
 * question is the approve choice, every pinned still's SHA-256 is that of a
 * file an image block on a step he reached showed, by the receipt, or an
 * earlier approval showed (each other named), and every still is the one
 * the record pinned. It saves the ask again as the lab gave it answered,
 * and keeps only the earlier approvals that hold a still this ask did not
 * show.
 */
export const approve = Effect.fn('Approval.approve')(function* (app: string, ask: string) {
  const record = yield* readRecord(app);
  if (record.approval.status !== 'pending' || record.approval.ask !== ask)
    return yield* RecordNotPending.make({ ask, approval: record.approval });
  yield* checkKept(app, ask, [], record.earlier);
  const lab = yield* LabAsks;
  const read = yield* lab.read(ask);
  const held = read.record;
  yield* receiptOf(held);
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
  const shown = yield* shownOn(held);
  const notShown = stillsNotShown(
    record.stills,
    shown,
    ...record.earlier.map((approval) => approval.shown),
  );
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
  const left = new Set(
    stillsNotShown(record.stills, shown).flatMap((still) =>
      Option.toArray(Option.fromUndefinedOr(record.stills[still])),
    ),
  );
  const earlier = record.earlier.filter((given) =>
    Object.values(given.shown).some((hash) => left.has(hash)),
  );
  yield* saveAsk(app, ask, read, shown);
  yield* writeRecord(app, { approval, earlier, stills: record.stills });
  return { approval, earlier, stills: record.stills };
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
 * approved, each approval it keeps held by its saved ask (`checkKept`), each
 * still's SHA-256 that of a file an approval showed, then a fresh
 * `bun run build` whose every image (by its bytes) the record or `OUTSIDE`
 * holds.
 */
export const shippable = Effect.fn('Approval.shippable')(function* (app: string) {
  const path = yield* Path.Path;
  const { approval, earlier, stills } = yield* readRecord(app);
  if (approval.status === 'pending') return yield* ShipPending.make({ ask: approval.ask });
  yield* checkKept(app, approval.ask, [approval], earlier);
  const notShown = stillsNotShown(stills, approval.shown, ...earlier.map(({ shown }) => shown));
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
