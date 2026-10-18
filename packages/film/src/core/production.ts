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
// - what waits on the owner: each question an agent asked of them about a
//   set (`Asked`) that no pick in its choice and no later decision on it
//   has answered; it waits on the current version, whenever it was asked.
//
// The ledger (`ProductionFile`, kept by `tools/production-store.ts`) holds
// only what nothing else records: the versions (each opened at a time,
// with what it is for and the decision that moved the production into it),
// the owner's decisions and notes given outside the lab (in words, to an
// agent) and the questions asked of them, and the filing of sets published before sets named their
// production. A version's number is its place in the ledger, so a gap or a
// repeat cannot be written. Pure: the lab's page and its tools share it.

import { Array as Arr, Data, Effect, Match, Option, Order, Result, Schema } from 'effect';
import { type BoardFile, approvalOf } from './board.ts';
import type { ChoicePoint } from './choice.ts';
import { DecisionUnknown, Undecided, VersionMoved, WordUnaimed } from './refusals.ts';
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
 * The owner's picks on a lab ask: each question he answered by a choice, by
 * its name, and the value of the option he chose.
 */
const Picks = Schema.Record(Schema.String, Schema.String);

/**
 * The lab ask a word files (`ask`, in the lab's asks): its question, or its
 * answer or withdrawal; and with its answer, the owner's picks on it
 * (`picks`; none on a question, a withdrawal or a word from chat). An
 * answer's decision that carries none backs no pick, whatever its line says.
 */
const SaidAsk = { ask: maybe(Schema.String), picks: maybe(Picks) };

/** Who filed the word: the agent that heard it (`by`), or the ask's asker; none for a word that does not say. */
const SaidBy = { by: maybe(Schema.String) };

/**
 * The owner's word given outside the lab, as an agent recorded it: a
 * decision (a pick, a direction) or a note (feedback), and the question an
 * agent asks the owner about a set (`Asked`: it waits on the owner until a
 * decision on that set, or a pick in that choice, answers it). `quote` is
 * the owner's own words, verbatim; `text` says it plainly; `by` names who
 * filed it. A word an ask files names it (`ask`): that ask's answer answers
 * its question and no other, and withdrawing the ask (a note naming it)
 * closes its question.
 */
export const Said = Schema.Union([
  Schema.TaggedStruct('Decided', {
    at: At,
    text: Schema.String,
    quote: maybe(Schema.String),
    ...SaidOn,
    ...SaidAsk,
    ...SaidBy,
  }),
  Schema.TaggedStruct('Noted', {
    at: At,
    text: Schema.String,
    quote: maybe(Schema.String),
    ...SaidOn,
    ...SaidAsk,
    ...SaidBy,
  }),
  Schema.TaggedStruct('Asked', {
    at: At,
    text: Schema.String,
    quote: maybe(Schema.String),
    ...SaidOn,
    ...SaidAsk,
    ...SaidBy,
  }),
]).pipe(Schema.toTaggedUnion('_tag'));
export type Said = typeof Said.Type;

/** The owner's word as an agent records it from chat: a decision or a note. A question is a lab ask's, filed by the ask. */
export type OwnerWord = Extract<Said, { readonly _tag: 'Decided' | 'Noted' }>;

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

/** The owner's word recorded (`film lab decide|note`). */
export const withSaid = (file: ProductionFile, said: Said): ProductionFile => ({
  ...file,
  said: Arr.sort(
    [...file.said, said],
    Order.mapInput(Order.Number, (s: Said) => s.at),
  ),
});

/**
 * A word aimed where it says: a choice (`point`) is one in a set, so it
 * names the `set`; a variant is one of a choice's, so it names the `point`.
 * The rule every caller of the store's `say` gets (the MCP's `decide|note`,
 * `film lab decide|note`), and every ask the asks' store makes.
 */
