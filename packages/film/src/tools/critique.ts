// The critique (`film lab critique`, the lab's `critique` tool): each figure a
// match held against its concept, shown to a fresh model at 1:1 beside the
// match's flagged rows and the house rules' figure sections, its findings
// written beside the match's table (`<stem>.critique.md`). `core/critique.ts`
// holds its words.
//
// One counsel run (`tools/counsel.ts`: headless Opus at max effort, Read its
// one tool, in a sandbox that shows it the packet's folder alone) answers
// every figure at a place: batched. The answer is kept by the hash of all it
// was shown (`out/<film>/critique/<hash>.json`: the packet's words but the
// place, and each crop's bytes), so the same prompt over the same crops is
// never asked twice, and a prompt reworded is asked again. The rule
// sections are read once, when the critic is built: one its file lacks
// fails the build (`CritiqueRuleMissing`), as the judge's does. Past that it
// fails open: a counsel that fails, an answer that does not read, crops that
// cannot be read or a defect is a skip, logged (`critique.skipped`) and said
// in each file, never a failure of the caller's; a finding that does not
// read, or names no figure asked about, is rejected and said.

import {
  Array as Arr,
  Cache,
  Cause,
  Clock,
  Context,
  Deferred,
  Duration,
  Effect,
  Exit,
  FileSystem,
  Layer,
  Option,
  Path,
  Result,
  Schema,
  Semaphore,
} from 'effect';
import {
  type CritiqueDrawn,
  type CritiqueFigure,
  CritiqueFinding,
  type CritiqueRead,
  type CritiqueRule,
  type CritiqueStaging,
  type QuotedSection,
  UNSTAGED,
  boardFileOf,
  critiqueMarkdown,
  critiquePacket,
  findingsOf,
} from '../core/critique.ts';
import { panelStagedAt } from '../core/board.ts';
import { sectionOf } from '../core/judge.ts';
import { type MatchTaken, hairBeardLine, matchLines } from '../core/match.ts';
import { BoardStore } from './board-store.ts';
import { Counsel } from './counsel.ts';
import { sha256Hex } from './digest.ts';
import { FilmName } from './film-repo.ts';
import { FreshFilm } from './fresh-film.ts';

/** One figure critiqued: its findings, the file they are written in, and whether the answer was kept from before. */
const FigureCritiqued = Schema.Struct({
  figure: Schema.String,
  findings: Schema.Array(CritiqueFinding),
  file: Schema.String,
});

/** A critique's answer: each figure's, whether it was kept from before, and why it was skipped when it was. */
export const CritiqueTaken = Schema.Struct({
  figures: Schema.Array(FigureCritiqued),
  cached: Schema.Boolean,
  skipped: Schema.optionalKey(Schema.String),
  /** Each finding the answer gave that did not read, or named no figure asked about. */
  rejected: Schema.Array(Schema.String),
});
export type CritiqueTaken = typeof CritiqueTaken.Type;

const KeptAnswer = Schema.fromJsonString(
  Schema.Struct({
    findings: Schema.Array(CritiqueFinding),
    rejected: Schema.Array(Schema.String),
  }),
);

/** A rule section its file lacks, or a rule file that cannot be read: the critic is not built without it. */
class CritiqueRuleMissing extends Schema.TaggedError<CritiqueRuleMissing>()('CritiqueRuleMissing', {
  file: Schema.String,
  heading: Schema.String,
}) {
  override get message() {
    return `the critique quotes "${this.heading}" from ${this.file}, and the file has no such section: fix the heading in the app's critique rules`;
  }
}

/** One view of a cast sheet try to critique: its name, its crop and its concept's at 1:1, the measure's lines on it, and the file its findings go to. */
interface SheetView {
  readonly figure: string;
  readonly concept: string;
  readonly sheet: string;
  readonly flagged: ReadonlyArray<string>;
  readonly file: string;
  /** What the sheet's layout asks of this view: its numbered clause, or the whole layout when it numbers none. */
  readonly layout: Option.Option<string>;
}

