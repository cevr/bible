// What a render does, decided before a browser opens: the job, the frames it
// covers, how they split into chunks, and where each output lands. Pure, so
// the scheduling is checked without Chromium; `Renderer` only runs it.

import { Array as Arr, Data, Option, Result } from 'effect';
import type { UnknownScene } from '../core/errors.ts';
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

/** Frames `[start, end)` of a video job's seconds `[from, to)`. */
export const frameSpan = (
  info: ExportInfo,
  from: Option.Option<number>,
  to: Option.Option<number>,
): FrameSpan => ({
  start: Math.round(Option.getOrElse(from, () => 0) * info.fps),
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
