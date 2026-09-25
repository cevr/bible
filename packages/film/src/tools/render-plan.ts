// What a render does, decided before a browser opens: the job, the frames it
// covers, how they split into chunks, where each output lands, and the ffmpeg
// arguments that stitch them. Pure, so the scheduling is checked without
// Chromium or ffmpeg; `Renderer` only runs it.

import { Array as Arr, Data, Option, Result } from 'effect';
import { UnknownScene } from '../core/errors.ts';
import type { Placed } from '../core/layout.ts';
import type { ExportInfo } from '../core/schema.ts';

interface JobBase {
  /** Output subfolder under `out/<film>`, so parallel renders do not collide. */
  readonly tag: string;
  /** Burn the captions in. */
  readonly captions: boolean;
  /** Pages rendering at once. */
  readonly workers: number;
}

/** A render: the film as video, a few stills, or a contact sheet. */
export type RenderJob = Data.TaggedEnum<{
  Video: JobBase & {
    readonly from: Option.Option<number>;
    readonly to: Option.Option<number>;
    readonly scale: number;
    /** Default `out/<film>.mp4`. */
    readonly out: Option.Option<string>;
  };
  Stills: JobBase & { readonly times: ReadonlyArray<number> };
  Contact: JobBase & {
    readonly every: number;
    readonly from: Option.Option<number>;
    readonly to: Option.Option<number>;
  };
}>;
export const RenderJob = Data.taggedEnum<RenderJob>();

/** `--scene a,b`: the seconds from the first scene's start to the last one's end. */
export const sceneSpan = (
  placed: ReadonlyArray<Placed>,
  ids: ReadonlyArray<string>,
): Result.Result<{ readonly from: number; readonly to: number }, UnknownScene> => {
  const missing = Arr.findFirst(ids, (id) => !placed.some((p) => p.spec.id === id));
  if (Option.isSome(missing)) return Result.fail(UnknownScene.make({ scene: missing.value }));
  const hit = placed.filter((p) => ids.includes(p.spec.id));
  return Result.succeed({
    from: Math.min(...hit.map((p) => p.start)),
    to: Math.max(...hit.map((p) => p.start + p.dur)),
  });
};

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
/** …but never under a second of frames, where ffmpeg's start-up would dominate. */
export const MIN_CHUNK_FRAMES = 30;

/** Split `[start, end)` into in-order chunks for `workers` pages to pull from a queue. */
export const planChunks = (start: number, end: number, workers: number): ReadonlyArray<Chunk> => {
  const frames = end - start;
  if (frames <= 0) return [];
  const size = Math.max(
    MIN_CHUNK_FRAMES,
    Math.ceil(frames / (Math.max(1, workers) * CHUNKS_PER_WORKER)),
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

/** A segment's file name, so the concat list sorts in frame order. */
export const segmentName = (chunk: Chunk): string => `${pad(chunk.index, 3)}.mp4`;

/** A contact frame's file name. */
export const contactName = (k: number): string => `${pad(k, 4)}.jpg`;

/** ffmpeg: PNG frames on stdin to one H.264 segment. */
export const segmentArgs = (fps: number, scale: number, file: string): ReadonlyArray<string> => [
  '-y',
  '-loglevel',
  'error',
  '-f',
  'image2pipe',
  '-framerate',
  String(fps),
  '-i',
  '-',
  ...Arr.match(
    Arr.filter([scale], (s) => s !== 1),
    {
      onEmpty: () => [],
      onNonEmpty: ([s]) => ['-vf', `scale=iw*${s}:ih*${s}:flags=lanczos`],
    },
  ),
  '-c:v',
  'libx264',
  '-preset',
  'slow',
  '-crf',
  '15',
  '-pix_fmt',
  'yuv420p',
  '-tune',
  'animation',
  file,
];

/** The part of the lossless master under a range: from `start`, `duration` long. */
export interface AudioCut {
  readonly file: string;
  readonly start: number;
  readonly duration: number;
}

/** The concat list for ffmpeg's concat demuxer. */
export const concatList = (segments: ReadonlyArray<string>): string =>
  segments.map((s) => `file '${s}'`).join('\n');

/**
 * ffmpeg: the segments joined in order (no re-encode), with the audio cut from
 * the WAV master and encoded to AAC once.
 */
export const muxArgs = (
  list: string,
  audio: Option.Option<AudioCut>,
  out: string,
): ReadonlyArray<string> => [
  '-y',
  '-loglevel',
  'error',
  '-f',
  'concat',
  '-safe',
  '0',
  '-i',
  list,
  ...Option.match(audio, {
    onNone: () => [],
    onSome: (a) => [
      '-ss',
      a.start.toFixed(6),
      '-t',
      a.duration.toFixed(6),
      '-i',
      a.file,
      '-c:a',
      'aac',
      '-b:a',
      '192k',
    ],
  }),
  '-c:v',
  'copy',
  '-movflags',
  '+faststart',
  out,
];

/** ffmpeg: `count` numbered JPEGs tiled six across into one sheet. */
export const contactArgs = (
  pattern: string,
  count: number,
  sheet: string,
): ReadonlyArray<string> => {
  const cols = 6;
  const rows = Math.max(1, Math.ceil(count / cols));
  return [
    '-y',
    '-loglevel',
    'error',
    '-framerate',
    '1',
    '-i',
    pattern,
    '-vf',
    `scale=480:-1,tile=${cols}x${rows}:padding=4`,
    '-frames:v',
    '1',
    '-q:v',
    '3',
    sheet,
  ];
};
