// Every write the lab and the review make to a film's source, and their undo:
// a scene's cue or knob (SceneWriter), a score's pick in `sound.ts`, and a
// library sound's takes kept or rejected in `library.lock.json` (Choices).
//
// A write re-reads the file (the modules this process imported are as they
// were at start), makes the new text (`edit`), formats it with oxfmt through
// its stdin, and reads what it meant to change back from the formatted text
// (`verify`); `check` may still refuse a text the film cannot play. Only then
// does it touch the file, and only if the file is still the text the edit was
// made from (an editor may have saved it since): then it writes the file whole
// (a partial file renamed into place), else it fails as `SourceChanged` and
// writes nothing. So a failed write never changes the file, and there is
// nothing to put back. A change a service makes its own way (the library's
// lock, rewritten by its store) is recorded `around` it: the file's text
// before and after, the same way.
//
// Every write (a write, the formatting `around` leaves, an undo, a redo) is
// a compare and swap under the file's store lock (`swap`): the comparison and
// the write hold the lock other processes' store writes take (`sfx make` on
// the library's lock, say), so none lands between them and is lost.
//
// Writes, undos and redos run one at a time. Each film keeps its own bounded
// stack (UNDO_DEPTH): Undo puts back the newest change still on it, byte for
// byte, and Redo makes the newest undone one again; each only while the file
// is exactly as the step it reverses left it. A new change drops what could
// be redone. A change whose text other files follow (the timings name each
// beat's take, which lives beside them in `narration/`, and the track is
// mixed from them) carries them (`Follows`): Undo and Redo bring back what
// the text they land names before it lands, and refuse when one cannot be,
// then put away what only the text they replaced named (nothing is deleted)
// and make again what is made from it (the track remixed). The check, the
// bringing back, the write and the putting away all hold the file's store
// lock (`land`), so a narrate's sweep in another process, which takes it too,
// never puts away a take an Undo is naming, and a refused one touches nothing.
//
// Each change has an id no other has (`Change.id`), kept by its undo and its
// redo. An Undo or a Redo asked for one change (a receipt's, by the id its
// write answered) steps only that change: when another stands before it on
// the stack, or it is gone from the history, it is refused (`StepNotNewest`)
// and nothing is written. One asked for no change steps the newest.

import {
  Array as Arr,
  Context,
  Duration,
  Effect,
  FileSystem,
  Layer,
  Option,
  Path,
  Ref,
  Result,
  Schema,
  Semaphore,
  Stream,
} from 'effect';
import { ChildProcess, ChildProcessSpawner } from 'effect/process';
import { ContentStore, type StoreError } from './content-store.ts';
import {
  type FreshProcessFailed,
  RedoUnavailable,
  SourceChanged,
  type SourceRefused,
  StepNotNewest,
  UndoUnavailable,
  newerFirst,
} from '../core/refusals.ts';
import { uniqueId } from '../core/unique.ts';
import {
  FormatFailed,
  type NamedFileMissing,
  type TakeAmbiguous,
  WriteUnverified,
} from './errors.ts';
import type { PlatformError } from 'effect/PlatformError';
import { FilmFolder } from './film-repo.ts';
import { collectWithin } from './process.ts';

/**
 * What follows a recorded file's text, kept in step with it by Undo and Redo:
 * the files it names (a take the timings name) and what is made from it (the
 * track mixed from the takes). Before Undo or Redo lands a text, what it names
 * is brought back beside it; once it has landed, what only the text it
 * replaced named is put away, and what is made from it is made again.
 * Nothing is deleted on either side.
 */
export interface Follows {
  /**
   * Every file `to` names and `from` does not, in place before `to` lands, as
   * the very file it named (a take by the audio its name hashes); why not,
   * when one cannot be, or which copies it might be when that is not known.
   */
  readonly bring: (
    from: string,
    to: string,
  ) => Effect.Effect<void, NamedFileMissing | TakeAmbiguous>;
  /** Every file `from` names and `to` does not, put away once `to` has landed. */
  readonly putAway: (from: string, to: string) => Effect.Effect<void, StoreError | PlatformError>;
  /**
   * What is made from the text, made again once a text has landed, answering
   * when what it made landed (`Remade`); none when nothing is made.
   */
  readonly remake: Option.Option<Effect.Effect<Remade, FreshProcessFailed>>;
}

