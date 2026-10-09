// What a render does, decided before a browser opens: the job, the frames it
// covers, how they split into chunks, and where each output lands. Pure, so
// the scheduling is checked without Chromium; `Renderer` only runs it.

import { Array as Arr, Data, Match, Option, Result } from 'effect';
import type { Address, Scope } from '../core/address.ts';
import type { RenderKind, RenderSound } from '../core/catalogue.ts';
import { Encoder, encoderName, sharesInPage } from '../core/encoder.ts';
import { FlagsConflict, TooManyEncoders } from './errors.ts';
import type { Short } from '../core/schema.ts';
import { frameAtOrAfter } from '../core/time.ts';
import type { ExportInfo } from '../core/export-handle.ts';
import { type FilmPiece, shortKey } from '../core/shorts.ts';

interface JobBase {
  /** The part of the film it draws: where its files go in the project folder (`renderPaths`). */
  readonly address: Address;
  /** Which of the address's renders it is (`Variant`): its files are named for it. */
  readonly variant: string;
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

/** `name` as one folder name: lower case, each run of other than letters, digits, `.` and `_` a `-`. */
const slug = (name: string): string =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9._]+/g, '-')
    .replace(/^-+|-+$/g, '');

/**
 * The folder an address's renders go in, under the project folder: `film`,
 * `acts/<act>`, `scenes/<id>[+<id>…]` or `shorts/<id>`. Written only: the
 * catalogue records every file, so nothing reads a path back.
 */
const addressFolder = (address: Address): string =>
  Match.valueTags(address, {
    Film: () => 'film',
    Act: ({ act }) => `acts/${slug(act)}`,
    Scenes: ({ ids }) => `scenes/${ids.map(slug).join('+')}`,
    Short: ({ id }) => `shorts/${id}`,
  });

/** Where one render's files go in the film's project folder (`out/<film>`). */
interface RenderPaths {
  /** `<address>/<variant>.mp4`; its share copy, captions and chapters beside it (`shareName`, `captionsName`, `chaptersName`). */
  readonly clip: string;
  /** `<address>/<variant>/`: its stills (`stills/`), contact sheet and look-book. */
  readonly dir: string;
}

/** The files of `address`'s `variant` render under `project`. */
export const renderPaths = (project: string, address: Address, variant: string): RenderPaths => {
  const folder = `${project}/${addressFolder(address)}`;
  return { clip: `${folder}/${variant}.mp4`, dir: `${folder}/${variant}` };
};

/** The captions beside a video: `main.mp4` → `main.vtt`. */
export const captionsName = (video: string): string => `${video.replace(/\.[^./]+$/, '')}.vtt`;

/** The YouTube chapters beside a video: `main.mp4` → `main.chapters.txt`. */
export const chaptersName = (video: string): string =>
  `${video.replace(/\.[^./]+$/, '')}.chapters.txt`;

/** What a render wrote, by path: what the catalogue records of it. */
export interface RenderOutput {
  readonly kind: RenderKind;
  readonly clip: Option.Option<string>;
  readonly share: Option.Option<string>;
  readonly captions: Option.Option<string>;
  readonly chapters: Option.Option<string>;
  /** Stills (in time order), a contact sheet or a look-book. */
  readonly images: ReadonlyArray<string>;
  /** The sound a video carries: none for a silent one, and for images. */
  readonly sound: Option.Option<RenderSound>;
  /**
   * The seconds it drew when the command's own range narrowed it (a contact
   * sheet's `--from/--to`, clipped to what it covers); none when it drew all
   * its address spans.
   */
  readonly span: Scope['span'];
}

