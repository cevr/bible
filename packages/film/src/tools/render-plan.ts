// What a render does, decided before a browser opens: the job, the frames it
// covers, how they split into chunks, and where each output lands. Pure, so
// the scheduling is checked without Chromium; `Renderer` only runs it.

import { Array as Arr, Data, Option, Result } from 'effect';
import { Encoder, encoderName, sharesInPage } from '../core/encoder.ts';
import type { UnknownScene } from '../core/errors.ts';
import { FlagsConflict, TooManyEncoders } from './errors.ts';
import { type Placed, scenesOf } from '../core/layout.ts';
import type { ExportInfo, Short } from '../core/schema.ts';
import { type FilmPiece, shortKey } from '../core/shorts.ts';

interface JobBase {
  /** Output subfolder under `out/<film>`, so parallel renders do not collide. */
  readonly tag: string;
  /** Burn the captions in. */
  readonly captions: boolean;
}

/** A job drawn on pages that encode nothing: how many draw at once. */
interface DrawJob extends JobBase {
  readonly workers: number;
}

/** What a render draws: the whole film, or one of its shorts (`--short`). */
export type Cut = Data.TaggedEnum<{
  Whole: {};
  Short: { readonly short: Short };
}>;
export const Cut = Data.taggedEnum<Cut>();

/** The page a cut is drawn on: the film's, or its short's (`shortKey`). */
export const cutPage = (film: string, cut: Cut): string =>
  Cut.$match(cut, {
    Whole: () => film,
    Short: ({ short }) => shortKey(film, short.id),
  });

/**
 * Where a cut's outputs go, from the film's `out/<film>`: the video beside it
 * as `<base>.mp4` and its stills and sheets in `<base>/<tag>`. A short's base
 * is `out/<film>/shorts/<id>`.
 */
export const cutBase = (out: string, cut: Cut): string =>
  Cut.$match(cut, {
    Whole: () => out,
    Short: ({ short }) => `${out}/shorts/${short.id}`,
  });

/** A render: the film as video, a few stills, a contact sheet, or its look-book. */
export type RenderJob = Data.TaggedEnum<{
  Video: JobBase & {
    /** Pages rendering at once: `--workers`, else the default of the encoder the page chose (`videoWorkers`). */
    readonly workers: Option.Option<number>;
    readonly cut: Cut;
    readonly from: Option.Option<number>;
    readonly to: Option.Option<number>;
    readonly scale: number;
    /** Default `out/<film>.mp4`. */
    readonly out: Option.Option<string>;
    /**
     * Also a small copy to send, `shareName(out)`: encoded in the same pass
     * on the hardware encoder, made from the joined master by x264 on the
     * software one (`Media.shareCopy`).
     */
    readonly share: boolean;
    /** `--encoder`: the one encoder the render may use; none takes the platform's (`encoderCandidates`). */
    readonly encoder: Option.Option<Encoder>;
  };
  Stills: DrawJob & { readonly cut: Cut; readonly times: ReadonlyArray<number> };
  /** One page composes the whole sheet. */
  Contact: JobBase & {
    readonly cut: Cut;
    readonly every: number;
    readonly from: Option.Option<number>;
    readonly to: Option.Option<number>;
  };
  /** Every scene's stills at its cue edges and 60% point, with the palette: `lookbook.jpg`. One page composes it. */
  LookBook: JobBase;
}>;
export const RenderJob = Data.taggedEnum<RenderJob>();

/** `flag` is ignored with `other` (`excludes`), or without it (`needs`), because of `reason`. */
export type FlagRule = readonly [
  flag: string,
  rule: 'excludes' | 'needs',
  other: string,
  reason: string,
];

const broken = (given: ReadonlySet<string>, [flag, rule, other]: FlagRule) =>
  given.has(flag) && given.has(other) === (rule === 'excludes');

