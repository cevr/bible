// The studio's edits of a version's script, as the page, the lab's routes and
// the MCP tools all make them: a beat moved before another (or to the end)
// and a beat's hold set, each one write of the version's `script.ts`
// through the SourceWriter (formatted, read back, only over the text it
// read), so the owner's edits and the agents' share one history; and Undo
// and Redo of the film's newest change, any writer's.
//
// A move is judged on the script as the writer's lock holds it (`editOrder`
// over `movedOrder`): its beats in order, the acts and the score's movements
// of the version's timeline as the lab reads it now (`FilmTimelines`) kept in
// their declared order. A hold starts from each beat's holds as laid out
// (`heldWithin`), and one that would change nothing the film plays is
// refused (`holdUnchanged`). The rest of the film follows the script on its
// next read: every later beat, its Board panels, its scene and the movements
// that start on it play where the new order and holds lay them.
//
// An edit of a film with a production files the agents' work on its ledger
// ("re-time, re-check seams, re-render") while it stands: once it lands, and
// again by its redo; its undo withdraws it (`Files`). What each edit says to
// the owner (`Edited.said`) is in his words, never a file's name.

import { Boolean as Bool, Clock, Context, Effect, Layer, Option, Path, Ref, Result } from 'effect';
import {
  AGENTS_AFTER,
  type HoldEdge,
  type MovedBefore,
  heldAlready,
  heldTo,
  heldWithin,
  heldWords,
  holdUnchanged,
  holdWritten,
  movedWords,
  stepped,
  workFiled,
} from '../core/beat-edit.ts';
import type { Said } from '../core/production.ts';
import { HoldUnchanged, SourceRefused } from '../core/refusals.ts';
import type { FilmTimeline, FilmVersion } from '../core/timeline-schema.ts';
import { onTheMs } from '../core/time.ts';
import { FilmFolder, type FilmName, filmNamed } from './film-repo.ts';
import { FilmTimelines, type TimelineError } from './film-timeline.ts';
import { ProductionStore } from './production-store.ts';
import {
  SCRIPT_FILE,
  editHold,
  editOrder,
  holdMissed,
  holdTarget,
  moveTarget,
  orderMissed,
} from './script-source.ts';
import {
  type Change,
  type Files,
  type RewriteError,
  type StepAsk,
  type StepError,
  SourceWriter,
  UNDO_DEPTH,
} from './source-writer.ts';

/** A move as it is asked: `beat` of version `version` (the open one when none) before `before` (the end when none), by `by`. */
interface MoveAsk {
  readonly film: string;
  readonly version: Option.Option<number>;
  readonly beat: string;
  readonly before: MovedBefore;
  /** Who asks: `the studio` for the page, an agent's name for its tools. */
  readonly by: string;
}

/** A hold as it is asked: `beat`'s `edge` held `seconds` (snapped and kept inside its floors). */
interface HoldAsk {
  readonly film: string;
  readonly version: Option.Option<number>;
  readonly beat: string;
  readonly edge: HoldEdge;
  readonly seconds: number;
  readonly by: string;
}

/** An edit as it answers: the change it made (none when the script was already so), what it set, and what it says to the owner. */
export interface Edited {
  readonly change: Option.Option<Change>;
  readonly target: string;
  readonly said: string;
}

/** Why an edit did not land: the film, the version or its timeline does not read, the edit is refused, or the write is. */
type EditError = TimelineError | RewriteError | SourceRefused | HoldUnchanged;

interface BeatEditsService {
  readonly move: (ask: MoveAsk) => Effect.Effect<Edited, EditError>;
  readonly hold: (ask: HoldAsk) => Effect.Effect<Edited, EditError>;
  /** Undo the film's newest change (or Redo its newest undone one), any writer's; asked for one change, only that one (`StepAsk`). */
  readonly step: (
    verb: 'undo' | 'redo',
    film: string,
    ask: StepAsk,
  ) => Effect.Effect<Edited, StepError | EditError>;
}

/** Who files the page's edits on the ledger. */
export const STUDIO_BY = 'the studio';

/** The script of `version`: its own folder's (`v<n>/script.ts`), else the film's own; refused for a version a later one replaced in place. */
const scriptOf = (
  dir: string,
  version: FilmVersion,
  target: string,
  join: (...parts: ReadonlyArray<string>) => string,
): Result.Result<string, SourceRefused> => {
  if (version.files === 'folder') return Result.succeed(join(dir, `v${version.n}`, SCRIPT_FILE));
  if (version.files === 'film') return Result.succeed(join(dir, SCRIPT_FILE));
  return Result.fail(
    SourceRefused.make({
      file: SCRIPT_FILE,
      target,
      reason: `version ${version.n} keeps no script of its own: a later version replaced it in place`,
    }),
  );
};

