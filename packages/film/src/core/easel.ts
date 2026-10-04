// The easel's words, shared by the page, the lab and the CLI: where a look is
// taken in a scene (seconds into it, `mark:<name>`, `cue:<name>[@<share>]`),
// how it is shown (a crop at 1:1, a long side, the value or squint view), and
// what the lab answers. A look is one still of the scene as its sources stand,
// drawn by a page the lab holds warm (`tools/easel.ts`): no render. Pure.

import { Array as Arr, Match, Option, Result, Schema } from 'effect';
import type { Placed } from './layout.ts';

/** A scene's clock as a look reads it: where it sits in the film, and its marks and cues in scene-local seconds. */
export const SceneTimes = Schema.Struct({
  id: Schema.String,
  /** Film seconds it starts at. */
  start: Schema.Finite,
  dur: Schema.Finite,
  /** Each mark's word, heard at this many seconds into the scene. */
  marks: Schema.Record(Schema.String, Schema.Finite),
  /** Each named cue's span, in seconds into the scene. */
  cues: Schema.Record(Schema.String, Schema.Struct({ start: Schema.Finite, end: Schema.Finite })),
});
export type SceneTimes = typeof SceneTimes.Type;

/** A placed scene's clock (`SceneTimes`): what the page hands the lab, and the judge reads in its own process. */
export const sceneTimesOf = (p: Placed): SceneTimes => ({
  id: p.spec.id,
  start: p.start,
  dur: p.dur,
  marks: Object.fromEntries([...p.voice.marks].map(([name, at]) => [name, p.speechStart + at])),
  cues: Object.fromEntries([...p.cues].map(([name, c]) => [name, { start: c.start, end: c.end }])),
});

// ---------------------------------------------------------------------------
// What a look refuses, each its own class (a tool reads the tag): the request
// unreadable, a mark or cue the scene lacks, seconds past its end, the pages
// not built, the page failing, and a lab that serves another checkout.

/** A look asked in words the lab cannot read: a place, a crop. */
export class LookInvalid extends Schema.TaggedError<LookInvalid>()('LookInvalid', {
  reason: Schema.String,
}) {
  override get message() {
    return `look: ${this.reason}`;
  }
}

/** A mark or cue the scene does not have: named with the ones it has. */
export class LookPlaceUnknown extends Schema.TaggedError<LookPlaceUnknown>()('LookPlaceUnknown', {
  scene: Schema.String,
  kind: Schema.Literals(['mark', 'cue']),
  place: Schema.String,
  known: Schema.Array(Schema.String),
}) {
  override get message() {
    return `scene ${this.scene} has no ${this.kind} "${this.place}" (its ${this.kind}s: ${this.known.join(', ') || 'none'})`;
  }
}

/** Seconds past the scene's end. */
export class LookOutOfRange extends Schema.TaggedError<LookOutOfRange>()('LookOutOfRange', {
  scene: Schema.String,
  seconds: Schema.Finite,
  dur: Schema.Finite,
}) {
  override get message() {
    return `${this.seconds} s is past the end of scene ${this.scene} (it lasts ${this.dur.toFixed(2)} s)`;
  }
}

/** The lab's pages did not build: the bundler's words, and no still. */
export class PagesBroken extends Schema.TaggedError<PagesBroken>()('PagesBroken', {
  reason: Schema.String,
}) {
  override get message() {
    return `the lab's pages do not build:\n${this.reason}`;
  }
}

/** The page could not draw the look: the scene threw, the page crashed or did not load. */
export class LookFailed extends Schema.TaggedError<LookFailed>()('LookFailed', {
  reason: Schema.String,
}) {
  override get message() {
    return `the look failed: ${this.reason}`;
  }
}

/** A lab serving another checkout's films than the asker edits. */
export class LabElsewhere extends Schema.TaggedError<LabElsewhere>()('LabElsewhere', {
  lab: Schema.String,
  here: Schema.String,
}) {
  override get message() {
    return `this lab serves ${this.lab}, not ${this.here}: start a lab from this checkout (LAB_PORT=<port> bun run lab) and point FILM_LAB_URL at it`;
  }
}