/** The first of `rules` the `given` flags break, as a failure. */
export const flagConflicts = (
  given: ReadonlySet<string>,
  rules: ReadonlyArray<FlagRule>,
): Result.Result<void, FlagsConflict> =>
  Option.match(
    Arr.findFirst(rules, (r) => broken(given, r)),
    {
      onNone: () => Result.void,
      onSome: ([flag, rule, other, reason]) =>
        Result.fail(FlagsConflict.make({ flag, rule, other, reason })),
    },
  );

/** The names of the flags whose value is present. */
export const givenFlags = (flags: Record<string, Option.Option<unknown>>): ReadonlySet<string> =>
  new Set(
    Object.entries(flags)
      .filter(([, value]) => Option.isSome(value))
      .map(([name]) => name),
  );

const STILLS = 'stills are drawn at the seconds --stills names';
const VIDEO = 'only a video takes it';

/** Render flags where one would silently win over, or ignore, the other. */
const RENDER_RULES: ReadonlyArray<FlagRule> = [
  ['stills', 'excludes', 'contact', 'a render writes stills or a contact sheet, not both'],
  ['stills', 'excludes', 'scene', STILLS],
  ['stills', 'excludes', 'from', STILLS],
  ['stills', 'excludes', 'to', STILLS],
  ['scene', 'excludes', 'from', '--scene sets the range from the layout'],
  ['scene', 'excludes', 'to', '--scene sets the range from the layout'],
  ['stills', 'excludes', 'scale', VIDEO],
  ['stills', 'excludes', 'out', VIDEO],
  ['stills', 'excludes', 'share', VIDEO],
  ['contact', 'excludes', 'scale', VIDEO],
  ['contact', 'excludes', 'out', VIDEO],
  ['contact', 'excludes', 'share', VIDEO],
  ['contact', 'excludes', 'workers', 'one page composes the whole sheet'],
  ['stills', 'excludes', 'encoder', VIDEO],
  ['contact', 'excludes', 'encoder', VIDEO],
  ['short', 'excludes', 'scene', "a short's spans are its scenes"],
];

/** `film render`'s flags, parsed; `span` is `--scene`'s range, read from the layout. */
export interface RenderFlags {
  readonly tag: string;
  readonly captions: boolean;
  /** `--workers`; none takes the job's default (`DRAW_WORKERS`, or the encoder's). */
  readonly workers: Option.Option<number>;
  readonly stills: Option.Option<ReadonlyArray<number>>;
  readonly contact: Option.Option<number>;
  readonly span: Option.Option<{ readonly from: number; readonly to: number }>;
  readonly from: Option.Option<number>;
  readonly to: Option.Option<number>;
  readonly scale: Option.Option<number>;
  readonly out: Option.Option<string>;
  readonly share: Option.Option<boolean>;
  /** `--encoder hardware|software`. */
  readonly encoder: Option.Option<Encoder>;
  /** `--short <id>`, looked up in the film's `shorts.ts`. */
  readonly short: Option.Option<Short>;
}

/**
 * The render `flags` ask for: stills, a contact sheet or a video, over
 * `--scene`'s span or `--from/--to`. A flag the job would ignore fails as
 * `FlagsConflict` rather than being dropped.
 */
export const jobOf = (flags: RenderFlags): Result.Result<RenderJob, FlagsConflict> => {
  const given = givenFlags({
    stills: flags.stills,
    contact: flags.contact,
    scene: flags.span,
    from: flags.from,
    to: flags.to,
    scale: flags.scale,
    out: flags.out,
    share: flags.share,
    short: flags.short,
    workers: flags.workers,
    encoder: flags.encoder,
  });
  const workers = Option.map(flags.workers, (n) => Math.max(1, n));
  const base = {
    tag: flags.tag,
    captions: flags.captions,
    cut: Option.match(flags.short, {
      onNone: () => Cut.Whole(),
      onSome: (short) => Cut.Short({ short }),
    }),
  };
  const from = Option.orElse(
    Option.map(flags.span, (s) => s.from),
    () => flags.from,
  );
  const to = Option.orElse(
    Option.map(flags.span, (s) => s.to),
    () => flags.to,
  );
  const job = Option.match(flags.stills, {
    onSome: (times) =>
      RenderJob.Stills({
        ...base,
        workers: Option.getOrElse(workers, () => DRAW_WORKERS),
        times,
      }),
    onNone: () =>
      Option.match(flags.contact, {
        onSome: (every) => RenderJob.Contact({ ...base, every, from, to }),
        onNone: () =>
          RenderJob.Video({
            ...base,
            workers,
            from,
            to,
            scale: Option.getOrElse(flags.scale, () => 1),
            out: flags.out,
            share: Option.getOrElse(flags.share, () => true),
            encoder: flags.encoder,
          }),
      }),
  });
  return Result.map(flagConflicts(given, RENDER_RULES), () => job);
};