export const aimedWord = <W extends Pick<OwnerWord, 'set' | 'point' | 'variant'>>(
  word: W,
): Result.Result<W, WordUnaimed> => {
  if (Option.isSome(word.point) && Option.isNone(word.set))
    return Result.fail(WordUnaimed.make({ names: 'point' }));
  if (Option.isSome(word.variant) && Option.isNone(word.point))
    return Result.fail(WordUnaimed.make({ names: 'variant' }));
  return Result.succeed(word);
};

/** An ask's id as the lab writes it into a word's text: `(ask <its id>)`. */
const ASK_NAMED = /\(ask (a[0-9a-f]{10})\)/;

/**
 * The ask a word files: its `ask`, or for a question filed before words named
 * their ask, the id its text names (the lab wrote `(ask a…)` into it).
 */
const askNamed = (said: Said): Option.Option<string> =>
  Option.orElse(said.ask, () =>
    Option.flatMap(
      Option.liftPredicate(said, (s) => s._tag === 'Asked'),
      (s) => Option.fromNullishOr(ASK_NAMED.exec(s.text)?.[1]),
    ),
  );

/**
 * `said`, filed by an ask (`said.ask`), unless the timeline holds that ask's
 * word of its kind already (its question, or what closed it): an ask's
 * filing tried again, or by two closes at once, files it once.
 */
export const withAskSaid = (file: ProductionFile, said: Said): ProductionFile => {
  const isQuestion = (s: Said) => s._tag === 'Asked';
  const filed = Option.exists(said.ask, (id) =>
    file.said.some((s) => Option.contains(askNamed(s), id) && isQuestion(s) === isQuestion(said)),
  );
  if (filed) return file;
  return withSaid(file, said);
};

/** A set filed in version `version` by hand (a later filing of the same set replaces it). */
export const withFiled = (file: ProductionFile, filed: Filed): ProductionFile => ({
  ...file,
  filed: [...file.filed.filter((f) => f.set !== filed.set), filed],
});

// ---------------------------------------------------------------------------
// The history, derived

/** A folder's path under its root: its ref without the root's label. */
export const setPathOf = (ref: string): string => ref.split('/').slice(1).join('/');

/** A set the lab lists, named for a timeline: the lab's ref, and the folder the ledger names it by. */
interface NamedSet {
  readonly ref: string;
  readonly folder: string;
}

/** A folder more than one root holds, with each ref that holds it. */
interface FolderInRoots {
  readonly folder: string;
  readonly refs: ReadonlyArray<string>;
}

/**
 * The set `given` names among the refs the lab lists: by its folder under
 * its root, as the ledger names a set, or else by its ref; none when it names
 * no listed set. A folder more than one root holds is refused, since a
 * timeline names a set by its folder alone and could not tell which.
 */
export const setNamed = (
  listed: ReadonlyArray<string>,
  given: string,
): Result.Result<Option.Option<NamedSet>, FolderInRoots> => {
  const holding = (folder: string) => listed.filter((ref) => setPathOf(ref) === folder);
  const folder = Option.getOrElse(
    Option.map(
      Option.liftPredicate(given, (g) => holding(g).length === 0 && listed.includes(g)),
      setPathOf,
    ),
    () => given,
  );
  const refs = holding(folder);
  if (refs.length > 1) return Result.fail({ folder, refs });
  return Result.succeed(Option.map(Arr.head(refs), (ref) => ({ ref, folder })));
};

/**
 * A question that waits on the owner: an ask no decision on its set, and no
 * pick or approval in its choice, has answered; with the set and the choice
 * it names, when the review holds them.
 */