/** No lab answered the look at `url`, or it answered something else than a look. */
export class LabDown extends Schema.TaggedError<LabDown>()('LabDown', {
  url: Schema.String,
  reason: Schema.String,
}) {
  override get message() {
    return `no lab answered a look at ${this.url} (${this.reason}): start one (bun run lab, or LAB_PORT=<port> bun cli.ts lab) and point FILM_LAB_URL at it`;
  }
}

/** A wedge naming a look `palette.ts` does not declare, or a level its look lacks. */
export class LookLevelUnknown extends Schema.TaggedError<LookLevelUnknown>()('LookLevelUnknown', {
  look: Schema.String,
  level: Schema.String,
  missing: Schema.Literals(['look', 'level']),
  known: Schema.Array(Schema.String),
}) {
  override get message() {
    if (this.missing === 'look')
      return `the film has no look "${this.look}" (its looks: ${this.known.join(', ') || 'none'})`;
    return `look ${this.look} has no level "${this.level}" (its levels: ${this.known.join(', ')})`;
  }
}

/** Why a place names no frame of a scene. */
export type PlaceError = LookInvalid | LookPlaceUnknown | LookOutOfRange;

/** Where in a scene a look is taken, as written: seconds, a mark, or a share of a cue (0 its start). */
type LookAt =
  | { readonly _tag: 'Seconds'; readonly seconds: number }
  | { readonly _tag: 'Mark'; readonly mark: string }
  | { readonly _tag: 'Cue'; readonly cue: string; readonly share: number };

const SECONDS = /^\d+(?:\.\d+)?$/;

const invalid = (reason: string) => Result.fail(LookInvalid.make({ reason }));

/** `text` read as a place in a scene, or why it is none. */
export const lookAtOf = (text: string): Result.Result<LookAt, LookInvalid> => {
  if (SECONDS.test(text)) return Result.succeed({ _tag: 'Seconds', seconds: Number(text) });
  if (text.startsWith('mark:') && text.length > 5)
    return Result.succeed({ _tag: 'Mark', mark: text.slice(5) });
  if (!text.startsWith('cue:') || text.length <= 4)
    return invalid(
      `"${text}" is no place in a scene: seconds into it, mark:<name> or cue:<name>[@<0..1>]`,
    );
  const [cue = '', ...shares] = text.slice(4).split('@');
  if (cue === '' || shares.length > 1) return invalid(`"${text}" names no cue`);
  return Option.match(Arr.head(shares), {
    onNone: () => Result.succeed<LookAt>({ _tag: 'Cue', cue, share: 0 }),
    onSome: (share) => {
      const n = Number(share);
      if (share === '' || !Number.isFinite(n) || n < 0 || n > 1)
        return invalid(`"${text}": a cue's share is a number from 0 (its start) to 1 (its end)`);
      return Result.succeed<LookAt>({ _tag: 'Cue', cue, share: n });
    },
  });
};

/** A look's place resolved: the frame drawn, and its time in seconds into the scene. */
interface Moment {
  /** The place as it was written. */
  readonly at: string;
  readonly frame: number;
  /** Seconds into the scene of the frame drawn. */
  readonly time: number;
}

/** The scene-local second `at` names in `scene`, or why it names none. */
const secondOf = (
  scene: SceneTimes,
  at: LookAt,
): Result.Result<number, LookPlaceUnknown | LookOutOfRange> =>
  Match.valueTags(at, {
    Seconds: ({ seconds }) => {
      if (seconds > scene.dur)
        return Result.fail(LookOutOfRange.make({ scene: scene.id, seconds, dur: scene.dur }));
      return Result.succeed(seconds);
    },
    Mark: ({ mark }) =>
      Result.fromOption(Option.fromUndefinedOr(scene.marks[mark]), () =>
        LookPlaceUnknown.make({
          scene: scene.id,
          kind: 'mark',
          place: mark,
          known: Object.keys(scene.marks),
        }),
      ),
    Cue: ({ cue, share }) =>
      Result.fromOption(
        Option.map(
          Option.fromUndefinedOr(scene.cues[cue]),
          (c) => c.start + share * (c.end - c.start),
        ),
        () =>
          LookPlaceUnknown.make({
            scene: scene.id,
            kind: 'cue',
            place: cue,
            known: Object.keys(scene.cues),
          }),
      ),
  });

/**
 * `text` (`lookAtOf`) as the frame of `scene` it names at `fps`: the nearest
 * frame, held inside the scene's own frames, and that frame's time in the
 * scene. A place unreadable or the scene lacks, or seconds past its end, fails.
 */