/** A cast sheet try's views to critique: where they are, in words, and the folder its answers are kept in. */
interface SheetCritique {
  readonly place: string;
  readonly kept: string;
  readonly views: ReadonlyArray<SheetView>;
}

/** A critique job as read: the match it critiques, and its answer once the counsel has given it. */
interface CritiqueJob {
  readonly match: MatchTaken;
  readonly critique: Option.Option<CritiqueTaken>;
}

/** A job the critic does not keep: never started, dropped past its time or count, or the lab restarted since. */
class CritiqueJobUnknown extends Schema.TaggedError<CritiqueJobUnknown>()('CritiqueJobUnknown', {
  handle: Schema.String,
}) {
  override get message() {
    return `no critique ${this.handle} is kept (one is kept ${Duration.format(JOB_KEPT_FOR)} after it starts, and a lab restarted keeps none): start it again with the scene and the place`;
  }
}

interface CriticService {
  /** The figures `taken` matched, critiqued against their concepts in design and against `staging` in state: never fails, a skip is said and logged. */
  readonly critique: (taken: MatchTaken, staging: CritiqueStaging) => Effect.Effect<CritiqueTaken>;
  /**
   * The same critique as a job in the critic's scope, answered by its
   * handle at once: the same figures over the same packet while one runs
   * are that job's handle, not a second run.
   */
  readonly start: (taken: MatchTaken, staging: CritiqueStaging) => Effect.Effect<string>;
  /** The job `handle`, waited on at most `within`: its answer when given by then. */
  readonly job: (
    handle: string,
    within: Duration.Duration,
  ) => Effect.Effect<CritiqueJob, CritiqueJobUnknown>;
  /** A cast sheet try's views, each critiqued against its concept: never fails, a skip is said and logged. */
  readonly critiqueSheet: (sheet: SheetCritique) => Effect.Effect<CritiqueTaken>;
}

/** What one critique is asked about: what it was drawn in, where, how its log names it, the folder its answers are kept in, and each figure (its crops' paths and the file its findings go to). */
interface CritiqueAsk {
  readonly drawn: CritiqueDrawn;
  readonly place: string;
  readonly logged: string;
  readonly keptDir: string;
  /** Where the place stages the figures (a scene's); a sheet's views are unstaged. */
  readonly staging: CritiqueStaging;
  readonly figures: ReadonlyArray<{
    readonly figure: string;
    readonly concept: string;
    readonly drawnCrop: string;
    readonly flagged: ReadonlyArray<string>;
    readonly file: string;
    readonly layout: Option.Option<string>;
    readonly boundary: Option.Option<string>;
  }>;
}

/** An ask as it is asked: the ask (a Board image that cannot be read left out), the hash of its prompt and crops, and its kept answer's file. */
interface Prepared {
  readonly ask: CritiqueAsk;
  readonly hash: string;
  readonly kept: string;
}

/** How many jobs the critic keeps, running or done: past it the one read least recently is dropped. */
const JOBS_KEPT = 32;

/** How long a job is kept from its start: past the counsel's own limit (30 min), so the slowest is read for half an hour after. */
const JOB_KEPT_FOR = Duration.hours(1);

/** A job's handle: the first 16 hex of the hash of what names it. Pure. */
const handleOf = (names: ReadonlyArray<string>): string => sha256Hex(names.join('\n')).slice(0, 16);

/** A job as kept: the match it critiques, and the answer its fiber gives. */
interface Job {
  readonly match: MatchTaken;
  readonly done: Deferred.Deferred<CritiqueTaken>;
}

/** The skip a job whose fiber ended without an answer is read as. */
const diedAs = (why: string): CritiqueTaken => ({
  figures: [],
  cached: false,
  skipped: `the critique died: ${why}`,
  rejected: [],
});

/**
 * The critic's jobs, in the scope of the layer that makes them: each a
 * critique running in its own fiber and the answer it gives, by handle, at
 * most `JOBS_KEPT` of them each for `JOB_KEPT_FOR`. A start whose handle
 * names a running job answers it; a done one is started again (its kept
 * answer makes that quick).
 */
