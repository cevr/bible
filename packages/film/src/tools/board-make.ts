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
  Random,
  Ref,
} from 'effect';
import type { Result } from 'effect';
import {
  type BoardFile,
  type BoardStyle,
  type BoardTry,
  filmOrder,
  nextTry,
  panelById,
  panelId,
  panelsOf,
  plannedAts,
  shownTry,
  tryOf,
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
type MakeLine =
  | {
      readonly _tag: 'Made';
      readonly panel: string;
      readonly n: number;
      readonly seconds: number;
      readonly file: string;
    }
  | {
      readonly _tag: 'Failed';
      readonly panel: string;
      /** Which of the run's tries of the panel it was, from 1: a failed try takes no number. */
      readonly attempt: number;
      readonly reason: string;
    }
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
      `failed ${line.panel} attempt=${line.attempt} reason="${line.reason.replace(/\s+/g, ' ')}"`,
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

/** A panel a run draws, and how many tries it still lacks. */
interface ToDraw {
  readonly at: string;
  readonly count: number;
}

/**
 * A beat's panels to draw, each with the tries it still lacks of `tries`: each
 * planned at (`plannedAts`) the board has no panel for, or a picture panel a
 * run started (its tries all generated, fewer than `tries`, none kept). A beat
 * boarded by hand (a picture panel held from a mark the plan does not pick,
 * imported or set) keeps its own panels: a run only finishes those it began.
 * A panel with a kept try, an import, a tweak or a text the engine sets is
 * left as it stands.
 */
const toDraw = (board: BoardFile, beat: BoardBeat, tries: number): ReadonlyArray<ToDraw> => {
  const planned = plannedAts(beat.id, beat.say, beat.picture);
  const own = panelsOf(board, beat.id);
  const byHand = own.some((p) => Predicate.isUndefined(p.text) && !planned.includes(p.at));
  const ats = Bool.match(byHand, {
    onTrue: () => own.filter((p) => Predicate.isUndefined(p.text)).map((p) => p.at),
    onFalse: () => planned,
  });
  return ats.flatMap((at) => {
    const count = Option.match(panelById(board, panelId(beat.id, at)), {
      onNone: () => tries,
      onSome: (p) => {
        const settled =
          Predicate.isNotUndefined(p.text) ||
          Predicate.isNotUndefined(p.kept) ||
          p.tries.some((t) => t.made !== 'generate');
        return Bool.match(settled, {
          onTrue: () => 0,
          onFalse: () => Math.max(0, tries - p.tries.length),
        });
      },
    });
    return Arr.filter([{ at, count }], (d) => d.count > 0);
  });
};

/** Everything one try needs from the film. */
interface TryContext {
  readonly film: FilmName;
  readonly style: BoardStyle;
  readonly folder: string;
  readonly beats: ReadonlyArray<BoardBeat>;
}

/**
 * One try of a panel drawn and recorded; its number, file and how long it took. The image is drawn to a file of its
 * own and numbered only as it is recorded, under the board's lock, so a run and a tweak drawing one panel at once never
 * share a number or overwrite each other's image. The route tried twice before it fails.
 */
const drawTry = Effect.fn('Board.drawTry')(function* (
  ctx: TryContext,
  beat: string,
  at: string,
  made: BoardTry['made'],
  prompt: string,
  refs: ReadonlyArray<string>,
  note: Option.Option<string>,
) {
  const path = yield* Path.Path;
  const fs = yield* FileSystem.FileSystem;
  const store = yield* BoardStore;
  const route = yield* ImageRoute;
  const id = panelId(beat, at);
  const drawing = path.join(ctx.folder, '.drawing');
  yield* fs.makeDirectory(drawing, { recursive: true });
  const out = path.join(
    drawing,
    `${id}.${(yield* Random.nextIntBetween(0, 36 ** 6)).toString(36)}.png`,
  );
  const started = yield* DateTime.now;
  const bytes = yield* route
    .draw({ prompt, refs: refs.map((r) => path.join(ctx.folder, r)), size: PANEL_SIZE, out })
    .pipe(
      Effect.retry({ times: 1, while: (e) => e._tag === 'ImageRouteFailed' }),
      Effect.andThen(fs.readFile(out)),
      Effect.ensuring(fs.remove(out).pipe(Effect.ignore)),
    );
  const ended = yield* DateTime.now;
  const recorded = yield* store.addTries(
    ctx.film,
    { id, beat, at },
    (current) => filmOrder(ctx.beats, [...current.panels.map((p) => p.id), id]),
    [
      {
        bytes,
        ext: 'png',
        made,
        prompt,
        refs,
        ...Option.match(note, { onNone: () => ({}), onSome: (n) => ({ note: n }) }),
        at: DateTime.formatIso(ended),
      },
    ],
  );
  const seconds = DateTime.toEpochMillis(ended) / 1000 - DateTime.toEpochMillis(started) / 1000;
  for (const t of recorded)
    yield* Effect.log(
      `board.try film=${ctx.film} panel=${id} n=${t.n} secs=${seconds.toFixed(1)} made=${made}`,
    );
  return { tries: recorded, seconds };
});

/**
 * `count` tries of a panel, each numbered as it lands (a try that draws
 * nothing prints why, naming its attempt, and takes no number); the numbers made.
 */
const drawTries = (
  ctx: TryContext,
  beat: string,
  at: string,
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
    (done, attempt) => {
      const panel = panelId(beat, at);
      return drawTry(ctx, beat, at, made, prompt, refs, note).pipe(
        Effect.flatMap(({ tries, seconds }) =>
          Effect.as(
            Effect.forEach(
              tries,
              (t) => emit({ _tag: 'Made', panel, n: t.n, seconds, file: t.file }),
              {
                discard: true,
              },
            ),
            [...done, ...tries.map((t) => t.n)],
          ),
        ),
        Effect.catch((e) =>
          Effect.as(emit({ _tag: 'Failed', panel, attempt, reason: e.message }), done),
        ),
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
      for (const { at, count } of toDraw(board, beat, options.tries)) {
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
          for (const n of Arr.range(start, start + count - 1))
            yield* emit({ _tag: 'Planned', panel: panelId(beat.id, at), n, prompt, refs });
          continue;
        }
        const made = yield* drawTries(
          ctx,
          beat.id,
          at,
          count,
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
  const made = yield* drawTries(
    ctx,
    panel.beat,
    panel.at,
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