export const momentOf = (
  scene: SceneTimes,
  fps: number,
  text: string,
): Result.Result<Moment, PlaceError> =>
  Result.flatMap(lookAtOf(text), (at) =>
    Result.map(secondOf(scene, at), (second) => {
      const first = Math.ceil(scene.start * fps - 1e-6);
      const last = Math.max(first, Math.ceil((scene.start + scene.dur) * fps - 1e-6) - 1);
      const frame = Math.min(last, Math.max(first, Math.round((scene.start + second) * fps)));
      return { at: text, frame, time: frame / fps - scene.start };
    }),
  );

/** How a look is shown: plain, in greys (`value`), or in greys and blurred to read its masses (`squint`). */
export const LookMode = Schema.Literals(['plain', 'value', 'squint']);
export type LookMode = typeof LookMode.Type;

/**
 * The file format a look takes unless told: a crop is read pixel by pixel,
 * so lossless PNG; a whole frame is read for its composition, so JPEG (at
 * 0.95), since the paper's grain makes a 1920×1080 PNG about 4 MB and a
 * reader's image store takes about 2 MB.
 */
export const formatFor = (cropped: boolean): StillView['format'] => {
  if (cropped) return 'image/png';
  return 'image/jpeg';
};

/** A region of the frame: two opposite corners, in canvas pixels. */
const Crop = Schema.Tuple([Schema.Finite, Schema.Finite, Schema.Finite, Schema.Finite]);
type Crop = typeof Crop.Type;

/** `x0,y0,x1,y1` read as a crop, or why it is none. */
export const cropOf = (text: string): Result.Result<Crop, LookInvalid> => {
  const parts = text.split(',').map((n) => n.trim());
  const corners = parts.map(Number);
  const [x0 = 0, y0 = 0, x1 = 0, y1 = 0] = corners;
  if (parts.length !== 4 || parts.includes('') || !corners.every(Number.isFinite))
    return invalid(`"${text}" is no crop: four pixel numbers, x0,y0,x1,y1`);
  return Result.succeed([x0, y0, x1, y1]);
};

/** The longest side a look is asked at. */
export const LOOK_MAX_SIZE = 4096;

/**
 * How a look is shown, as it crosses into the page (plain data): the region
 * (the whole frame without one) at 1:1 unless `size` sets the long side, the
 * mode, the captions burned in or not, and the file's format.
 */
export const StillView = Schema.Struct({
  crop: Schema.optionalKey(Crop),
  size: Schema.optionalKey(
    Schema.Int.check(Schema.isBetween({ minimum: 16, maximum: LOOK_MAX_SIZE })),
  ),
  mode: LookMode,
  captions: Schema.Boolean,
  format: Schema.Literals(['image/png', 'image/jpeg']),
});
export type StillView = typeof StillView.Type;

/** A look's region and size in pixels, and the canvas filter it is drawn through. */
interface ViewBox {
  readonly sx: number;
  readonly sy: number;
  readonly sw: number;
  readonly sh: number;
  readonly dw: number;
  readonly dh: number;
  /** Drawn in greys (`value`, `squint`). */
  readonly grey: boolean;
  /** The blur's radius in pixels of the still: 0 but for `squint`. */
  readonly blur: number;
}

/** The squint's blur, as a share of the look's long side (claude-paint's easel: 1.2 %, at least 2 px). */
const SQUINT = 0.012;

/**
 * `view` over a `width` × `height` frame: its crop held to the frame (a crop
 * wholly off it, or with no area, is the reason), at 1:1 or scaled to `size`
 * on its long side, and its mode: greys for `value`, greys and a blur for
 * `squint`.
 */