/**
 * When what a remake made landed: the mtime its file took (the track a mix
 * renames into place, a new mtime each mix), so whoever hears that file
 * change can name this very landing and no later one. None when it landed
 * nothing: no remake, one that failed, or a file not there after it.
 */
export type Remade = Option.Option<number>;

/** One change to a film's source: its file's text before and after it. */
export interface Change {
  /** An id no other change has, kept by its undo and its redo: what a receipt's Undo asks for. */
  readonly id: string;
  readonly film: string;
  /** The scene it changed; none for a film's own file (its score's pick, the library's lock). */
  readonly scene: Option.Option<string>;
  readonly file: string;
  /** What changed, e.g. `cue topple offset,dur`, `knob palm`, `score play piano`. */
  readonly target: string;
  readonly before: string;
  readonly after: string;
  /** What follows the text, which Undo and Redo keep in step with it; none for a text nothing follows. */
  readonly follows: Option.Option<Follows>;
}

/**
 * One write as its answer names it: the scene and file it rewrote, what it
 * set, and the change it made (none when the file was already so).
 */
export interface Wrote {
  readonly scene: Option.Option<string>;
  readonly file: string;
  readonly target: string;
  readonly change: Option.Option<Change>;
}

/** A rewrite of one file, as a writer asks for it. */
interface Rewrite<E, A = void> {
  readonly film: string;
  readonly scene: Option.Option<string>;
  readonly file: string;
  readonly target: string;
  /** The new text, from the file's as it is now. */
  readonly edit: (source: string) => Result.Result<string, SourceRefused>;
  /**
   * What of the change does not read back from the formatted text `after`
   * (none when it all does), judged against `before`, the text it was made from.
   */
  readonly verify: (
    after: string,
    before: string,
  ) => Result.Result<ReadonlyArray<string>, SourceRefused>;
  /** Refuse a text the film cannot play, or answer what the check found of it. */
  readonly check: (after: string) => Effect.Effect<A, E>;
  /**
   * What follows the text (the track mixed from `sound.ts`): made again once
   * the write lands, as Undo and Redo make it again once theirs do. None
   * when nothing does.
   */
  readonly follows?: Follows;
}

export type RewriteError =
  | SourceRefused
  | FormatFailed
  | WriteUnverified
  | SourceChanged
  | StoreError;

/** An Undo or a Redo that landed (`undo …`, `redo …`), and the id of the request that asked for it. */
interface LandedStep {
  readonly request: string;
  readonly step: Change;
}

/** What a film's changes are: those Undo may put back, and those Redo may make again. */
interface History {
  /** Oldest first; Undo takes the last. */
  readonly undos: ReadonlyArray<Change>;
  /** Oldest undo first; Redo takes the last. */
  readonly redos: ReadonlyArray<Change>;
  /** The latest change: a write, an undo (`undo …`) or a redo (`redo …`). */
  readonly latest: Option.Option<Change>;
  /** The Undos and Redos asked for with a request's id that landed, oldest first (UNDO_DEPTH of them). */
  readonly landed: ReadonlyArray<LandedStep>;
}

/** The history as a page asks for it (`GET /api/films/<film>/check`). */
interface WriteHistory {
  /** The change Undo would put back. */
  readonly undo: Option.Option<Change>;
  /** The change Redo would make again. */
  readonly redo: Option.Option<Change>;
  readonly latest: Option.Option<Change>;
  readonly landed: ReadonlyArray<LandedStep>;
}

