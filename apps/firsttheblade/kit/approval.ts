/**
 * The field stills the owner approved, by name. The rule: every shipped
 * field still, at every srcset size, is byte-identical to one the owner
 * approved by name. Whether a still's light comes from the sun is his look,
 * given once per change through a lab ask with 1:1 crops; the code holds
 * only that what ships is what he looked at.
 *
 * `kit/approved-stills.json` holds his approval (the lab ask that showed him
 * the stills, pending until he answers, then his answer verbatim) and the
 * SHA-256 of each still the site serves from the field: every file of
 * `src/art/` named `field-` (the srcset's sizes and the wind map the shader
 * reads beside them) and every link card in `public/og/`, each drawn from
 * the field (`./draw.ts`).
 *
 * `unapproved` names each served still whose bytes differ from the record,
 * each the record does not name, and each the record names with no file;
 * `kit/field-still.test.ts` holds it empty. `bun run kit` and
 * `bun run kit:field` print it after they write, and never write the
 * record. `bun run kit:approve` (`./approve.ts`) writes it, from the files
 * as they stand and the ask named.
 */
import { createHash } from 'node:crypto';

import { Effect, FileSystem, Path, Schema } from 'effect';

/** The record, from the app. */
export const RECORD = 'kit/approved-stills.json';

/** The owner's approval: the lab ask that showed him the stills, and his answer once he has given it. */
export const Approval = Schema.Union([
  Schema.Struct({ status: Schema.Literal('pending'), ask: Schema.String }),
  Schema.Struct({ status: Schema.Literal('approved'), ask: Schema.String, answer: Schema.String }),
]);
export type Approval = typeof Approval.Type;

/** The record: the approval, and each served still's path (from the app) with the SHA-256 of its bytes. */
export const Approved = Schema.Struct({
  approval: Approval,
  stills: Schema.Record(Schema.String, Schema.String),
});
export type Approved = typeof Approved.Type;

const RecordJson = Schema.fromJsonString(Approved, { space: 2 });

/** Where the served stills are, from the app, and which of each folder's files are stills of the field: in `public/og/`, every file but a hidden one. */
const SERVED: ReadonlyArray<{ readonly folder: string; readonly named: RegExp }> = [
  { folder: 'src/art', named: /^field-/ },
  { folder: 'public/og', named: /^[^.]/ },
];

/** The SHA-256 of bytes, in hex. */
export const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

/** Every still the site serves from the field, by its path from the app, sorted. */
export const servedStills = Effect.fn('Approval.served')(function* (app: string) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const found = yield* Effect.forEach(SERVED, ({ folder, named }) =>
    Effect.map(fs.readDirectory(path.join(app, folder)), (names) =>
      names.filter((name) => named.test(name)).map((name) => `${folder}/${name}`),
    ),
  );
  return found.flat().toSorted();
});

/** Each served still with the SHA-256 of its bytes as they stand. */
export const hashedStills = Effect.fn('Approval.hashed')(function* (app: string) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const stills = yield* servedStills(app);
  const hashes = yield* Effect.forEach(stills, (still) =>
    Effect.map(fs.readFile(path.join(app, still)), sha256),
  );
  return stills.map((still, i) => [still, hashes[i] ?? ''] as const);
});

/** The record as it stands. */
export const readRecord = Effect.fn('Approval.read')(function* (app: string) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  return yield* Schema.decodeEffect(RecordJson)(yield* fs.readFileString(path.join(app, RECORD)));
});

/** Why a still is not one the owner approved. */
export type Why = 'changed' | 'not in the record' | 'no file';

/** A still that is not one the owner approved, and why. */
export interface Unapproved {
  readonly still: string;
  readonly why: Why;
}

/**
 * Each still that is not one the owner approved: served with bytes other
 * than the record's, served and not in the record, or in the record and not
 * served. Empty when what ships is what he approved.
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

/** The record written from the served stills as they stand, under the approval named. */
export const approve = Effect.fn('Approval.approve')(function* (app: string, approval: Approval) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const record: Approved = {
    approval,
    stills: Object.fromEntries(yield* hashedStills(app)),
  };
  const json = yield* Schema.encodeEffect(RecordJson)(record);
  yield* fs.writeFileString(path.join(app, RECORD), `${json}\n`);
  return record;
});

/** The served stills against the record, logged: each one not approved, or that all are. */
export const reportAgainstRecord = Effect.fn('Approval.report')(function* (app: string) {
  const found = yield* unapproved(app);
  if (found.length === 0) return yield* Effect.logInfo('kit.stills.approved');
  yield* Effect.forEach(found, ({ still, why }) =>
    Effect.logWarning('kit.stills.unapproved').pipe(Effect.annotateLogs({ still, why })),
  );
  yield* Effect.logWarning('kit.stills.ask').pipe(
    Effect.annotateLogs({
      unapproved: found.length,
      next: 'show the owner the stills as a lab ask with 1:1 crops, then bun run kit:approve --ask <id> --answer <his words>',
    }),
  );
});