export const viewBox = (
  view: StillView,
  width: number,
  height: number,
): Result.Result<ViewBox, LookInvalid> => {
  const [x0, y0, x1, y1] = Option.getOrElse(Option.fromUndefinedOr(view.crop), (): Crop => [
    0,
    0,
    width,
    height,
  ]);
  const sx = Math.max(0, Math.round(Math.min(x0, x1)));
  const sy = Math.max(0, Math.round(Math.min(y0, y1)));
  const ex = Math.min(width, Math.round(Math.max(x0, x1)));
  const ey = Math.min(height, Math.round(Math.max(y0, y1)));
  if (ex - sx < 1 || ey - sy < 1)
    return invalid(
      `the crop ${[x0, y0, x1, y1].join(',')} holds none of the ${width}×${height} frame`,
    );
  const sw = ex - sx;
  const sh = ey - sy;
  const scale = Option.match(Option.fromUndefinedOr(view.size), {
    onNone: () => 1,
    onSome: (size) => size / Math.max(sw, sh),
  });
  const dw = Math.max(1, Math.round(sw * scale));
  const dh = Math.max(1, Math.round(sh * scale));
  const squint = Math.round(Math.max(2, SQUINT * Math.max(dw, dh)) * 10) / 10;
  const { grey, blur } = {
    plain: { grey: false, blur: 0 },
    value: { grey: true, blur: 0 },
    squint: { grey: true, blur: squint },
  }[view.mode];
  return Result.succeed({ sx, sy, sw, sh, dw, dh, grey, blur });
};

/** A look asked of the lab: the scene, its places (`momentOf`), how it is shown, and the films folder the asker edits. */
export const LookPost = Schema.Struct({
  scene: Schema.String,
  at: Schema.NonEmptyArray(Schema.String),
  view: StillView,
  /**
   * The asker's films folder, absolute: a lab serving another checkout's
   * films refuses (`LabElsewhere`) rather than show their scene.
   */
  from: Schema.optionalKey(Schema.String),
  /**
   * A wedge: each look named drawn at the level given in place of the one it
   * plays (`palette.ts`'s `looks`), the pick left unwritten, so the levels a
   * choice offers are seen side by side before one is picked.
   */
  levels: Schema.optionalKey(Schema.Record(Schema.String, Schema.String)),
});
export type LookPost = typeof LookPost.Type;

/** A wedge's levels as one name, in look order: `ground-light`; empty for none. */
export const wedgeName = (levels: Readonly<Record<string, string>>): string =>
  Object.entries(levels)
    .toSorted(([a], [b]) => a.localeCompare(b))
    .map(([look, level]) => `${look}-${level}`)
    .join('.');

/** One still a look wrote: its file, and where it was taken. */
export const Look = Schema.Struct({
  /** The PNG or JPEG, absolute, under the film's `out/<film>/look/<scene>/`. */
  file: Schema.String,
  scene: Schema.String,
  at: Schema.String,
  frame: Schema.Int,
  /** Seconds into the scene of the frame drawn. */
  time: Schema.Finite,
  width: Schema.Int,
  height: Schema.Int,
});
export type Look = typeof Look.Type;

/** What the lab answers a look: the build the stills were drawn from, and each still. */
export const LookTaken = Schema.Struct({
  /** The pages' build, `<server>.<number>`: a still of another build may show other code. */
  build: Schema.String,
  looks: Schema.Array(Look),
});
export type LookTaken = typeof LookTaken.Type;

/** A still's file extension by its format. */
const EXTENSION: Readonly<Record<StillView['format'], string>> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
};

/**
 * A still's file name in its scene's folder: its time, how it is shown and
 * the build it was drawn from, so a still once written is never rewritten
 * with other pixels (frames are pure: one build and one view draw one image).
 */
export const lookFileName = (
  moment: Moment,
  view: StillView,
  build: string,
  wedge: string = '',
): string => {
  const parts = [
    `t${moment.time.toFixed(2).padStart(7, '0')}`,
    ...Arr.filter([view.mode], (mode) => mode !== 'plain'),
    ...Option.toArray(Option.map(Option.fromUndefinedOr(view.crop), (c) => `crop${c.join('_')}`)),
    ...Option.toArray(Option.map(Option.fromUndefinedOr(view.size), (s) => `s${s}`)),
    ...Arr.filter(['captions'], () => view.captions),
    ...Arr.filter([`w${wedge}`], () => wedge !== ''),
    `b${build}`,
  ];
  return `${parts.join('.')}.${EXTENSION[view.format]}`;
};

/** A look as the CLI prints it: one line, its file first. */
export const lookLine = (look: Look, build: string): string =>
  `${look.file} scene=${look.scene} at=${look.at} t=${look.time.toFixed(2)} frame=${look.frame} size=${look.width}x${look.height} build=${build}`;