type Lane = FilmTimeline['lanes'][number];

const isScript = (l: Lane): l is Extract<Lane, { readonly track: 'script' }> =>
  l.track === 'script';
const isSound = (l: Lane): l is Extract<Lane, { readonly track: 'sound' }> => l.track === 'sound';

/** The script lane's clips of `timeline`: its beats in order. */
const scriptClips = (timeline: FilmTimeline) =>
  timeline.lanes.filter(isScript).flatMap((l) => l.clips);

/** The parts a move must keep in order: the acts, and the score's movements, each as declared. */
const partsOf = (timeline: FilmTimeline) => [
  timeline.bands.map((b) => ({ from: b.from, name: b.name })),
  timeline.lanes
    .filter(isSound)
    .flatMap((l) => l.clips)
    .map((c) => ({ from: c.from, name: c.movement })),
];

/** What each film's studio changes said, by the change's id, oldest first. */
type Words = ReadonlyMap<string, ReadonlyMap<string, string>>;

/**
 * `all` with `film`'s change `id` saying `said`. A film keeps the words of its
 * newest UNDO_DEPTH changes: an older one has as many newer changes above it,
 * so its history no longer holds it.
 */
const wordsKept = (all: Words, film: string, id: string, said: string): Words => {
  const own = Option.getOrElse(
    Option.fromUndefinedOr(all.get(film)),
    (): ReadonlyMap<string, string> => new Map(),
  );
  return new Map([...all, [film, new Map([...own, [id, said] as const].slice(-UNDO_DEPTH))]]);
};

/** What a step's change set, without the step's own `undo `/`redo `. */
const setBy = (target: string) => target.replace(/^(undo|redo) /, '');

