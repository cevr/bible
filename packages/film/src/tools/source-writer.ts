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
// and make again what is made from it (the track remixed).

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
  UndoUnavailable,
} from '../core/refusals.ts';
import { FormatFailed, type NamedFileMissing, WriteUnverified } from './errors.ts';
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
  /** Every file `to` names and `from` does not, in place before `to` lands; why not, when one cannot be. */
  readonly bring: (from: string, to: string) => Effect.Effect<void, NamedFileMissing>;
  /** Every file `from` names and `to` does not, put away once `to` has landed. */
  readonly putAway: (from: string, to: string) => Effect.Effect<void, StoreError | PlatformError>;
  /** What is made from the text, made again once a text has landed; none when nothing is. */
  readonly remake: Option.Option<Effect.Effect<void, FreshProcessFailed>>;
}

/** One change to a film's source: its file's text before and after it. */
export interface Change {
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

/** A rewrite of one file, as a writer asks for it. */
interface Rewrite<E, A = void> {
  readonly film: string;
  readonly scene: Option.Option<string>;
  readonly file: string;
  readonly target: string;
  /** The new text, from the file's as it is now. */
  readonly edit: (source: string) => Result.Result<string, SourceRefused>;
  /** What of the change does not read back from the formatted text (none when it all does). */
  readonly verify: (after: string) => Result.Result<ReadonlyArray<string>, SourceRefused>;
  /** Refuse a text the film cannot play, or answer what the check found of it. */
  readonly check: (after: string) => Effect.Effect<A, E>;
}

export type RewriteError =
  | SourceRefused
  | FormatFailed
  | WriteUnverified
  | SourceChanged
  | StoreError;

/** What a film's changes are: those Undo may put back, and those Redo may make again. */
interface History {
  /** Oldest first; Undo takes the last. */
  readonly undos: ReadonlyArray<Change>;
  /** Oldest undo first; Redo takes the last. */
  readonly redos: ReadonlyArray<Change>;
  /** The latest change: a write, an undo (`undo …`) or a redo (`redo …`). */
  readonly latest: Option.Option<Change>;
}

/** The history as a page asks for it (`GET /api/films/<film>/check`). */
interface WriteHistory {
  /** The change Undo would put back. */
  readonly undo: Option.Option<Change>;
  /** The change Redo would make again. */
  readonly redo: Option.Option<Change>;
  readonly latest: Option.Option<Change>;
}

interface SourceWriterService {
  /** Rewrite one file as `rewrite` says: formatted, read back, checked, and only over the text it read. */
  readonly write: <E, A = void>(
    rewrite: Rewrite<E, A>,
  ) => Effect.Effect<readonly [Change, A], E | RewriteError>;
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
  /** Put `film`'s newest change back: its file as it was before it. */
  readonly undo: (film: string) => Effect.Effect<Change, UndoUnavailable | StoreError>;
  /** Make `film`'s newest undone change again. */
  readonly redo: (film: string) => Effect.Effect<Change, RedoUnavailable | StoreError>;
  /** What undo and redo would do now for `film`, and its latest change. */
  readonly history: (film: string) => Effect.Effect<WriteHistory>;
}

/** How many changes Undo can walk back, per film. Each holds its file's text before and after. */
export const UNDO_DEPTH = 50;

export const emptyHistory: History = { undos: [], redos: [], latest: Option.none() };

/** `h` after the change `c`: on top of the stack (the oldest past `depth` dropped), nothing to redo. */
export const recordChange = (h: History, c: Change, depth = UNDO_DEPTH): History => ({
  undos: [...h.undos, c].slice(-depth),
  redos: [],
  latest: Option.some(c),
});

/** The undo of `c`: its file from `c.after` back to `c.before`, named `undo <target>`. */
const undoneOf = (c: Change): Change => ({
  ...c,
  target: `undo ${c.target}`,
  before: c.after,
  after: c.before,
});

/** `c` made again: named `redo <target>`. */
const redoneOf = (c: Change): Change => ({ ...c, target: `redo ${c.target}` });

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
            const missed = Result.match(rewrite.verify(after), {
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
            const change: Change = {
              film: rewrite.film,
              scene: rewrite.scene,
              file,
              target,
              before,
              after,
              follows: Option.none(),
            };
            // Already so (a pick of the option playing): nothing to write, nothing to undo.
            if (after === before) {
              if ((yield* fs.readFileString(file)) !== before)
                return yield* SourceChanged.make({ file: shownIn(rewrite.film, file), target });
              return [change, checked] as const;
            }
            // Uninterruptible: the write may reload the page, which drops its
            // request; the file and the history must still agree once it lands.
            return yield* Effect.uninterruptible(
              Effect.gen(function* () {
                // Only over the very text the edit was made from.
                yield* swap(rewrite.film, file, before, after, target);
                yield* record(change, 'lab.write');
                return [change, checked] as const;
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

      /** What is made from `c`'s text made again once a text landed; a failure leaves it as it was made before, and is logged. */
      const remake = (c: Change) =>
        Option.match(
          Option.flatMap(c.follows, (follows) => follows.remake),
          {
            onNone: () => Effect.void,
            onSome: (made) =>
              made.pipe(
                Effect.catch((error) =>
                  Effect.logWarning(
                    `lab.remake.failed film=${c.film} target="${c.target}" reason=${error.message}`,
                  ),
                ),
              ),
          },
        );

      /**
       * `c`'s file from `from` to `to` (an undo or a redo), only while it is
       * `from` (else refused with `changed`), and what follows its text in
       * step: what `to` names is brought in first, and when one cannot be,
       * nothing lands; what only `from` named is put away after, and what is
       * made from the text made again. A swap that fails puts away again what
       * it brought.
       */
      const land = <E>(
        c: Change,
        from: string,
        to: string,
        changed: string,
        refused: (reason: string) => E,
      ) =>
        Effect.gen(function* () {
          yield* Option.match(c.follows, {
            onNone: () => Effect.void,
            onSome: (follows) =>
              Effect.mapError(follows.bring(from, to), (missing) =>
                refused(`${shown(c)} names ${missing.message}`),
              ),
          });
          yield* swap(c.film, c.file, from, to, c.target).pipe(
            Effect.catchTag('SourceChanged', () =>
              Effect.andThen(putAway(c, to, from), Effect.fail(refused(changed))),
            ),
          );
          yield* putAway(c, from, to);
          yield* remake(c);
        });

      const undo = (film: string) =>
        writer
          .withPermits(1)(
            Effect.uninterruptible(
              Effect.gen(function* () {
                const h = yield* historyOf(film);
                const top = Arr.last(h.undos);
                if (Option.isNone(top))
                  return yield* UndoUnavailable.make({
                    reason: `the lab has made no change to ${film} to undo`,
                  });
                const c = top.value;
                yield* land(
                  c,
                  c.after,
                  c.before,
                  `${shown(c)} has changed since the lab wrote ${c.target}`,
                  (reason) => UndoUnavailable.make({ reason }),
                );
                const undone = undoneOf(c);
                yield* setHistory(film, {
                  undos: h.undos.slice(0, -1),
                  redos: [...h.redos, c],
                  latest: Option.some(undone),
                });
                yield* Effect.log(
                  `lab.undo film=${film}${sceneLog(c)} target="${c.target}" file=${shown(c)}`,
                );
                return undone;
              }),
            ),
          )
          .pipe(Effect.withSpan('SourceWriter.undo'));

      const redo = (film: string) =>
        writer
          .withPermits(1)(
            Effect.uninterruptible(
              Effect.gen(function* () {
                const h = yield* historyOf(film);
                const top = Arr.last(h.redos);
                if (Option.isNone(top))
                  return yield* RedoUnavailable.make({
                    reason: `the lab has undone no change to ${film}`,
                  });
                const c = top.value;
                yield* land(
                  c,
                  c.before,
                  c.after,
                  `${shown(c)} has changed since the lab undid ${c.target}`,
                  (reason) => RedoUnavailable.make({ reason }),
                );
                const redone = redoneOf(c);
                yield* setHistory(film, {
                  undos: [...h.undos, c].slice(-UNDO_DEPTH),
                  redos: h.redos.slice(0, -1),
                  latest: Option.some(redone),
                });
                yield* Effect.log(
                  `lab.redo film=${film}${sceneLog(c)} target="${c.target}" file=${shown(c)}`,
                );
                return redone;
              }),
            ),
          )
          .pipe(Effect.withSpan('SourceWriter.redo'));

      const history = (film: string) =>
        Effect.map(historyOf(film), (h): WriteHistory => ({
          undo: Arr.last(h.undos),
          redo: Arr.last(h.redos),
          latest: h.latest,
        }));

      return SourceWriter.of({ write, around, undo, redo, history });
    }),
  );
}
