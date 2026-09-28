// What a render does, decided before a browser opens: the job, the frames it
// covers, how they split into chunks, and where each output lands. Pure, so
// the scheduling is checked without Chromium; `Renderer` only runs it.

import { Array as Arr, Data, Option, Result } from 'effect';
import type { UnknownScene } from '../core/errors.ts';
import { FlagsConflict, TooManyEncoders } from './errors.ts';
import { type Placed, scenesOf } from '../core/layout.ts';
import type { ExportInfo } from '../core/schema.ts';

interface JobBase {
  /** Output subfolder under `out/<film>`, so parallel renders do not collide. */
  readonly tag: string;
  /** Burn the captions in. */
  readonly captions: boolean;
  /** Pages rendering at once. */
  readonly workers: number;
}

/** A render: the film as video, a few stills, a contact sheet, or its look-book. */
export type RenderJob = Data.TaggedEnum<{
  Video: JobBase & {
    readonly from: Option.Option<number>;
    readonly to: Option.Option<number>;
    readonly scale: number;
    /** Default `out/<film>.mp4`. */
    readonly out: Option.Option<string>;
    /** Also a small copy to send, encoded in the same pass: `shareName(out)`. */
    readonly share: boolean;
  };
  Stills: JobBase & { readonly times: ReadonlyArray<number> };
  Contact: JobBase & {
    readonly every: number;
    readonly from: Option.Option<number>;
    readonly to: Option.Option<number>;
  };
  /** Every scene's stills at its cue edges and 60% point, with the palette: `lookbook.jpg`. */
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
];

/** `film render`'s flags, parsed; `span` is `--scene`'s range, read from the layout. */
export interface RenderFlags {
  readonly tag: string;
  readonly captions: boolean;
  readonly workers: number;
  readonly stills: Option.Option<ReadonlyArray<number>>;
  readonly contact: Option.Option<number>;
  readonly span: Option.Option<{ readonly from: number; readonly to: number }>;
  readonly from: Option.Option<number>;
  readonly to: Option.Option<number>;
  readonly scale: Option.Option<number>;
  readonly out: Option.Option<string>;
  readonly share: Option.Option<boolean>;
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
  });
  const base = { tag: flags.tag, captions: flags.captions, workers: Math.max(1, flags.workers) };
  const from = Option.orElse(
    Option.map(flags.span, (s) => s.from),
    () => flags.from,
  );
  const to = Option.orElse(
    Option.map(flags.span, (s) => s.to),
    () => flags.to,
  );
  const job = Option.match(flags.stills, {
    onSome: (times) => RenderJob.Stills({ ...base, times }),
    onNone: () =>
      Option.match(flags.contact, {
        onSome: (every) => RenderJob.Contact({ ...base, every, from, to }),
        onNone: () =>
          RenderJob.Video({
            ...base,
            from,
            to,
            scale: Option.getOrElse(flags.scale, () => 1),
            out: flags.out,
            share: Option.getOrElse(flags.share, () => true),
          }),
      }),
  });
  return Result.map(flagConflicts(given, RENDER_RULES), () => job);
};

/**
 * Pages a render runs by default. `film bench --workers` over frames 0–3600
 * with the share copy: 4 pages 69 fps, 5 79, 6 81, 7 81. Six is the knee, and
 * its 12 encoders stay under `MAX_ENCODERS`.
 */
export const DEFAULT_WORKERS = 6;

/**
 * Hardware encoders a render may run at once. Measured on the M-series Mac the
 * films render on: 14 (7 pages with a share copy) ran, and at 16 every page
 * stalled with its first chunk unfinished until the encode timed out.
 */
export const MAX_ENCODERS = 14;

/** The hardware encoders `workers` pages run (two each with a share copy), within `MAX_ENCODERS`. */
export const videoEncoders = (
  workers: number,
  share: boolean,
): Result.Result<number, TooManyEncoders> =>
  Result.liftPredicate(
    workers * (1 + Number(share)),
    (n) => n <= MAX_ENCODERS,
    () => TooManyEncoders.make({ workers, share, max: MAX_ENCODERS }),
  );

/** A job's hardware encoders: a video's `videoEncoders`; stills and sheets encode none. */
export const encoderBudget = (job: RenderJob): Result.Result<number, TooManyEncoders> =>
  RenderJob.$match(job, {
    Video: ({ workers, share }) => videoEncoders(workers, share),
    Stills: () => Result.succeed(0),
    Contact: () => Result.succeed(0),
    LookBook: () => Result.succeed(0),
  });

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

/** The part of the lossless master under a range: from `start`, `duration` long. */
export interface AudioCut {
  readonly file: string;
  readonly start: number;
  readonly duration: number;
}