const jobsIn = Effect.gen(function* () {
  const scope = yield* Effect.scope;
  const kept = yield* Cache.makeWith<string, Job, CritiqueJobUnknown>(
    (handle) => Effect.fail(CritiqueJobUnknown.make({ handle })),
    {
      capacity: JOBS_KEPT,
      timeToLive: Exit.match({ onSuccess: () => JOB_KEPT_FOR, onFailure: () => Duration.zero }),
    },
  );
  const starting = yield* Semaphore.make(1);
  const start = (handle: string, match: MatchTaken, work: Effect.Effect<CritiqueTaken>) =>
    Semaphore.withPermits(
      starting,
      1,
    )(
      Effect.gen(function* () {
        const before = yield* Cache.getSuccess(kept, handle);
        if (Option.isSome(before) && !(yield* Deferred.isDone(before.value.done))) return handle;
        const done = yield* Deferred.make<CritiqueTaken>();
        yield* Effect.forkIn(
          Effect.flatMap(Effect.exit(work), (exit) =>
            Deferred.succeed(
              done,
              Exit.match(exit, {
                onSuccess: (answer) => answer,
                onFailure: (cause) => diedAs(Cause.pretty(cause)),
              }),
            ),
          ),
          scope,
        );
        yield* Cache.set(kept, handle, { match, done });
        return handle;
      }),
    );
  const job = (handle: string, within: Duration.Duration) =>
    Effect.gen(function* () {
      const one = yield* Cache.get(kept, handle);
      const critique = yield* Effect.timeoutOption(Deferred.await(one.done), within);
      return { match: one.match, critique } satisfies CritiqueJob;
    });
  return { start, job };
});

/** The rows a figure's table flagged, as `matchLines` says them. */
const flaggedOf = (m: MatchTaken['figures'][number]): ReadonlyArray<string> =>
  matchLines(m)
    .slice(1)
    .map((line) => line.trim());

/** Each figure as the packet names it: its crops by their files beside the packet, and its flagged rows. */
const figuresOf = (ask: CritiqueAsk): ReadonlyArray<CritiqueFigure> =>
  ask.figures.map((f) => ({
    figure: f.figure,
    concept: `${f.figure}-concept.png`,
    scene: `${f.figure}-${ask.drawn}.png`,
    flagged: f.flagged,
    layout: f.layout,
    boundary: f.boundary,
  }));

/** A match's figures as a critique asks them: drawn in its scene, at its place, each written beside its table. */
const askOfMatch = (taken: MatchTaken, staging: CritiqueStaging, path: Path.Path): CritiqueAsk => ({
  drawn: 'scene',
  staging,
  place: `${taken.scene} ${taken.at}, t=${taken.time.toFixed(2)}, build ${taken.build}`,
  logged: `scene=${taken.scene} at=${taken.at}`,
  keptDir: Option.match(Arr.head(taken.figures), {
    onNone: () => '',
    onSome: (m) => path.join(path.dirname(path.dirname(path.dirname(m.table))), 'critique'),
  }),
  figures: taken.figures.map((m) => ({
    figure: m.figure,
    concept: m.crops.concept,
    drawnCrop: m.crops.scene,
    flagged: flaggedOf(m),
    file: `${m.table.replace(/\.md$/, '')}.critique.md`,
    layout: Option.none(),
    boundary: hairBeardLine(m.rows),
  })),
});

/** A cast sheet try's views as a critique asks them. */
const askOfSheet = (sheet: SheetCritique): CritiqueAsk => ({
  drawn: 'sheet',
  staging: UNSTAGED,
  place: sheet.place,
  logged: `sheet="${sheet.place}"`,
  keptDir: sheet.kept,
  figures: sheet.views.map((v) => ({
    figure: v.figure,
    concept: v.concept,
    drawnCrop: v.sheet,
    flagged: v.flagged,
    file: v.file,
    layout: v.layout,
    boundary: Option.none(),
  })),
});