interface SourceWriterService {
  /**
   * Rewrite one file as `rewrite` says: formatted, read back, checked, and
   * only over the text it read; with what follows it made again, and when
   * that landed. Answers the change it made, none when the file was already
   * so (nothing written, nothing to undo), as `around` does.
   */
  readonly write: <E, A = void>(
    rewrite: Rewrite<E, A>,
  ) => Effect.Effect<readonly [Option.Option<Change>, A, Remade], E | RewriteError>;
  /**
   * `act`, which rewrites `file` its own way, recorded as one change of
   * `film`'s: the file's text before it and after it, and what follows that
   * text (`follows`: the act keeps it in step itself; Undo and Redo do it
   * after). Nothing is recorded when the file is as it was.
   */
  readonly around: <A, E, R>(
    film: string,
    file: string,
    target: string,
    act: Effect.Effect<A, E, R>,
    follows?: Follows,
  ) => Effect.Effect<readonly [A, Option.Option<Change>], E | StoreError | FormatFailed, R>;
  /**
   * Undo `film`'s newest change (its file as it was before it), or Redo its
   * newest undone one (made again). Asked with a request's id, the step is
   * recorded under it once it lands (`WriteHistory.landed`); asked for one
   * change, it is refused unless that change is the newest (`StepAsk`).
   * Answers the step, and when what follows its text, made again, landed.
   */
  readonly step: (verb: StepVerb, film: string, ask?: StepAsk) => Effect.Effect<Stepped, StepError>;
  /** What undo and redo would do now for `film`, and its latest change. */
  readonly history: (film: string) => Effect.Effect<WriteHistory>;
}

/**
 * How an Undo or a Redo is asked for: under a request's id (recorded once it
 * lands), and for one change (`change`, its id: a receipt's), stepped only
 * while it is the one the step would take; with none, the newest.
 */
export interface StepAsk {
  readonly request?: string;
  readonly change?: string;
}

/** An Undo or a Redo. */
type StepVerb = 'undo' | 'redo';

/** A step that landed, and when what follows its text, made again, landed. */
type Stepped = readonly [Change, Remade];

/** Why a step did not land: nothing to take, not the change asked for, or the store. */
type StepError = UndoUnavailable | RedoUnavailable | StepNotNewest | StoreError;

/** How many changes Undo can walk back, per film. Each holds its file's text before and after. */
const UNDO_DEPTH = 50;

const emptyHistory: History = {
  undos: [],
  redos: [],
  latest: Option.none(),
  landed: [],
};

/** `h` after the change `c`: on top of the stack (the oldest past UNDO_DEPTH dropped), nothing to redo. */
const recordChange = (h: History, c: Change): History => ({
  ...h,
  undos: [...h.undos, c].slice(-UNDO_DEPTH),
  redos: [],
  latest: Option.some(c),
});

/** `landed` with `step` recorded under `request`, when it was asked with one (the oldest past UNDO_DEPTH dropped). */
const landedWith = (
  landed: ReadonlyArray<LandedStep>,
  request: Option.Option<string>,
  step: Change,
): ReadonlyArray<LandedStep> =>
  Option.match(request, {
    onNone: () => landed,
    onSome: (id) => [...landed, { request: id, step }].slice(-UNDO_DEPTH),
  });

/**
 * Whether a step of `verb` may take `top` (the newest of `stack`) when asked
 * for change `asked`: yes when nothing was asked or it is `top`; else why not,
 * as `StepNotNewest`: another change came after it, or it is not in `stack`.
 */
const stepFits = (
  verb: StepVerb,
  stack: ReadonlyArray<Change>,
  top: Change,
  asked: Option.Option<string>,
): Result.Result<void, StepNotNewest> => {
  if (Option.isNone(asked) || asked.value === top.id) return Result.void;
  const standing = stack.some((c) => c.id === asked.value);
  if (standing)
    return Result.fail(StepNotNewest.make({ verb, reason: newerFirst(verb, top.target) }));
  const gone = { undo: 'changes', redo: 'undone changes' }[verb];
  return Result.fail(StepNotNewest.make({ verb, reason: `it is no longer in the film's ${gone}` }));
};