/** Pages drawing stills at once when `--workers` is not given: they encode nothing. */
export const DRAW_WORKERS = 6;

/**
 * Pages a render on the hardware encoder runs by default. `film bench
 * --workers` over frames 0–3600 with the share copy, on the M-series Mac: 4
 * pages 69 fps, 5 79, 6 81, 7 81. Six is the knee, and its 12 encoders stay
 * under `MAX_HARDWARE_ENCODERS`.
 */
export const HARDWARE_WORKERS = 6;

/**
 * Hardware encoders a render may run at once. Measured on the M-series Mac the
 * films render on: 14 (7 pages with a share copy) ran, and at 16 every page
 * stalled with its first chunk unfinished until the encode timed out.
 */
export const MAX_HARDWARE_ENCODERS = 14;

/**
 * Pages a render on the software encoder runs by default, measured on the
 * Linux Workbox (16 cores, no GPU encoder) with `film bench
 * righteousness-by-faith --workers 4,6,8,10 --scene word,mirror --no-share`
 * (the software share is x264's, after the join): 4 pages 62 fps, 6 84, 8
 * 98, 10 104. Eight is the knee; the sweep is in packages/film/README.md.
 */
export const SOFTWARE_WORKERS = 8;

/** What an encoder allows a render: the encoders it may run at once, and the pages it opens by default. */
export interface EncoderLimits {
  readonly max: number;
  readonly workers: number;
}

/**
 * `encoder`'s limits on a machine with `cores`. The hardware encoder hangs
 * past `MAX_HARDWARE_ENCODERS`, whatever the cores. A software encoder does
 * not hang, it takes a core: a render runs at most one a core, and its
 * default pages, each drawing on one core and encoding on another, stay
 * within the cores.
 */
export const encoderLimits = (encoder: Encoder, cores: number): EncoderLimits =>
  Encoder.match(encoder, {
    Hardware: () => ({ max: MAX_HARDWARE_ENCODERS, workers: HARDWARE_WORKERS }),
    Software: () => ({
      max: cores,
      workers: Math.max(1, Math.min(SOFTWARE_WORKERS, Math.floor(cores / 2))),
    }),
  });

/** The pages a video renders on: `--workers`, else `encoder`'s default. */
export const videoWorkers = (
  workers: Option.Option<number>,
  encoder: Encoder,
  cores: number,
): number => Option.getOrElse(workers, () => encoderLimits(encoder, cores).workers);

/**
 * The encoders `workers` pages run, within `encoder`'s limit: one each, two
 * with a share copy the encoder makes in the page (`sharesInPage`).
 */
export const videoEncoders = (
  workers: number,
  share: boolean,
  encoder: Encoder,
  cores: number,
): Result.Result<number, TooManyEncoders> => {
  const { max } = encoderLimits(encoder, cores);
  const inPage = share && sharesInPage(encoder);
  return Result.liftPredicate(
    workers * (1 + Number(inPage)),
    (n) => n <= max,
    () => TooManyEncoders.make({ workers, share: inPage, max, encoder: encoderName(encoder) }),
  );
};

