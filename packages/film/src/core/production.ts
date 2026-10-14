// A production: something the studio moves forward version by version (a
// film, or a development track such as the look), and its history as the
// lab's front door shows it. Kitsu calls the same thing a production; its
// numbered versions are what the owner moves forward ("once we move forward
// we increment versions").
//
// Most of a production's history is derived, never kept twice:
//
// - its sets: a review set names its production in its own `review.json`
//   (`production`, and `published`, the time `film publish` wrote it; an
//   older set is filed by the ledger instead, `filed`), and lands in the
//   version open when it was published (or the one it names, `version`);
// - its choices: each set's comparison sets, and whether the owner approved
//   a variant (the folder's catalogue, as the review index reads it);
// - what waits on the owner: a choice of two or more variants with none
//   approved and no decision naming it, in the current version.
//
// The ledger (`ProductionFile`, kept by `tools/production-store.ts`) holds
// only what nothing else records: the versions (each opened at a time,
// with what it is for and the decision that moved the production into it),
// the owner's decisions and notes given outside the lab (in words, to an
// agent), and the filing of sets published before sets named their
// production. A version's number is its place in the ledger, so a gap or a
// repeat cannot be written. Pure: the lab's page and its tools share it.

import { Array as Arr, Data, Effect, Option, Order, Result, Schema } from 'effect';
import type { ChoicePoint } from './choice.ts';
import { VersionMoved } from './refusals.ts';
import type { ReviewFolder } from './review.ts';
import { maybe } from './schema.ts';

/** A production's name: lower case, digits and `-`, as its URL and its ledger's file carry it. */
export const ProductionId = Schema.String.check(Schema.isPattern(/^[a-z0-9][a-z0-9-]{0,63}$/));
export type ProductionId = typeof ProductionId.Type;

/** A key a JSON file may leave out, read as `fallback` when it does. */
const orElse = <S extends Schema.Top>(schema: S, fallback: S['Encoded']) =>
  schema.pipe(Schema.withDecodingDefaultKey(Effect.succeed(fallback)));

/** ms since the epoch. */
const At = Schema.Finite.check(Schema.isGreaterThanOrEqualTo(0));

/** A version's number: 1 for the first. */
export const VersionNumber = Schema.Int.check(Schema.isGreaterThanOrEqualTo(1));

/**
 * A version as it was opened: when, what it is for (`title`, its name on the
 * timeline), and why the production moved into it (`because`: the decision
 * that closed the version before; none for the first).
 */
const VersionOpened = Schema.Struct({
  at: At,
  title: Schema.String,
  because: maybe(Schema.String),
});
type VersionOpened = typeof VersionOpened.Type;

/** What a word of the owner's is about: a set (its path under its root), one of its choices, one variant. */
const SaidOn = {
  set: maybe(Schema.String),
  point: maybe(Schema.String),
  variant: maybe(Schema.String),
};

/**
 * The owner's word given outside the lab, as an agent recorded it: a
 * decision (a pick, a direction) or a note (feedback, an ask). `quote` is the
 * owner's own words, verbatim; `text` says it plainly.
 */
export const Said = Schema.Union([
  Schema.TaggedStruct('Decided', {
    at: At,
    text: Schema.String,
    quote: maybe(Schema.String),
    ...SaidOn,
  }),
  Schema.TaggedStruct('Noted', {
    at: At,
    text: Schema.String,
    quote: maybe(Schema.String),
    ...SaidOn,
  }),
]).pipe(Schema.toTaggedUnion('_tag'));
export type Said = typeof Said.Type;

/** A set published before sets named their production, filed in a version by hand. */
const Filed = Schema.Struct({ set: Schema.String, version: VersionNumber });
type Filed = typeof Filed.Type;

/**
 * A production's ledger: its name and title, the film it makes (none for a
 * track such as the look), a line on what it is, its versions (oldest
 * first, at least one, each opened no earlier than the one before), the
 * owner's words, and the sets it files by hand.
 */
export const ProductionFile = Schema.Struct({
  production: ProductionId,
  title: Schema.String,
  film: maybe(Schema.String),
  blurb: maybe(Schema.String),
  versions: Schema.NonEmptyArray(VersionOpened).check(
    Schema.makeFilter(
      (versions) =>
        versions.every((v, i) => i === 0 || v.at >= (versions[i - 1]?.at ?? 0)) ||
        'each version is opened no earlier than the one before it',
    ),
  ),
  said: orElse(Schema.Array(Said), []),
  filed: orElse(Schema.Array(Filed), []),
});
export type ProductionFile = typeof ProductionFile.Type;

/** `GET /api/productions`: every production's ledger. */
export const Productions = Schema.Struct({ productions: Schema.Array(ProductionFile) });
export type Productions = typeof Productions.Type;