export class BeatEdits extends Context.Service<BeatEdits, BeatEditsService>()(
  '@bible/film/tools/BeatEdits',
) {
  static readonly layer = Layer.effect(
    BeatEdits,
    Effect.gen(function* () {
      const path = yield* Path.Path;
      const folder = yield* FilmFolder;
      const timelines = yield* FilmTimelines;
      const writer = yield* SourceWriter;
      const productions = yield* ProductionStore;
      const films = yield* Effect.context<FilmFolder>();
      // What each change of the studio's said, by its film and its id: what its Undo and Redo say.
      const words = yield* Ref.make<Words>(new Map());

      /**
       * The agents' work `said` asks for, on `production`'s ledger while the
       * change stands: one note, filed by `by` at `at`, withdrawn by its text,
       * time and filer. None for a film with no production.
       */
      const filing = (production: Option.Option<string>, said: string, by: string, at: number) =>
        Option.map(production, (p): Files => {
          const text = workFiled(said);
          const note: Said = {
            _tag: 'Noted',
            at,
            text,
            quote: Option.none(),
            set: Option.none(),
            point: Option.none(),
            variant: Option.none(),
            ask: Option.none(),
            by: Option.some(by),
          };
          const isIt = (s: Said) =>
            s._tag === 'Noted' && s.at === at && s.text === text && Option.contains(s.by, by);
          return {
            file: Effect.asVoid(
              productions.modify(p, (current) =>
                Result.succeed({
                  ...current,
                  said: [...current.said.filter((s) => !isIt(s)), note].sort((a, b) => a.at - b.at),
                }),
              ),
            ),
            withdraw: Effect.asVoid(
              productions.modify(p, (current) =>
                Result.succeed({ ...current, said: current.said.filter((s) => !isIt(s)) }),
              ),
            ),
          };
        });

      /** `film`'s timeline at `version`, and the script file that version plays. */
      const versionOf = Effect.fn('BeatEdits.versionOf')(function* (
        film: FilmName,
        version: Option.Option<number>,
        target: string,
      ) {
        const timeline = yield* timelines.timeline(film, version);
        const file = yield* Effect.fromResult(
          scriptOf(folder.paths(film).dir, timeline.version, target, (...parts) =>
            path.join(...parts),
          ),
        );
        return { timeline, file };
      });

      /** One rewrite of `file`, filing its work, its words kept for its Undo. */
      const written = Effect.fn('BeatEdits.written')(function* (
        film: FilmName,
        timeline: FilmTimeline,
        at: {
          readonly file: string;
          readonly beat: string;
          readonly target: string;
          readonly said: string;
          /** What it says when the script is already so. */
          readonly already: string;
          readonly by: string;
        },
        edit: (source: string) => Result.Result<string, SourceRefused>,
        verify: (
          after: string,
          before: string,
        ) => Result.Result<ReadonlyArray<string>, SourceRefused>,
      ) {
        const now = yield* Clock.currentTimeMillis;
        const files = filing(Option.fromUndefinedOr(timeline.production), at.said, at.by, now);
        const [change] = yield* writer.write({
          film,
          scene: Option.some(at.beat),
          file: at.file,
          target: at.target,
          edit,
          verify,
          // The agents re-check what an edit leaves: the page is not held on a fresh check.
          check: () => Effect.void,
          ...Option.match(files, { onNone: () => ({}), onSome: (f) => ({ files: f }) }),
        });
        yield* Option.match(change, {
          onNone: () => Effect.void,
          onSome: (c) => Ref.update(words, (all) => wordsKept(all, film, c.id, at.said)),
        });
        yield* Effect.logInfo(
          `[studio] edit film=${film} target="${at.target}" by="${at.by}" landed=${Option.isSome(change)}`,
        );
        const said = Option.match(change, {
          onNone: () => at.already,
          onSome: () => `${at.said} ${AGENTS_AFTER}`,
        });
        return { change, target: at.target, said } satisfies Edited;
      });

      const move = Effect.fn('BeatEdits.move')(function* (ask: MoveAsk) {
        const film = yield* filmNamed(ask.film).pipe(Effect.provideContext(films));
        const target = moveTarget(ask.beat, ask.before);
        const { timeline, file } = yield* versionOf(film, ask.version, target);
        const parts = partsOf(timeline);
        return yield* written(
          film,
          timeline,
          {
            file,
            beat: ask.beat,
            target,
            said: movedWords(ask.beat, ask.before),
            already: `${ask.beat} is already there.`,
            by: ask.by,
          },
          // Judged on the script as the writer's lock holds it, its parts kept.
          (source) => editOrder(source, ask.beat, ask.before, parts),
          (after, before) => orderMissed(after, before, ask.beat, ask.before),
        );
      });

      const hold = Effect.fn('BeatEdits.hold')(function* (ask: HoldAsk) {
        const film = yield* filmNamed(ask.film).pipe(Effect.provideContext(films));
        const target = holdTarget(ask.beat, ask.edge);
        const { timeline, file } = yield* versionOf(film, ask.version, target);
        const clip = yield* Effect.fromOption(
          Option.fromUndefinedOr(scriptClips(timeline).find((c) => c.beat === ask.beat)),
        ).pipe(
          Effect.mapError(() =>
            SourceRefused.make({
              file: SCRIPT_FILE,
              target,
              reason: `the script has no beat "${ask.beat}"`,
            }),
          ),
        );
        const now = onTheMs(clip.hold[ask.edge]);
        const value = heldWithin(ask.edge, ask.seconds, now);
        yield* Option.match(holdUnchanged(clip, ask.edge, value), {
          onNone: () => Effect.void,
          onSome: (reason) => HoldUnchanged.make({ beat: ask.beat, edge: ask.edge, reason }),
        });
        const as = holdWritten(ask.edge, value);
        // A hold laid out where it is asked, and not declared, is already so: nothing to write.
        const already = value === now && !clip.hold.declared.includes(ask.edge);
        return yield* written(
          film,
          timeline,
          {
            file,
            beat: ask.beat,
            target,
            // What plays: a min may take some of a tail's change.
            said: heldWords(ask.beat, ask.edge, now, heldTo(clip, ask.edge, value).hold[ask.edge]),
            already: heldAlready(ask.beat, ask.edge, value),
            by: ask.by,
          },
          (source) =>
            Bool.match(already, {
              onTrue: () => Result.succeed(source),
              onFalse: () => editHold(source, ask.beat, ask.edge, as),
            }),
          (after) =>
            Bool.match(already, {
              onTrue: () => Result.succeed<ReadonlyArray<string>>([]),
              onFalse: () => holdMissed(after, ask.beat, ask.edge, as),
            }),
        );
      });

      const step = Effect.fn('BeatEdits.step')(function* (
        verb: 'undo' | 'redo',
        name: string,
        ask: StepAsk,
      ) {
        const film = yield* filmNamed(name).pipe(Effect.provideContext(films));
        const [change] = yield* writer.step(verb, film, ask);
        const kept = Option.flatMap(
          Option.fromUndefinedOr((yield* Ref.get(words)).get(film)),
          (own) => Option.fromUndefinedOr(own.get(change.id)),
        );
        const said = Option.getOrElse(kept, () => `${setBy(change.target)}.`);
        yield* Effect.logInfo(`[studio] ${verb} film=${film} target="${change.target}"`);
        return {
          change: Option.some(change),
          target: change.target,
          said: stepped(verb, said),
        } satisfies Edited;
      });

      return BeatEdits.of({ move, hold, step });
    }),
  );
}
