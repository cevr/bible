// Making a film's storyboard: each beat's panels planned from its picture's
// marks, each drawn on the image route from one scene prompt (`board-
// prompt.ts`), two tries a panel, every try recorded as it lands, so a run
// stopped halfway keeps what it made and the next run makes only the rest.
// Beats run side by side (`lanes`, three at most: the route's own limit);
// within a beat the panels go in line order, the first panel's shown try
// riding along as the later ones' second reference, so a beat keeps its
// place and its people. A tweak (`tweakPanel`) makes a panel again from a
// lab note: the try it was written on, the note's words, its sketch.

import {
  Array as Arr,
  Boolean as Bool,
  DateTime,
  Effect,
  FileSystem,
  Match,
  Option,
  Path,
  Predicate,
  Ref,
} from 'effect';
import type { Result } from 'effect';
import {
  type BoardFile,
  type BoardStyle,
  type BoardTry,
  type Panel,
  filmOrder,
  nextTry,
  panelById,
  panelId,
  panelsOf,
  plannedAts,
  shownTry,
  tryFile,
  tryOf,
  withPanel,
  withTries,
} from '../core/board.ts';
import { BoardRefused } from '../core/refusals.ts';
import type { Act, Note } from '../core/schema.ts';
import { type BoardBeat, actOf, panelPrompt } from './board-prompt.ts';
import { BoardStore } from './board-store.ts';
import type { FilmName } from './film-repo.ts';
import { ImageRoute, PANEL_SIZE } from './image-route.ts';

/** The most beats drawn at once: the image route's own limit. */
export const MOST_LANES = 3;

/** The tries a panel gets by default: two, to keep one and say why. */
export const TRIES = 2;

/** A run of the board: what it draws, and how. */
interface MakeOptions {
  /** Only these beats (all when empty). */
  readonly beats: ReadonlyArray<string>;
  readonly tries: number;
  readonly lanes: number;
  /** Print each prompt and draw nothing. */
  readonly dryRun: boolean;
}

/** A line a run prints for each try: made, failed, or (dry) the prompt it would send. */
export type MakeLine =
  | {
      readonly _tag: 'Made';
      readonly panel: string;
      readonly n: number;
      readonly seconds: number;
      readonly file: string;
    }
  | { readonly _tag: 'Failed'; readonly panel: string; readonly n: number; readonly reason: string }
  | {
      readonly _tag: 'Planned';
      readonly panel: string;
      readonly n: number;
      readonly prompt: string;
      readonly refs: ReadonlyArray<string>;
    };

/** One line of a run's output. */
export const makeLine: (line: MakeLine) => string = Match.type<MakeLine>().pipe(
  Match.tagsExhaustive({
    Made: (line) =>
      `made ${line.panel} try=${line.n} secs=${line.seconds.toFixed(1)} file=${line.file}`,
    Failed: (line) =>
      `failed ${line.panel} try=${line.n} reason="${line.reason.replace(/\s+/g, ' ')}"`,
    Planned: (line) =>
      `plan ${line.panel} try=${line.n} refs=${line.refs.join(',')}\n${line.prompt}\n`,
  }),
);

/** The board's style, or the refusal that says how to set it. */
const styleOf = (film: string, board: BoardFile) =>
  Effect.fromOption(Option.fromUndefinedOr(board.style)).pipe(
    Effect.mapError(() =>
      BoardRefused.make({
        film,
        reason:
          'the board has no style yet: set it with `film board style <film> --id … --name … --block-file … --ref …`',
      }),
    ),
  );

/**
 * A beat's panels to draw: each planned at (`plannedAts`) the board has no
 * panel for, or a picture panel with no try yet. A beat boarded by hand (a
 * picture panel held from a mark the plan does not pick, imported or set)
 * keeps its own panels: only those with no try yet are drawn.
 */
export const toDraw = (board: BoardFile, beat: BoardBeat): ReadonlyArray<string> => {
  const planned = plannedAts(beat.id, beat.say, beat.picture);
  const own = panelsOf(board, beat.id);
  const byHand = own.some((p) => Predicate.isUndefined(p.text) && !planned.includes(p.at));
  if (byHand)
    return own
      .filter((p) => Predicate.isUndefined(p.text) && p.tries.length === 0)
      .map((p) => p.at);
  return planned.filter((at) =>
    Option.match(panelById(board, panelId(beat.id, at)), {
      onNone: () => true,
      onSome: (p) => Predicate.isUndefined(p.text) && p.tries.length === 0,
    }),
  );
};

/** Everything one try needs from the film. */
interface TryContext {
  readonly film: FilmName;
  readonly style: BoardStyle;
  readonly folder: string;
  readonly beats: ReadonlyArray<BoardBeat>;
}