/** What an image job wrote: its images and nothing else, over `span` when a range narrowed it. */
export const imagesOutput = (
  kind: RenderKind,
  images: ReadonlyArray<string>,
  span: Scope['span'] = Option.none(),
): RenderOutput => ({
  kind,
  clip: Option.none(),
  share: Option.none(),
  captions: Option.none(),
  chapters: Option.none(),
  images,
  sound: Option.none(),
  span,
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
    /**
     * `--out`: a file of the caller's, outside the project folder and so not
     * recorded in its catalogue. None writes `renderPaths(…).clip`.
     */
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
const RANGED = 'the address sets the range from the layout';

/** Render flags where one would silently win over, or ignore, the other. */
const RENDER_RULES: ReadonlyArray<FlagRule> = [
  ['stills', 'excludes', 'contact', 'a render writes stills or a contact sheet, not both'],
  ['stills', 'excludes', 'scene', STILLS],
  ['stills', 'excludes', 'act', STILLS],
  ['stills', 'excludes', 'from', STILLS],
  ['stills', 'excludes', 'to', STILLS],
  ['scene', 'excludes', 'from', RANGED],
  ['scene', 'excludes', 'to', RANGED],
  ['act', 'excludes', 'from', RANGED],
  ['act', 'excludes', 'to', RANGED],
  ['stills', 'excludes', 'scale', VIDEO],
  ['stills', 'excludes', 'out', VIDEO],
  ['stills', 'excludes', 'share', VIDEO],
  ['contact', 'excludes', 'scale', VIDEO],
  ['contact', 'excludes', 'out', VIDEO],
  ['contact', 'excludes', 'share', VIDEO],
  ['contact', 'excludes', 'workers', 'one page composes the whole sheet'],
  ['stills', 'excludes', 'encoder', VIDEO],
  ['contact', 'excludes', 'encoder', VIDEO],
];

const STRETCH = "a stretch is not the film's render: write it with --out";

/**
 * A video's own rules: a stretch of the film or a short written to the
 * address's clip would replace its whole render, and be catalogued as it.
 */
const VIDEO_RULES: ReadonlyArray<FlagRule> = [
  ['from', 'needs', 'out', STRETCH],
  ['to', 'needs', 'out', STRETCH],
];

/** The flag an address was named by: none for the whole film. */
const addressFlag = (address: Address): Option.Option<string> =>
  Match.valueTags(address, {
    Film: () => Option.none(),
    Act: () => Option.some('act'),
    Scenes: () => Option.some('scene'),
    Short: () => Option.some('short'),
  });

/** `film render`'s flags, parsed; `scope` is the address (`--act`, `--scene`, `--short`) resolved against the layout. */
interface RenderFlags {
  readonly variant: string;
  readonly captions: boolean;
  /** `--workers`; none takes the job's default (`DRAW_WORKERS`, or the encoder's). */
  readonly workers: Option.Option<number>;
  readonly stills: Option.Option<ReadonlyArray<number>>;
  readonly contact: Option.Option<number>;
  readonly scope: Scope;
  readonly from: Option.Option<number>;
  readonly to: Option.Option<number>;
  readonly scale: Option.Option<number>;
  readonly out: Option.Option<string>;
  readonly share: Option.Option<boolean>;
  /** `--encoder hardware|software`. */
  readonly encoder: Option.Option<Encoder>;
}

/**
 * The render `flags` ask for: stills, a contact sheet or a video, of the
 * whole film or its short, over the address's span or `--from/--to`. A flag
 * the job would ignore fails as `FlagsConflict` rather than being dropped.
 */
export const jobOf = (flags: RenderFlags): Result.Result<RenderJob, FlagsConflict> => {
  const given = new Set([
    ...givenFlags({
      stills: flags.stills,
      contact: flags.contact,
      from: flags.from,
      to: flags.to,
      scale: flags.scale,
      out: flags.out,
      share: flags.share,
      workers: flags.workers,
      encoder: flags.encoder,
    }),
    ...Option.toArray(addressFlag(flags.scope.address)),
  ]);
  const workers = Option.map(flags.workers, (n) => Math.max(1, n));
  const base = {
    address: flags.scope.address,
    variant: flags.variant,
    captions: flags.captions,
    cut: Option.match(flags.scope.short, {
      onNone: () => Cut.Whole(),
      onSome: (short) => Cut.Short({ short }),
    }),
  };
  const from = Option.orElse(
    Option.map(flags.scope.span, (s) => s.from),
    () => flags.from,
  );
  const to = Option.orElse(
    Option.map(flags.scope.span, (s) => s.to),
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
  const rules = Match.value(job).pipe(
    Match.tag('Video', () => [...RENDER_RULES, ...VIDEO_RULES]),
    Match.orElse(() => RENDER_RULES),
  );
  return Result.map(flagConflicts(given, rules), () => job);
};

/** Pages drawing stills at once when `--workers` is not given: they encode nothing. */
export const DRAW_WORKERS = 6;

/**
 * Pages a render on the hardware encoder runs by default. Renders of frames
 * 0–3600 with the share copy, timed at each page count on the M-series Mac: 4
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
 * Linux Workbox (16 cores, no GPU encoder) by timing renders of two scenes
 * at 4, 6, 8 and 10 pages without the share copy (the software share is
 * x264's, after the join): 4 pages 62 fps, 6 84, 8 98, 10 104. Eight is the
 * knee.
 */
export const SOFTWARE_WORKERS = 8;

/** What an encoder allows a render: the encoders it may run at once, and the pages it opens by default. */
interface EncoderLimits {
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

/** Frames `[start, end)`. */
interface FrameSpan {
  readonly start: number;
  readonly end: number;
}

/**
 * Frames `[start, end)` of a video job's seconds `[from, to)`, clipped to the
 * film at both ends: the frames that start inside the span (`frameAtOrAfter`,
 * core/time.ts), which is also how the film's own frames are counted.
 */
export const frameSpan = (
  info: ExportInfo,
  from: Option.Option<number>,
  to: Option.Option<number>,
): FrameSpan => ({
  start: Math.max(
    0,
    frameAtOrAfter(
      Option.getOrElse(from, () => 0),
      info.fps,
    ),
  ),
  end: Math.min(
    info.frames,
    frameAtOrAfter(
      Option.getOrElse(to, () => info.duration),
      info.fps,
    ),
  ),
});

/** A contiguous run of frames `[from, to)`, encoded to its own segment. */
export interface Chunk {
  readonly index: number;
  readonly from: number;
  readonly to: number;
}

/** About four chunks per page, so a page that finishes early pulls more work… */
const CHUNKS_PER_WORKER = 4;
/** …but never under a second of frames, where the encoder's start-up would dominate… */
export const MIN_CHUNK_FRAMES = 30;
/**
 * …nor over eight seconds at 30 fps: a chunk crosses from the page as one
 * base64 string, about 45 MB at this size.
 */
export const MAX_CHUNK_FRAMES = 240;

/**
 * `frames` split into as many near-equal chunks as `size` needs, each at most
 * `size`, and none under `MIN_CHUNK_FRAMES` where there are frames for it.
 */
const evenly = (frames: number, size: number): ReadonlyArray<number> => {
  const n = Math.max(1, Math.min(Math.ceil(frames / size), Math.floor(frames / MIN_CHUNK_FRAMES)));
  return Arr.makeBy(n, (k) => Math.floor(((k + 1) * frames) / n) - Math.floor((k * frames) / n));
};

/**
 * The tail's chunks, in the order the pages pull them: `pages` of half
 * `size`, then `pages` of a quarter, and so on while a chunk keeps a second
 * of frames. Frame costs vary twentyfold between scenes, so one full chunk
 * pulled last can hold every other page idle; halving them makes the last
 * chunk each page pulls its smallest, and the pages finish together.
 */
const tailSizes = (size: number, pages: number): ReadonlyArray<number> =>
  Arr.unfold(Math.floor(size / 2), (n) =>
    Option.map(
      Option.liftPredicate(n, (k) => k >= MIN_CHUNK_FRAMES),
      (k): readonly [ReadonlyArray<number>, number] => [
        Arr.makeBy(pages, () => k),
        Math.floor(k / 2),
      ],
    ),
  ).flat();

/** `frames` as chunk sizes, in order: `size` and under, then the tail; evenly when too short for it. */
const chunkSizes = (frames: number, size: number, pages: number): ReadonlyArray<number> => {
  const tail = tailSizes(size, pages);
  const head = frames - tail.reduce((sum, n) => sum + n, 0);
  if (head < MIN_CHUNK_FRAMES) return evenly(frames, size);
  return [...evenly(head, size), ...tail];
};

/**
 * Split `[start, end)` into in-order chunks for `workers` pages to pull from
 * a queue: about four a page of `size` frames, then the halving tail
 * (`tailSizes`). A range too short for the tail splits evenly.
 */
export const planChunks = (start: number, end: number, workers: number): ReadonlyArray<Chunk> => {
  const frames = end - start;
  if (frames <= 0) return [];
  const pages = Math.max(1, workers);
  const size = Math.min(
    MAX_CHUNK_FRAMES,
    Math.max(MIN_CHUNK_FRAMES, Math.ceil(frames / (pages * CHUNKS_PER_WORKER))),
  );
  const sizes = chunkSizes(frames, size, pages);
  const ends = Arr.scan(sizes, start, (at, n) => at + n);
  return Arr.makeBy(sizes.length, (index) => ({
    index,
    from: ends[index] ?? start,
    to: ends[index + 1] ?? end,
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