/**
 * What each step does: the stack it takes the newest change `c` of and the
 * one it puts `c` on, the text it lands `c`'s file from and to, the change
 * it records (`undo <target>`, its file from `c.after` back to `c.before`;
 * `redo <target>`, `c` made again), and its refusals.
 */
const STEPS = {
  undo: {
    takes: 'undos',
    gives: 'redos',
    from: (c: Change) => c.after,
    to: (c: Change) => c.before,
    made: (c: Change): Change => ({
      ...c,
      target: `undo ${c.target}`,
      before: c.after,
      after: c.before,
    }),
    changed: 'wrote',
    nothing: (film: string) => `the lab has made no change to ${film} to undo`,
    unavailable: (reason: string) => UndoUnavailable.make({ reason }),
  },
  redo: {
    takes: 'redos',
    gives: 'undos',
    from: (c: Change) => c.before,
    to: (c: Change) => c.after,
    made: (c: Change): Change => ({ ...c, target: `redo ${c.target}` }),
    changed: 'undid',
    nothing: (film: string) => `the lab has undone no change to ${film}`,
    unavailable: (reason: string) => RedoUnavailable.make({ reason }),
  },
} as const;

/**
 * The longest oxfmt may take on one file. Writes run one at a time, so a hung
 * oxfmt would hold every later write: past this it is stopped and the write
 * fails with the file untouched.
 */
export const FORMAT_LIMIT = Duration.seconds(20);

const sceneLog = (c: Change) =>
  Option.match(c.scene, { onNone: () => '', onSome: (scene) => ` scene=${scene}` });