export interface Waiting {
  readonly ask: Said;
  readonly folder: Option.Option<ReviewFolder>;
  readonly point: Option.Option<ChoicePoint>;
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
  /** The questions that wait on the owner, whenever asked (only the current version holds them). */
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

/** A decision of the owner's, as the ledger keeps it. */
export type Decided = Extract<Said, { readonly _tag: 'Decided' }>;

/**
 * The owner's decisions on `file`'s ledger, in its order (oldest first), in
 * chat or by an ask he answered: each with when it was filed (`at`), what it
 * is on (`set`, `point`), his words (`quote`) and, filed by an ask's answer,
 * the ask and his picks there. What an override cites (`style/override.ts`):
 * a question (`Asked`) is an agent's, and a note decides nothing.
 */
export const decisionsOf = (file: ProductionFile): ReadonlyArray<Decided> =>
  file.said.filter((s): s is Decided => s._tag === 'Decided');

/** The owner's decisions filed in version `version` (in chat, or an ask's answer), newest first. */
export const decisionsIn = (file: ProductionFile, version: number): ReadonlyArray<Decided> =>
  decisionsOf(file)
    .filter((d) => versionAt(file, d.at) === version)
    .toReversed();

/**
 * The move an agent makes on the owner's word: from version `after`, because
 * of the decision filed at `decision` in the version open now. Refused as
 * `moveForward` refuses when the production moved on (`VersionMoved`), when
 * that version holds no decision of his (`Undecided`), and when none of its
 * decisions was filed at `decision` (`DecisionUnknown`, naming those it holds).
 */
export const forwardOnDecision = (
  file: ProductionFile,
  move: { readonly after: number; readonly title: string; readonly decision: number },
): Result.Result<MoveForward, VersionMoved | Undecided | DecisionUnknown> => {
  const current = currentVersion(file);
  if (move.after !== current)
    return Result.fail(
      VersionMoved.make({ production: file.production, after: move.after, current }),
    );
  const decisions = decisionsIn(file, current);
  if (!Arr.isReadonlyArrayNonEmpty(decisions))
    return Result.fail(Undecided.make({ production: file.production, version: current }));
  return Option.match(
    Arr.findFirst(decisions, (d) => d.at === move.decision),
    {
      onNone: () =>
        Result.fail(
          DecisionUnknown.make({
            production: file.production,
            version: current,
            at: move.decision,
            held: decisions.map((d) => ({ at: d.at, text: d.text })),
          }),
        ),
      onSome: (decided) =>
        Result.succeed({
          after: move.after,
          title: move.title,
          because: Option.some(decided.text),
        }),
    },
  );
};

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

/**
 * Whether `said` is a decision on the set at `path` that covers `point` (one
 * on the set alone covers all its choices). An ask's answer is not: it
 * answers its own question, not the set.
 */
const decides = (said: Said, path: string, point: Option.Option<string>): boolean =>
  said._tag === 'Decided' &&
  Option.isNone(said.ask) &&
  Option.contains(said.set, path) &&
  Option.match(said.point, {
    onNone: () => true,
    onSome: (p) => Option.match(point, { onNone: () => false, onSome: (q) => q === p }),
  });

/**
 * Whether a decision on the set `ref` (a set's ref, `<root>/<folder>`, as an
 * ask names it) covering `point` was filed at or after `since`: what answers
 * a question about that choice, as `waitingIn` reads it.
 */
export const decidedSince = (
  said: ReadonlyArray<Said>,
  ref: string,
  point: Option.Option<string>,
  since: number,
): boolean => said.some((s) => s.at >= since && decides(s, setPathOf(ref), point));

/** The decision on `point` of the set at `path`, newest first, when there is one. */
const decisionOn = (said: ReadonlyArray<Said>, path: string, point: string): Option.Option<Said> =>
  Arr.findLast(said, (s) => decides(s, path, Option.some(point)));

/** Whether a variant of `point` is picked or approved. */
const pickedIn = (point: ChoicePoint): boolean =>
  point.variants.some((v) => v.approval === 'approved' || v.picked);

/**
 * The questions that wait on the owner: every ask in `said` that no later
 * decision on its set (and choice), nor a pick in its choice, nor (for an
 * ask's question) that ask's own answer or withdrawal, answers; with
 * the set and choice from `folders` when the review holds them.
 */
const waitingIn = (
  said: ReadonlyArray<Said>,
  folders: ReadonlyArray<ReviewFolder>,
): ReadonlyArray<Waiting> =>
  said.flatMap((ask) => {
    if (ask._tag !== 'Asked') return [];
    const path = Option.getOrElse(ask.set, () => '');
    const folder = Arr.findFirst(folders, (f) => setPathOf(f.ref) === path);
    const point = Option.flatMap(folder, (f) =>
      Arr.findFirst(f.sets, (p) => Option.contains(ask.point, p.id)),
    );
    const asked = askNamed(ask);
    const closesIt = (s: Said) =>
      s._tag !== 'Asked' && Option.isSome(asked) && Option.contains(s.ask, asked.value);
    const answered =
      said.some((s) => closesIt(s) || (s.at >= ask.at && decides(s, path, ask.point))) ||
      Option.exists(point, pickedIn);
    return [{ ask, folder, point }].filter(() => !answered);
  });

/** A choice's state on the timeline: picked, decided, asked and open, or none of these. */
export type ChoiceState = Data.TaggedEnum<{
  Picked: { readonly variants: ReadonlyArray<string> };
  Decided: { readonly variant: Option.Option<string> };
  Waiting: {};
  Quiet: {};
}>;
export const ChoiceState = Data.taggedEnum<ChoiceState>();

/** The state of `point` in `folder`, given the production's words and what waits. */
export const choiceStateOf = (
  folder: ReviewFolder,
  point: ChoicePoint,
  said: ReadonlyArray<Said>,
  waiting: ReadonlyArray<Waiting>,
): ChoiceState => {
  const picked = point.variants
    .filter((v) => v.approval === 'approved' || v.picked)
    .map((v) => v.label);
  if (picked.length > 0) return ChoiceState.Picked({ variants: picked });
  const decided = decisionOn(said, setPathOf(folder.ref), point.id);
  if (Option.isSome(decided)) return ChoiceState.Decided({ variant: decided.value.variant });
  const asked = waiting.some(
    (w) =>
      Option.exists(w.folder, (f) => f.ref === folder.ref) &&
      Option.contains(w.ask.point, point.id),
  );
  return Match.value(asked).pipe(
    Match.when(true, () => ChoiceState.Waiting()),
    Match.orElse(() => ChoiceState.Quiet()),
  );
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
  const waiting = waitingIn(file.said, folders);
  const versions = file.versions.map((opened, i): VersionView => {
    const n = i + 1;
    const mine = placed.filter((p) => p.n === n);
    const until = Option.map(Option.fromUndefinedOr(file.versions[n]), (next) => next.at);
    // A set's time is kept inside its version's span: a file touched since does not re-date it.
    const within = (at: number) =>
      Math.min(
        Math.max(at, opened.at),
        Option.getOrElse(until, () => Number.POSITIVE_INFINITY),
      );
    const entries = Arr.sort(
      [
        ...mine.map((p) =>
          Entry.Published({ at: within(publishedAt(p.folder)), folder: p.folder }),
        ),
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
      until,
      current: n === count,
      entries,
      waiting: waiting.filter(() => n === count),
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

/**
 * A film's board as a production's version shows it, its first stage: the
 * picture panels and how many keep a try, the beats and how many are
 * approved as they stand (`approvalOf`), and how many were approved on tries
 * changed since. Read from the film's `board.json` (`core/board.ts`); a text
 * panel (a card, a verse page) is the engine's and is not counted.
 */
export interface BoardStage {
  readonly panels: number;
  readonly kept: number;
  readonly beats: number;
  readonly approved: number;
  readonly stale: number;
}

/** `board`'s stage. */
export const boardStageOf = (board: BoardFile): BoardStage => {
  const pictures = board.panels.filter((p) => Option.isNone(Option.fromUndefinedOr(p.text)));
  const beats = Arr.dedupe(board.panels.map((p) => p.beat));
  const states = beats.map((beat) => approvalOf(board, beat));
  return {
    panels: pictures.length,
    kept: pictures.filter((p) => Option.isSome(Option.fromUndefinedOr(p.kept))).length,
    beats: beats.length,
    approved: states.filter((s) => s === 'approved').length,
    stale: states.filter((s) => s === 'stale').length,
  };
};