/** Try `n` of a panel drawn and recorded; how long it took. The route tried twice before it fails. */
const drawTry = Effect.fn('Board.drawTry')(function* (
  ctx: TryContext,
  beat: string,
  at: string,
  n: number,
  made: BoardTry['made'],
  prompt: string,
  refs: ReadonlyArray<string>,
  note: Option.Option<string>,
) {
  const path = yield* Path.Path;
  const fs = yield* FileSystem.FileSystem;
  const store = yield* BoardStore;
  const route = yield* ImageRoute;
  const file = tryFile(beat, at, n);
  const out = path.join(ctx.folder, file);
  yield* fs.makeDirectory(ctx.folder, { recursive: true });
  const started = yield* DateTime.now;
  yield* route
    .draw({ prompt, refs: refs.map((r) => path.join(ctx.folder, r)), size: PANEL_SIZE, out })
    .pipe(Effect.retry({ times: 1, while: (e) => e._tag === 'ImageRouteFailed' }));
  const bytes = yield* fs.readFile(out);
  const sha256 = yield* store.put(ctx.film, file, bytes);
  const ended = yield* DateTime.now;
  const tried: BoardTry = {
    n,
    file,
    sha256,
    made,
    prompt,
    refs,
    ...Option.match(note, { onNone: () => ({}), onSome: (id) => ({ note: id }) }),
    at: DateTime.formatIso(ended),
  };
  yield* store.transact(ctx.film, (current) => {
    const next = withPanel(
      current,
      withTries(
        Option.getOrElse(panelById(current, panelId(beat, at)), (): Panel => ({
          id: panelId(beat, at),
          beat,
          at,
          tries: [],
        })),
        [tried],
      ),
      filmOrder(ctx.beats, [...current.panels.map((p) => p.id), panelId(beat, at)]),
    );
    return Effect.succeed([next, next] as const);
  });
  const seconds = DateTime.toEpochMillis(ended) / 1000 - DateTime.toEpochMillis(started) / 1000;
  yield* Effect.log(
    `board.try film=${ctx.film} panel=${panelId(beat, at)} n=${n} secs=${seconds.toFixed(1)} made=${made}`,
  );
  return { file, seconds };
});

/**
 * `count` tries of a panel, numbered on from `start` as each lands (a try
 * that draws nothing prints why and takes no number); the numbers made.
 */
const drawTries = (
  ctx: TryContext,
  beat: string,
  at: string,
  start: number,
  count: number,
  made: BoardTry['made'],
  prompt: string,
  refs: ReadonlyArray<string>,
  note: Option.Option<string>,
  emit: (line: MakeLine) => Effect.Effect<void>,
) =>
  Effect.reduce(
    Arr.range(1, count),
    (): ReadonlyArray<number> => [],
    (done) => {
      const n = start + done.length;
      const panel = panelId(beat, at);
      return drawTry(ctx, beat, at, n, made, prompt, refs, note).pipe(
        Effect.tap(({ file, seconds }) => emit({ _tag: 'Made', panel, n, seconds, file })),
        Effect.as([...done, n]),
        Effect.catch((e) => Effect.as(emit({ _tag: 'Failed', panel, n, reason: e.message }), done)),
      );
    },
  );

/**
 * Draw every panel the board still lacks for `options.beats` (all beats when
 * none): `options.tries` tries each, `options.lanes` beats at once. Each try
 * prints one line as it lands (`emit`); a try that fails twice prints why and
 * the run goes on; three panels failing in a row stop it (the route is down).
 */
export const makeBoard = Effect.fn('Board.make')(function* (
  film: FilmName,
  beats: ReadonlyArray<BoardBeat>,
  acts: ReadonlyArray<Act>,
  options: MakeOptions,
  emit: (line: MakeLine) => Effect.Effect<void>,
) {
  const store = yield* BoardStore;
  const board = yield* store.read(film);
  const style = yield* styleOf(film, board);
  const unknown = options.beats.filter((b) => !beats.some((beat) => beat.id === b));
  if (unknown.length > 0)
    return yield* BoardRefused.make({
      film,
      reason: `the script has no beat ${unknown.join(', ')} (it has ${beats.map((b) => b.id).join(', ')})`,
    });
  const chosen = beats.filter((b) => options.beats.length === 0 || options.beats.includes(b.id));
  const ctx: TryContext = { film, style, folder: store.paths(film).folder, beats };
  const ids = beats.map((b) => b.id);
  const failedInRow = yield* Ref.make(0);
  const down = () => Effect.map(Ref.get(failedInRow), (n) => n >= 3);

  const drawBeat = (beat: BoardBeat) =>
    Effect.gen(function* () {
      for (const at of toDraw(board, beat)) {
        if (yield* down()) return;
        // The first panel of the beat, once it has a try, rides along as the second reference.
        const now = yield* store.read(film);
        const first = Arr.findFirst(
          panelsOf(now, beat.id),
          (p) => Predicate.isUndefined(p.text) && p.at !== at && p.tries.length > 0,
        );
        const shot = Option.flatMap(first, shownTry);
        const refs = [style.ref, ...Option.toArray(Option.map(shot, (t) => t.file))];
        const prompt = panelPrompt({
          style,
          act: actOf(acts, ids, beat.id),
          beat,
          at,
          shot: Option.isSome(shot),
          tweak: Option.none(),
        });
        const start = Option.match(panelById(now, panelId(beat.id, at)), {
          onNone: () => 1,
          onSome: nextTry,
        });
        if (options.dryRun) {
          for (const n of Arr.range(start, start + options.tries - 1))
            yield* emit({ _tag: 'Planned', panel: panelId(beat.id, at), n, prompt, refs });
          continue;
        }
        const made = yield* drawTries(
          ctx,
          beat.id,
          at,
          start,
          options.tries,
          'generate',
          prompt,
          refs,
          Option.none(),
          emit,
        );
        yield* Ref.update(failedInRow, (k) =>
          Bool.match(made.length === 0, { onTrue: () => k + 1, onFalse: () => 0 }),
        );
      }
    });

  yield* Effect.forEach(chosen, drawBeat, {
    concurrency: Math.max(1, Math.min(MOST_LANES, options.lanes)),
    discard: true,
  });
  if (yield* down())
    return yield* BoardRefused.make({
      film,
      reason: 'three panels in a row drew nothing: the image route looks down; run again later',
    });
});