/** `--scene a,b`: the seconds from the first scene's start to the last one's end. */
export const sceneSpan = (
  placed: ReadonlyArray<Placed>,
  ids: ReadonlyArray<string>,
): Result.Result<{ readonly from: number; readonly to: number }, UnknownScene> =>
  Result.map(scenesOf(placed, ids), (hit) => ({
    from: Math.min(...hit.map((p) => p.start)),
    to: Math.max(...hit.map((p) => p.start + p.dur)),
  }));

/** Frames `[start, end)`. */
export interface FrameSpan {
  readonly start: number;
  readonly end: number;
}

/** Frames `[start, end)` of a video job's seconds `[from, to)`, clipped to the film at both ends. */
export const frameSpan = (
  info: ExportInfo,
  from: Option.Option<number>,
  to: Option.Option<number>,
): FrameSpan => ({
  start: Math.max(0, Math.round(Option.getOrElse(from, () => 0) * info.fps)),
  end: Math.min(info.frames, Math.round(Option.getOrElse(to, () => info.duration) * info.fps)),
});

/** A contiguous run of frames `[from, to)`, encoded to its own segment. */
export interface Chunk {
  readonly index: number;
  readonly from: number;
  readonly to: number;
}

/** About four chunks per page, so a page that finishes early pulls more work… */
export const CHUNKS_PER_WORKER = 4;
/** …but never under a second of frames, where the encoder's start-up would dominate… */
export const MIN_CHUNK_FRAMES = 30;
/**
 * …nor over eight seconds at 30 fps: a chunk crosses from the page as one
 * base64 string, about 45 MB at this size.
 */
export const MAX_CHUNK_FRAMES = 240;

/** Split `[start, end)` into in-order chunks for `workers` pages to pull from a queue. */
export const planChunks = (start: number, end: number, workers: number): ReadonlyArray<Chunk> => {
  const frames = end - start;
  if (frames <= 0) return [];
  const size = Math.min(
    MAX_CHUNK_FRAMES,
    Math.max(MIN_CHUNK_FRAMES, Math.ceil(frames / (Math.max(1, workers) * CHUNKS_PER_WORKER))),
  );
  return Arr.makeBy(Math.ceil(frames / size), (index) => ({
    index,
    from: start + index * size,
    to: Math.min(end, start + (index + 1) * size),
  }));
};

/** The frame shown at `t` seconds. */
export const frameAt = (info: ExportInfo, t: number): number =>
  Math.max(0, Math.min(info.frames - 1, Math.round(t * info.fps)));

/** A still's file name: `t0012.50.png` for 12.5 s, so names sort by time. */
export const stillName = (t: number): string => `t${t.toFixed(2).padStart(7, '0')}.png`;

/** Contact-sheet times: every `every` seconds from `from` while before `to`. */
export const contactTimes = (from: number, to: number, every: number): ReadonlyArray<number> =>
  Arr.unfold(from, (t) =>
    Option.map(
      Option.liftPredicate(t, (x) => x < to && every > 0),
      (x): readonly [number, number] => [x, x + every],
    ),
  );

const pad = (n: number, width: number) => String(n).padStart(width, '0');

/** A segment's file name, so the segments sort in frame order. */
export const segmentName = (chunk: Chunk): string => `${pad(chunk.index, 3)}.mp4`;

/** The share copy beside a video: `film.mp4` → `film.share.mp4`. */
export const shareName = (video: string): string => `${video.replace(/\.[^./]+$/, '')}.share.mp4`;

/** The contact sheet's file name, in the job's folder. */
export const contactSheetName = 'contact.jpg';

/** The look-book's file name, in the job's folder. */
export const lookbookName = 'lookbook.jpg';

/**
 * The parts of the lossless master a video plays: one stretch under a film's
 * range, or a short's spans, back to back (`shortPieces`), each join faded
 * over `JOIN_FADE`.
 */
export interface AudioCut {
  readonly file: string;
  readonly pieces: ReadonlyArray<FilmPiece>;
}

/**
 * A join between two of a short's spans fades out and in over this long: long
 * enough that the cut never clicks, short enough that a word cut on its first
 * frame (a span ends on the `{mark}` before it) keeps its onset.
 */
export const JOIN_FADE = 0.01;