/** `POST /api/productions/<production>/versions`: move forward from version `after`. */
export const MoveForward = Schema.Struct({
  /** The version the mover saw as current: refused when the production has moved since. */
  after: VersionNumber,
  title: Schema.String.check(Schema.isMinLength(1)),
  because: maybe(Schema.String),
});
export type MoveForward = typeof MoveForward.Type;

/** A production's first ledger: one version, opened at `at`. */
export const newProduction = (
  production: ProductionId,
  title: string,
  at: number,
  film: Option.Option<string> = Option.none(),
): ProductionFile => ({
  production,
  title,
  film,
  blurb: Option.none(),
  versions: [{ at, title: 'v1', because: Option.none() }],
  said: [],
  filed: [],
});

/** The production's current version's number: its last. */
export const currentVersion = (file: ProductionFile): number => file.versions.length;

/**
 * The production moved forward: a new version opened at `at`, after the one
 * the mover saw (`VersionMoved` when it has moved since).
 */
export const moveForward = (
  file: ProductionFile,
  move: MoveForward,
  at: number,
): Result.Result<ProductionFile, VersionMoved> => {
  const current = currentVersion(file);
  if (move.after !== current)
    return Result.fail(
      VersionMoved.make({ production: file.production, after: move.after, current }),
    );
  const last = file.versions[current - 1]?.at ?? 0;
  return Result.succeed({
    ...file,
    versions: [
      ...file.versions,
      { at: Math.max(at, last), title: move.title, because: move.because },
    ],
  });
};

/** The owner's word recorded (`film production decide|note`). */
export const withSaid = (file: ProductionFile, said: Said): ProductionFile => ({
  ...file,
  said: Arr.sort(
    [...file.said, said],
    Order.mapInput(Order.Number, (s: Said) => s.at),
  ),
});

/** A set filed in version `version` by hand (a later filing of the same set replaces it). */
export const withFiled = (file: ProductionFile, filed: Filed): ProductionFile => ({
  ...file,
  filed: [...file.filed.filter((f) => f.set !== filed.set), filed],
});

// ---------------------------------------------------------------------------
// The history, derived

/** A folder's path under its root: its ref without the root's label. */
export const setPathOf = (ref: string): string => ref.split('/').slice(1).join('/');

/** A choice of the set's that waits on the owner: two or more variants, none approved, no decision on it. */
export interface Waiting {
  readonly folder: ReviewFolder;
  readonly point: ChoicePoint;
}

export type Entry = Data.TaggedEnum<{
  /** A set published into the version. */
  Published: { readonly at: number; readonly folder: ReviewFolder };
  /** A set the ledger files that no root holds now (moved, trashed, on another machine). */
  Missing: { readonly at: number; readonly set: string };
  /** The owner's decision or note. */
  Said: { readonly at: number; readonly said: Said };
}>;
export const Entry = Data.taggedEnum<Entry>();

/** One version as the timeline shows it. */
export interface VersionView {
  readonly n: number;
  readonly title: string;
  readonly at: number;
  readonly because: Option.Option<string>;
  /** When the next version opened; none for the current one. */
  readonly until: Option.Option<number>;
  readonly current: boolean;
  /** Newest first. */
  readonly entries: ReadonlyArray<Entry>;
  /** The choices that wait on the owner (only the current version's wait). */
  readonly waiting: ReadonlyArray<Waiting>;
}

/** A production as its timeline shows it. */
export interface ProductionHistory {
  readonly production: string;
  readonly title: string;
  readonly film: Option.Option<string>;
  readonly blurb: Option.Option<string>;
  /** Whether a ledger keeps it; one named only by its sets has none until it moves forward. */
  readonly kept: boolean;
  /** Newest first: the current version is the first. */
  readonly versions: ReadonlyArray<VersionView>;
  /** The newest thing on it: an entry's time, else the current version's opening. */
  readonly latest: number;
}

/** The ledger of a production that only its sets name: one version, open since the start. */
const implicit = (production: string): ProductionFile => newProduction(production, production, 0);

/** The version (1-based) open at `at`: the last opened at or before it, else the first. */
export const versionAt = (file: ProductionFile, at: number): number =>
  Math.max(1, file.versions.findLastIndex((v) => v.at <= at) + 1);

/** A version number the ledger has, else none. */
const known = (file: ProductionFile, n: number): Option.Option<number> =>
  Option.liftPredicate(n, (v) => Number.isInteger(v) && v >= 1 && v <= file.versions.length);

/** When a folder was published: as its manifest says, else its newest file's time. */
const publishedAt = (folder: ReviewFolder): number =>
  Option.getOrElse(Option.fromUndefinedOr(folder.published), () => folder.mtime);