/** `found`, or none with the reason logged (`critique.unstaged`): a staging that cannot be read leaves the critique unstaged, never refused. */
const orUnstaged = <A, E extends { readonly message: string }, R>(
  found: Effect.Effect<Option.Option<A>, E, R>,
  what: string,
  taken: MatchTaken,
) =>
  found.pipe(
    Effect.catch((error) =>
      Effect.as(
        Effect.logWarning(
          `critique.unstaged scene=${taken.scene} at=${taken.at} part=${what} reason=${error.message}`,
        ),
        Option.none<A>(),
      ),
    ),
  );

/**
 * Where `film` stages `taken`'s figures: the Board panel its scene's beat
 * (a scene plays the beat of its id) shows at the match's time, by its
 * marks, with the shown try's image as the board keeps it, and the
 * script's picture of the beat. Fails open: a name that is no film's, or a
 * board, an image or a script that cannot be read, is that part left out,
 * logged.
 */
export const stagingAt = Effect.fn('Critic.stagingAt')(function* (name: string, taken: MatchTaken) {
  const named = Schema.decodeOption(FilmName)(name);
  if (Option.isNone(named)) {
    yield* Effect.logWarning(
      `critique.unstaged scene=${taken.scene} at=${taken.at} part=film reason=${name} is no film's name`,
    );
    return UNSTAGED;
  }
  const film = named.value;
  const board = yield* BoardStore;
  const fresh = yield* FreshFilm;
  const panel = yield* orUnstaged(
    board.read(film).pipe(
      Effect.map((file) => panelStagedAt(file, taken.scene, taken.marks, taken.time)),
      Effect.flatMap((staged) =>
        Option.match(staged, {
          onNone: () => Effect.succeedNone,
          onSome: ({ panel: p, shown }) =>
            Effect.map(board.image(film, shown.file), (image) => Option.some({ id: p.id, image })),
        }),
      ),
    ),
    'board',
    taken,
  );
  const picture = yield* orUnstaged(
    Effect.map(fresh.script(film), (beats) =>
      Option.flatMap(
        Arr.findFirst(beats, (beat) => beat.id === taken.scene),
        (beat) => Option.fromUndefinedOr(beat.picture),
      ),
    ),
    'script',
    taken,
  );
  return { panel, picture } satisfies CritiqueStaging;
});