export class SourceWriter extends Context.Service<SourceWriter, SourceWriterService>()(
  '@bible/film/tools/SourceWriter',
) {
  static readonly layer = Layer.effect(
    SourceWriter,
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const repo = yield* FilmFolder;
      const store = yield* ContentStore;
      const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
      const writer = yield* Semaphore.make(1);
      const histories = yield* Ref.make(new Map<string, History>());

      const historyOf = (film: string) =>
        Effect.map(Ref.get(histories), (all) =>
          Option.getOrElse(Option.fromUndefinedOr(all.get(film)), () => emptyHistory),
        );
      const setHistory = (film: string, h: History) =>
        Ref.update(histories, (all) => new Map([...all, [film, h]]));

      /**
       * `next` as the file, whole, only while it is still `expected`: read and
       * written under the file's store lock, so no other writer lands between.
       * Fails as `SourceChanged` (`target` naming the write) and writes nothing
       * when the file is not `expected`.
       */
      const swap = (film: string, file: string, expected: string, next: string, target: string) =>
        store.modify({ file, codec: Schema.String, empty: '' }, (now) => {
          if (now !== expected)
            return Result.fail(SourceChanged.make({ file: shownIn(film, file), target }));
          return Result.succeed(next);
        });

      /** A file of `film`'s as a refusal, an answer and the log name it: relative to its folder, never a path on the box. */
      const shownIn = (film: string, file: string) => path.relative(repo.paths(film).dir, file);

      /** A change's file as the log names it. */
      const shown = (c: Change) => shownIn(c.film, c.file);

      /**
       * `text` as oxfmt formats it for `file`, through its stdin: the file is
       * not touched. Run from the file's folder, so oxfmt finds the config the
       * file is formatted with.
       */
      const format = (film: string, file: string, text: string) =>
        collectWithin(
          spawner,
          'oxfmt',
          ChildProcess.make('bunx', ['oxfmt', `--stdin-filepath=${file}`], {
            cwd: path.dirname(file),
            stdin: Stream.make(new TextEncoder().encode(text)),
          }),
          FORMAT_LIMIT,
        ).pipe(
          Effect.mapError((error) =>
            FormatFailed.make({ file: shownIn(film, file), reason: error.message }),
          ),
          Effect.flatMap((done) => {
            if (done.exitCode === 0) return Effect.succeed(done.stdout);
            return Effect.fail(
              FormatFailed.make({
                file: shownIn(film, file),
                reason: `${done.stderr}${done.stdout}`.trim(),
              }),
            );
          }),
        );

      /** Record `c` as `c.film`'s newest change, and log it as `event`. */
      const record = (c: Change, event: string) =>
        Effect.gen(function* () {
          yield* setHistory(c.film, recordChange(yield* historyOf(c.film), c));
          yield* Effect.log(
            `${event} film=${c.film}${sceneLog(c)} target="${c.target}" file=${shown(c)}`,
          );
        });

      const write = <E, A = void>(rewrite: Rewrite<E, A>) =>
        writer.withPermits(1)(
          Effect.gen(function* () {
            const { file, target } = rewrite;
            const before = yield* fs.readFileString(file);
            const next = yield* Effect.fromResult(rewrite.edit(before));
            const after = yield* format(rewrite.film, file, next);
            const missed = Result.match(rewrite.verify(after, before), {
              onFailure: (e) => [e.reason],
              onSuccess: (m) => m,
            });
            if (missed.length > 0)
              return yield* WriteUnverified.make({
                file: shownIn(rewrite.film, file),
                target,
                reason: missed.join(', '),
              });
            const checked = yield* rewrite.check(after);
            // Already so (a pick of the option playing): nothing to write, nothing to undo.
            if (after === before) {
              if ((yield* fs.readFileString(file)) !== before)
                return yield* SourceChanged.make({ file: shownIn(rewrite.film, file), target });
              return [Option.none<Change>(), checked, Option.none<number>()] as const;
            }
            const change: Change = {
              id: yield* uniqueId,
              film: rewrite.film,
              scene: rewrite.scene,
              file,
              target,
              before,
              after,
              follows: Option.fromUndefinedOr(rewrite.follows),
            };
            // Uninterruptible: the write may reload the page, which drops its
            // request; the file and the history must still agree once it lands.
            return yield* Effect.uninterruptible(
              Effect.gen(function* () {
                // Only over the very text the edit was made from.
                yield* swap(rewrite.film, file, before, after, target);
                yield* record(change, 'lab.write');
                // Made again from the text that landed, once the history names it.
                const remade = yield* remake(change);
                return [Option.some(change), checked, remade] as const;
              }),
            );
          }),
        );

      /**
       * The file as oxfmt leaves `acted`, written only over `acted` itself: a
       * write another process made since stays (unformatted), and the act's
       * own text is what it left. Answers the text the act's change ends at.
       */
      const formattedOver = (film: string, file: string, acted: string, target: string) =>
        Effect.gen(function* () {
          const formatted = yield* format(film, file, acted);
          if (formatted === acted) return acted;
          return yield* swap(film, file, acted, formatted, target).pipe(
            Effect.as(formatted),
            Effect.catchTag('SourceChanged', () => Effect.succeed(acted)),
          );
        });

      const around = <A, E, R>(
        film: string,
        file: string,
        target: string,
        act: Effect.Effect<A, E, R>,
        follows?: Follows,
      ) =>
        writer.withPermits(1)(
          Effect.uninterruptible(
            Effect.gen(function* () {
              const before = yield* fs.readFileString(file);
              const done = yield* act;
              // Left as the formatter leaves it, as every lab write is: the act's own
              // writer (the library's lock) need not format as the repository does.
              const acted = yield* fs.readFileString(file);
              const after = yield* formattedOver(film, file, acted, target);
              if (after === before) return [done, Option.none<Change>()] as const;
              const change: Change = {
                id: yield* uniqueId,
                film,
                scene: Option.none(),
                file,
                target,
                before,
                after,
                follows: Option.fromUndefinedOr(follows),
              };
              yield* record(change, 'lab.write');
              return [done, Option.some(change)] as const;
            }),
          ),
        );

      /** What only `from` named put away once `to` landed; a failure leaves a file the text no longer names, and is logged. */
      const putAway = (c: Change, from: string, to: string) =>
        Option.match(c.follows, {
          onNone: () => Effect.void,
          onSome: (follows) =>
            follows
              .putAway(from, to)
              .pipe(
                Effect.catch((error) =>
                  Effect.logWarning(
                    `lab.named.put-away.failed film=${c.film} target="${c.target}" reason=${error.message}`,
                  ),
                ),
              ),
        });

      /**
       * What is made from `c`'s text made again once a text landed, and when
       * it landed; a failure leaves it as it was made before, landing nothing,
       * and is logged.
       */
      const remake = (c: Change): Effect.Effect<Remade> =>
        Option.match(
          Option.flatMap(c.follows, (follows) => follows.remake),
          {
            onNone: () => Effect.succeedNone,
            onSome: (made) =>
              made.pipe(
                Effect.catch((error) =>
                  Effect.as(
                    Effect.logWarning(
                      `lab.remake.failed film=${c.film} target="${c.target}" reason=${error.message}`,
                    ),
                    Option.none<number>(),
                  ),
                ),
              ),
          },
        );

      /**
       * `c`'s file from `from` to `to` (an undo or a redo), only while it is
       * `from` (else refused with `changed`, and nothing is touched), and what
       * follows its text in step: what `to` names is brought in first, and
       * when one cannot be, nothing lands; what only `from` named is put away
       * after. All of it holds the file's store lock, the one every change of
       * it takes in any process (a narrate's timings, a sweep putting away a
       * take they do not name), so the text it is checked against is the text
       * it replaces, and nothing put away is a file a text landed meanwhile
       * names. What is made from the text is made again after (`remake`),
       * outside it, once the history says the step landed: a page that had
       * no answer by then asks the history whether it did.
       */
      const land = <E>(
        c: Change,
        from: string,
        to: string,
        changed: string,
        refused: (reason: string) => E,
      ) =>
        store.holding(
          c.file,
          Effect.gen(function* () {
            const now = yield* store.read({ file: c.file, codec: Schema.String, empty: '' });
            if (now !== from) return yield* Effect.fail(refused(changed));
            yield* Option.match(c.follows, {
              onNone: () => Effect.void,
              onSome: (follows) =>
                Effect.mapError(follows.bring(from, to), (missing) =>
                  refused(`${shown(c)} names ${missing.message}`),
                ),
            });
            yield* store.writeFile(c.file, new TextEncoder().encode(to));
            yield* putAway(c, from, to);
          }),
        );

      const step = (verb: StepVerb, film: string, { request, change }: StepAsk = {}) =>
        writer
          .withPermits(1)(
            Effect.uninterruptible(
              Effect.gen(function* () {
                const way = STEPS[verb];
                const h = yield* historyOf(film);
                const stack = h[way.takes];
                const top = Arr.last(stack);
                if (Option.isNone(top)) return yield* way.unavailable(way.nothing(film));
                const c = top.value;
                yield* Effect.fromResult(stepFits(verb, stack, c, Option.fromUndefinedOr(change)));
                yield* land(
                  c,
                  way.from(c),
                  way.to(c),
                  `${shown(c)} has changed since the lab ${way.changed} ${c.target}`,
                  (reason): UndoUnavailable | RedoUnavailable => way.unavailable(reason),
                );
                const made = way.made(c);
                yield* setHistory(film, {
                  ...h,
                  [way.takes]: stack.slice(0, -1),
                  [way.gives]: [...h[way.gives], c].slice(-UNDO_DEPTH),
                  latest: Option.some(made),
                  landed: landedWith(h.landed, Option.fromUndefinedOr(request), made),
                });
                yield* Effect.log(
                  `lab.${verb} film=${film}${sceneLog(c)} target="${c.target}" file=${shown(c)}`,
                );
                const remade = yield* remake(c);
                return [made, remade] as const;
              }),
            ),
          )
          .pipe(Effect.withSpan(`SourceWriter.${verb}`));

      const history = (film: string) =>
        Effect.map(historyOf(film), (h): WriteHistory => ({
          undo: Arr.last(h.undos),
          redo: Arr.last(h.redos),
          latest: h.latest,
          landed: h.landed,
        }));

      return SourceWriter.of({ write, around, step, history });
    }),
  );
}