/** What a tweak made: the panel and the tries. */
interface Tweaked {
  readonly panel: string;
  readonly tries: ReadonlyArray<number>;
}

/**
 * Make `note`'s panel again (`film board tweak`): from the try the note was
 * written on (`--ref`), the note's words and, when it carries a sketch, its
 * still (the panel with the sketch on it, copied into the board folder) as a
 * third reference; `tries` tries added to the panel's history, made `tweak`
 * and naming the note. The kept try stays kept until one is picked.
 */
export const tweakPanel = Effect.fn('Board.tweak')(function* (
  film: FilmName,
  beats: ReadonlyArray<BoardBeat>,
  acts: ReadonlyArray<Act>,
  note: Note,
  still: string,
  tries: number,
  emit: (line: MakeLine) => Effect.Effect<void>,
) {
  const fs = yield* FileSystem.FileSystem;
  const store = yield* BoardStore;
  const board = yield* store.read(film);
  const style = yield* styleOf(film, board);
  const asked = yield* Effect.fromOption(Option.fromUndefinedOr(note.panel)).pipe(
    Effect.mapError(() =>
      BoardRefused.make({
        film,
        reason: `note ${note.id} is about a frame, not a storyboard panel`,
      }),
    ),
  );
  const refuse = (reason: string) => BoardRefused.make({ film, reason });
  const panel = yield* Effect.fromOption(panelById(board, asked.id)).pipe(
    Effect.mapError(() => refuse(`the board has no panel ${asked.id}`)),
  );
  const text = Option.fromUndefinedOr(panel.text);
  if (Option.isSome(text))
    return yield* refuse(
      `panel ${panel.id} is a ${text.value._tag.toLowerCase()} the engine sets: change it with \`film board ${text.value._tag.toLowerCase()}\``,
    );
  const shown = yield* Effect.fromOption(Option.fromUndefinedOr(asked.try)).pipe(
    Effect.mapError(() => refuse(`note ${note.id} names no try of panel ${panel.id}`)),
  );
  const base = yield* Effect.fromOption(tryOf(panel, shown)).pipe(
    Effect.mapError(() => refuse(`panel ${panel.id} has no try ${shown}`)),
  );
  const beat = yield* Effect.fromOption(Arr.findFirst(beats, (b) => b.id === panel.beat)).pipe(
    Effect.mapError(() => refuse(`the script has no beat ${panel.beat}`)),
  );
  const ctx: TryContext = { film, style, folder: store.paths(film).folder, beats };
  const sketched = Option.exists(Option.fromUndefinedOr(note.sketch), (s) => s.length > 0);
  // The sketch rides along as a board file of its own, so the try's refs name only board files.
  const sketchFile = `${panel.id}.${note.id}.sketch.png`;
  if (sketched) {
    const bytes = yield* fs.readFile(still);
    yield* store.put(film, sketchFile, bytes);
  }
  const refs = [
    style.ref,
    base.file,
    ...Bool.match(sketched, { onTrue: () => [sketchFile], onFalse: () => [] }),
  ];
  const prompt = panelPrompt({
    style,
    act: actOf(
      acts,
      beats.map((b) => b.id),
      beat.id,
    ),
    beat,
    at: panel.at,
    shot: false,
    tweak: Option.some({ text: note.text, sketch: sketched }),
  });
  const start = nextTry(panel);
  const made = yield* drawTries(
    ctx,
    panel.beat,
    panel.at,
    start,
    tries,
    'tweak',
    prompt,
    refs,
    Option.some(note.id),
    emit,
  );
  if (made.length === 0) return yield* refuse(`the tweak of ${panel.id} drew nothing`);
  return { panel: panel.id, tries: made } satisfies Tweaked;
});

/** A refusal of a step on the board, raised for `film`. */
export const refusedIn =
  (film: string) =>
  <A>(r: Result.Result<A, { readonly reason: string }>) =>
    Effect.mapError(Effect.fromResult(r), (e) => BoardRefused.make({ film, reason: e.reason }));