/** The version `folder` is in for `file`, when it is the production's: named by the set, else filed. */
const versionOfFolder = (file: ProductionFile, folder: ReviewFolder): Option.Option<number> => {
  if (folder.production === file.production)
    return Option.orElse(
      Option.flatMap(Option.fromUndefinedOr(folder.version), (n) => known(file, n)),
      () => Option.some(versionAt(file, publishedAt(folder))),
    );
  if (Option.isSome(Option.fromUndefinedOr(folder.production))) return Option.none();
  const path = setPathOf(folder.ref);
  return Option.flatMap(
    Arr.findLast(file.filed, (f) => f.set === path),
    (f) => known(file, f.version),
  );
};

/** Whether `said` names `point` of the set at `path` (a decision on the set alone names all its choices). */
const decides = (said: Said, path: string, point: string): boolean =>
  said._tag === 'Decided' &&
  Option.contains(said.set, path) &&
  Option.match(said.point, { onNone: () => true, onSome: (p) => p === point });

/** A set's choices that wait on the owner, given the production's words. */
export const waitingIn = (
  folder: ReviewFolder,
  said: ReadonlyArray<Said>,
): ReadonlyArray<Waiting> => {
  const path = setPathOf(folder.ref);
  return folder.sets
    .filter(
      (point) =>
        point.variants.length >= 2 &&
        !point.variants.some((v) => v.approval === 'approved' || v.picked) &&
        !said.some((s) => decides(s, path, point.id)),
    )
    .map((point) => ({ folder, point }));
};

const newestFirst = Order.flip(Order.mapInput(Order.Number, (e: Entry) => e.at));

/**
 * `production`'s history: its ledger (none for one only its sets name)
 * with the review's folders laid into its versions.
 */
const historyOf = (
  production: string,
  ledger: Option.Option<ProductionFile>,
  folders: ReadonlyArray<ReviewFolder>,
): ProductionHistory => {
  const file = Option.getOrElse(ledger, () => implicit(production));
  const placed = folders.flatMap((folder) =>
    Option.match(versionOfFolder(file, folder), {
      onNone: () => [],
      onSome: (n) => [{ n, folder }],
    }),
  );
  const listed = new Set(placed.map((p) => setPathOf(p.folder.ref)));
  const missing = file.filed.filter((f) => !listed.has(f.set) && f.version <= file.versions.length);
  const count = file.versions.length;
  const versions = file.versions.map((opened, i): VersionView => {
    const n = i + 1;
    const mine = placed.filter((p) => p.n === n);
    const entries = Arr.sort(
      [
        ...mine.map((p) => Entry.Published({ at: publishedAt(p.folder), folder: p.folder })),
        ...missing
          .filter((f) => f.version === n)
          .map((f) => Entry.Missing({ at: opened.at, set: f.set })),
        ...file.said
          .filter((s) => versionAt(file, s.at) === n)
          .map((s) => Entry.Said({ at: s.at, said: s })),
      ],
      newestFirst,
    );
    return {
      n,
      title: opened.title,
      at: opened.at,
      because: opened.because,
      until: Option.map(Option.fromUndefinedOr(file.versions[n]), (next) => next.at),
      current: n === count,
      entries,
      waiting: mine.filter(() => n === count).flatMap((p) => waitingIn(p.folder, file.said)),
    };
  });
  const shown = versions.toReversed();
  const top = shown[0];
  return {
    production: file.production,
    title: file.title,
    film: file.film,
    blurb: file.blurb,
    kept: Option.isSome(ledger),
    versions: shown,
    latest: Math.max(top?.at ?? 0, ...(top?.entries ?? []).map((e) => e.at)),
  };
};

/** Every production there is: each ledger's, and each named by a set; newest first. */
export const productionsOf = (
  ledgers: ReadonlyArray<ProductionFile>,
  folders: ReadonlyArray<ReviewFolder>,
): ReadonlyArray<ProductionHistory> => {
  const named = folders.flatMap((f) => Option.toArray(Option.fromUndefinedOr(f.production)));
  const ids = Arr.dedupe([...ledgers.map((l) => l.production), ...named]);
  return Arr.sort(
    ids.map((id) =>
      historyOf(
        id,
        Arr.findFirst(ledgers, (l) => l.production === id),
        folders,
      ),
    ),
    Order.flip(Order.mapInput(Order.Number, (h: ProductionHistory) => h.latest)),
  );
};

/** The folders no production's timeline holds: what the front door lists loose. */
export const unfiledOf = (
  histories: ReadonlyArray<ProductionHistory>,
  folders: ReadonlyArray<ReviewFolder>,
): ReadonlyArray<ReviewFolder> => {
  const held = new Set(
    histories.flatMap((h) =>
      h.versions.flatMap((v) => v.entries.filter(Entry.$is('Published')).map((e) => e.folder.ref)),
    ),
  );
  return folders.filter((f) => !held.has(f.ref));
};

/** The current version of a history (its first). */
export const currentOf = (history: ProductionHistory): VersionView =>
  history.versions[0] ?? {
    n: 1,
    title: 'v1',
    at: 0,
    because: Option.none(),
    until: Option.none(),
    current: true,
    entries: [],
    waiting: [],
  };