export class Critic extends Context.Service<Critic, CriticService>()('@bible/film/tools/Critic') {
  /** The critic over the app's rule sections `rules` (`FilmApp.critique`), asking the counsel; refused when a section is missing. */
  static readonly layer = (rules: ReadonlyArray<CritiqueRule>) =>
    Layer.effect(
      Critic,
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const counsel = yield* Counsel;

        // The rule sections, quoted by file name, read once: a section its file lacks fails the build.
        const sections: ReadonlyArray<QuotedSection> = yield* Effect.forEach(rules, (rule) =>
          Effect.gen(function* () {
            const text = yield* fs
              .readFileString(rule.file)
              .pipe(
                Effect.mapError(() =>
                  CritiqueRuleMissing.make({ file: rule.file, heading: rule.heading }),
                ),
              );
            const section = yield* Effect.fromOption(sectionOf(text, rule.heading)).pipe(
              Effect.mapError(() =>
                CritiqueRuleMissing.make({ file: rule.file, heading: rule.heading }),
              ),
            );
            return { file: path.basename(rule.file), heading: rule.heading, text: section };
          }),
        );

        /** The counsel's findings on the ask's figures (their crops copied beside the packet), or why there are none. */
        const asked = (ask: CritiqueAsk, kept: string): Effect.Effect<CritiqueRead, string> =>
          Effect.scoped(
            Effect.gen(function* () {
              const dir = yield* fs.makeTempDirectoryScoped();
              const figures = figuresOf(ask);
              yield* Effect.forEach(ask.figures, (f) =>
                Effect.all([
                  fs.copyFile(f.concept, path.join(dir, `${f.figure}-concept.png`)),
                  fs.copyFile(f.drawnCrop, path.join(dir, `${f.figure}-${ask.drawn}.png`)),
                ]),
              );
              yield* Effect.forEach(
                Option.toArray(
                  Option.zipWith(
                    ask.staging.panel,
                    boardFileOf(ask.staging),
                    (p, file) => [p.image, file] as const,
                  ),
                ),
                ([image, file]) => fs.copyFile(image, path.join(dir, file)),
              );
              const packet = path.join(dir, 'packet.md');
              yield* fs.writeFileString(
                packet,
                critiquePacket(ask.drawn, ask.place, figures, sections, ask.staging),
              );
              return packet;
            }).pipe(
              Effect.mapError((error) => `the packet cannot be written: ${error.message}`),
              Effect.flatMap((packet) =>
                counsel
                  .ask(packet, path.join(path.dirname(kept), 'counsel'))
                  .pipe(Effect.mapError((error) => error.message)),
              ),
              Effect.flatMap((answer) =>
                Effect.fromResult(
                  findingsOf(
                    answer.text,
                    ask.figures.map((f) => f.figure),
                  ),
                ),
              ),
              Effect.tap((read) =>
                Schema.encodeEffect(KeptAnswer)({
                  findings: [...read.findings],
                  rejected: [...read.rejected],
                }).pipe(
                  Effect.flatMap((json) => fs.writeFileString(kept, json)),
                  Effect.ignore,
                ),
              ),
            ),
          );

        /** The answer kept for `hash`, when one was. */
        const keptAnswer = (kept: string) =>
          fs.readFileString(kept).pipe(
            Effect.flatMap((text) => Schema.decodeEffect(KeptAnswer)(text)),
            Effect.option,
          );

        /**
         * The ask as it is asked: its crops read and hashed with the prompt
         * (but the place), where its answer is kept. A Board panel whose image
         * cannot be read is left out, logged (`critique.unstaged`): the rest
         * is critiqued unstaged.
         */
        const prepared = (ask: CritiqueAsk): Effect.Effect<Prepared, string> =>
          Effect.gen(function* () {
            const crops = yield* Effect.forEach(ask.figures, (f) =>
              Effect.all([fs.readFile(f.concept), fs.readFile(f.drawnCrop)]).pipe(
                Effect.map(([concept, drawn]) => [sha256Hex(concept), sha256Hex(drawn)]),
                Effect.mapError((error) => `${f.figure}'s crops cannot be read: ${error.message}`),
              ),
            );
            const staged = yield* Option.match(ask.staging.panel, {
              onNone: () => Effect.succeed({ ask, board: [] }),
              onSome: (p) =>
                fs.readFile(p.image).pipe(
                  Effect.map((bytes) => ({ ask, board: [sha256Hex(bytes)] })),
                  Effect.catch((error) =>
                    Effect.as(
                      Effect.logWarning(
                        `critique.unstaged ${ask.logged} part=board reason=${error.message}`,
                      ),
                      {
                        ask: { ...ask, staging: { ...ask.staging, panel: Option.none() } },
                        board: [],
                      },
                    ),
                  ),
                ),
            });
            // The prompt as sent, but the place (a scene's build and time change with every build).
            const hash = sha256Hex(
              [
                critiquePacket(ask.drawn, '', figuresOf(staged.ask), sections, staged.ask.staging),
                ...crops.flat(),
                ...staged.board,
              ].join('\n'),
            );
            yield* fs
              .makeDirectory(ask.keptDir, { recursive: true })
              .pipe(Effect.mapError((error) => error.message));
            return {
              ask: staged.ask,
              hash,
              kept: path.join(ask.keptDir, `${hash.slice(0, 32)}.json`),
            };
          }).pipe(
            Effect.catchDefect((defect) =>
              Effect.fail(`the critique died: ${Cause.pretty(Cause.die(defect))}`),
            ),
          );

        /** The prepared ask's findings, kept from before or asked. */
        const answered = (ready: Prepared) =>
          Effect.gen(function* () {
            const before = yield* keptAnswer(ready.kept);
            if (Option.isSome(before)) return { read: before.value, cached: true };
            return { read: yield* asked(ready.ask, ready.kept), cached: false };
          }).pipe(
            Effect.catchDefect((defect) =>
              Effect.fail(`the critique died: ${Cause.pretty(Cause.die(defect))}`),
            ),
          );

        /** The ask critiqued from what `prepared` read of it: each figure's file written, the run logged. */
        const critiquedFrom = Effect.fn('Critic.critiqued')(function* (
          ask: CritiqueAsk,
          ready: Result.Result<Prepared, string>,
        ) {
          if (ask.figures.length === 0)
            return { figures: [], cached: false, rejected: [] } satisfies CritiqueTaken;
          const started = yield* Clock.currentTimeMillis;
          const read = yield* Result.match(ready, {
            onFailure: (why) => Effect.succeed(Result.fail(why)),
            onSuccess: (p) => Effect.result(answered(p)),
          });
          const findings = Result.map(read, (r) => r.read);
          const figures = yield* Effect.forEach(ask.figures, (f) =>
            Effect.gen(function* () {
              yield* fs
                .writeFileString(f.file, critiqueMarkdown(f.figure, ask.place, findings))
                .pipe(Effect.ignore);
              return {
                figure: f.figure,
                findings: Result.match(findings, {
                  onFailure: () => [],
                  onSuccess: (r) => r.findings.filter((x) => x.figure === f.figure),
                }),
                file: f.file,
              };
            }),
          );
          const cached = Result.match(read, { onFailure: () => false, onSuccess: (r) => r.cached });
          yield* Result.match(read, {
            onFailure: (why) =>
              Effect.logWarning(
                `critique.skipped ${ask.logged} figures=${figures.length} reason=${why}`,
              ),
            onSuccess: (r) =>
              Effect.flatMap(Clock.currentTimeMillis, (now) =>
                Effect.log(
                  `critique ${ask.logged} figures=${figures.length} findings=${r.read.findings.length} rejected=${r.read.rejected.length} cached=${r.cached} ms=${now - started}`,
                ),
              ),
          });
          return Result.match(read, {
            onFailure: (skipped): CritiqueTaken => ({ figures, cached, skipped, rejected: [] }),
            onSuccess: (r): CritiqueTaken => ({ figures, cached, rejected: r.read.rejected }),
          });
        });

        const critiqued = (ask: CritiqueAsk) =>
          Effect.flatMap(Effect.result(prepared(ask)), (ready) => critiquedFrom(ask, ready));

        const jobs = yield* jobsIn;

        return Critic.of({
          critique: (taken, staging) => critiqued(askOfMatch(taken, staging, path)),
          start: (taken, staging) =>
            Effect.gen(function* () {
              const ask = askOfMatch(taken, staging, path);
              const ready = yield* Effect.result(prepared(ask));
              // One job per film, scene, figures and packet: the scene's match folder names the first two.
              const handle = handleOf([
                Result.match(ready, { onFailure: () => 'unread', onSuccess: (p) => p.hash }),
                ...ask.figures.map((f) => `${path.dirname(f.file)} ${f.figure}`),
              ]);
              return yield* jobs.start(handle, taken, critiquedFrom(ask, ready));
            }),
          job: jobs.job,
          critiqueSheet: (sheet) => critiqued(askOfSheet(sheet)),
        });
      }),
    );

  /** A critic that skips every critique, saying `reason`: a lab that runs no counsel (a harness, a test). */
  static readonly skipping = (reason: string) =>
    Layer.effect(
      Critic,
      Effect.gen(function* () {
        const skipped: CritiqueTaken = {
          figures: [],
          cached: false,
          skipped: reason,
          rejected: [],
        };
        const jobs = yield* jobsIn;
        return Critic.of({
          critique: () => Effect.succeed(skipped),
          start: (taken) =>
            jobs.start(
              handleOf([taken.scene, ...taken.figures.map((f) => f.figure)]),
              taken,
              Effect.succeed(skipped),
            ),
          job: jobs.job,
          critiqueSheet: () => Effect.succeed(skipped),
        });
      }),
    );
}
