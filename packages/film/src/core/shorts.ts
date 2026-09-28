// Shorts: vertical cuts of a film, declared as data (`shorts.ts`). A short is
// spans of the film's scenes, each from a mark, a named cue or a landmark to a
// later one, played back to back; its picture and its sound are the film's own
// under those spans. Resolved once against the film's layout, on whole frames,
// so the picture the page draws and the track the renderer cuts agree to the
// frame. Pure: the page, the tools and the tests read it alike.

import { Array as Arr, Match, Option, Result } from 'effect';
import {
  type ShortError,
  ShortSpanEmpty,
  ShortUnknownCue,
  ShortUnknownMark,
  ShortUnknownScene,
} from './errors.ts';
import type { Placed } from './layout.ts';
import type { Short, ShortPoint, ShortSpan } from './schema.ts';

/** A short as it plays: 1080 × 1920, vertical. */
export const SHORT_WIDTH = 1080;
export const SHORT_HEIGHT = 1920;

/** One span of a short on the film's clock: film seconds `[from, to)`, starting at `at` in the short. */
export interface ShortCut {
  readonly scene: string;
  readonly from: number;
  readonly to: number;
  readonly at: number;
}

/** A short resolved against its film: its spans on whole frames, and its length. */
export interface ResolvedShort {
  readonly id: string;
  readonly title: string;
  readonly spans: readonly [ShortCut, ...ShortCut[]];
  /** Seconds, a whole number of frames. */
  readonly duration: number;
  /** The frame rate it was resolved on: each span's ends sit within half a frame of their points. */
  readonly fps: number;
}

/**
 * Where a short's parts sit, in 1080 × 1920 px, top to bottom: the hook line
 * (centred on `hook.y`, at most `width` wide, set from the first frame, held
 * `hold` s and faded over `fade` s), the film's 16:9 frame (607.5 px tall from
 * `band.top`), and the captions (centred on `caption.y`). Every line is
 * centred on `centre`. Data, so the page, the checks and the lab read one
 * layout.
 */
export const SHORT_LAYOUT = {
  centre: 540,
  hook: { y: 445, width: 800, hold: 2.4, fade: 0.4 },
  band: { top: 620 },
  caption: { y: 1318, width: 800 },
} as const;

/**
 * What a platform's buttons, names and progress bar cover on a vertical
 * short: a margin from each edge, in 1080 × 1920 px. Text past one is under
 * the platform's own furniture. Data, so `film check --short` and the lab
 * read one set of zones.
 */
export interface SafeZone {
  readonly top: number;
  readonly bottom: number;
  readonly left: number;
  readonly right: number;
}

/**
 * The zones `film check --short --zone` knows: `default` the organic feed's
 * (the like, comment and share buttons on the right, the name and caption
 * above the bottom), `ads` a paid placement's, whose call to action covers
 * the bottom 35%.
 */
export const SAFE_ZONES = {
  default: { top: 270, bottom: 520, left: 65, right: 140 },
  ads: { top: 270, bottom: Math.round(0.35 * SHORT_HEIGHT), left: 65, right: 140 },
} as const satisfies Record<string, SafeZone>;
export type SafeZoneName = keyof typeof SAFE_ZONES;
export const SAFE_ZONE_NAMES = ['default', 'ads'] as const satisfies ReadonlyArray<SafeZoneName>;

/** The rectangle inside `zone`'s margins, in 1080 × 1920 px: where text is safe. */
export const safeRect = (zone: SafeZone) => ({
  left: zone.left,
  top: zone.top,
  right: SHORT_WIDTH - zone.right,
  bottom: SHORT_HEIGHT - zone.bottom,
});

/**
 * The numbers `film check --short` holds a short to: the first word by
 * `firstWord` s and something moving by `motionBy` s (the hook), at most
 * `loopGap` s of silence from the last word round to the first and a last
 * frame within `loopDiff` of the first (mean luma, 0–1, of the film's band)
 * so it loops, and a length at most `length.max` s, best `length.from` to
 * `length.to` s.
 */
export const SHORT_RULES = {
  firstWord: 0.3,
  motionBy: 0.5,
  loopGap: 0.6,
  loopDiff: 0.08,
  length: { max: 90, from: 45, to: 75 },
} as const;

/** How opaque the hook is at short second `s`: set at once, held, then faded out. */
export const hookAlpha = (s: number): number => {
  const { hold, fade } = SHORT_LAYOUT.hook;
  return Math.min(1, Math.max(0, 1 - (s - hold) / fade));
};

/** The page a short is drawn on (`shortKey`), in the registry the player loads from. */
export const shortKey = (film: string, id: string): string => `${film}/shorts/${id}`;

/**
 * The short's page for a film `width` px wide: 9:16 at the film's own density,
 * so its 16:9 band is the film's frame pixel for pixel, and the `scale` that
 * encodes it to 1080 × 1920. H.264 wants even sides.
 */
export const shortPage = (width: number) => ({
  width,
  height: Math.round((width * SHORT_HEIGHT) / SHORT_WIDTH / 2) * 2,
  scale: SHORT_WIDTH / width,
});

/** Where the film's frame sits on a short's page, in page px. */
export interface ShortBand {
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

/** Page px per 1080 × 1920 px, for a film `width` px wide. */
export const pageScale = (width: number) => width / SHORT_WIDTH;

/**
 * The film's frame at the layout's top (`SHORT_LAYOUT.band`), on a whole
 * pixel row so the copy is exact: as tall as the film is drawn, whatever its
 * aspect. The page draws it here and the check compares the loop on it.
 */
export const bandOf = (film: { readonly width: number; readonly height: number }): ShortBand => ({
  top: Math.round(SHORT_LAYOUT.band.top * pageScale(film.width)),
  width: film.width,
  height: film.height,
});

/** A scene's landmark, scene-local. */
const landmarkAt = (p: Placed, landmark: 'start' | 'speech' | 'speechEnd' | 'end'): number => {
  switch (landmark) {
    case 'start':
      return 0;
    case 'speech':
      return p.speechStart;
    case 'speechEnd':
      return p.speechStart + p.voice.duration;
    case 'end':
      return p.dur;
  }
};

/**
 * Where a point lands in its scene, scene-local. A cue that names no edge
 * lands on `edge`: its start when it opens a span, its end when it closes one.
 */
const pointAt = (
  short: string,
  p: Placed,
  point: ShortPoint,
  edge: 'start' | 'end',
): Result.Result<number, ShortError> => {
  const scene = p.spec.id;
  return Match.value(point).pipe(
    Match.when({ mark: Match.string }, ({ mark }) =>
      Result.fromOption(
        Option.map(Option.fromNullishOr(p.voice.marks.get(mark)), (at) => p.speechStart + at),
        () => ShortUnknownMark.make({ short, scene, mark, known: [...p.voice.marks.keys()] }),
      ),
    ),
    Match.when({ cue: Match.string }, ({ cue, edge: named }) =>
      Result.fromOption(
        Option.map(
          Option.fromNullishOr(p.cues.get(cue)),
          (at) => at[Option.getOrElse(Option.fromNullishOr(named), () => edge)],
        ),
        () => ShortUnknownCue.make({ short, scene, cue, known: [...p.cues.keys()] }),
      ),
    ),
    Match.when({ scene: Match.string }, ({ scene: landmark }) =>
      Result.succeed(landmarkAt(p, landmark)),
    ),
    Match.exhaustive,
  );
};

/** A span on the film's frames: `[from, to)`. */
const spanFrames = (
  short: string,
  placed: ReadonlyArray<Placed>,
  span: ShortSpan,
  fps: number,
): Result.Result<
  { readonly scene: string; readonly from: number; readonly to: number },
  ShortError
> =>
  Result.gen(function* () {
    const p = yield* Result.fromOption(
      Arr.findFirst(placed, (q) => q.spec.id === span.scene),
      () =>
        ShortUnknownScene.make({ short, scene: span.scene, known: placed.map((q) => q.spec.id) }),
    );
    const from = Math.round((p.start + (yield* pointAt(short, p, span.from, 'start'))) * fps);
    const to = Math.round((p.start + (yield* pointAt(short, p, span.to, 'end'))) * fps);
    if (to <= from)
      return yield* Result.fail(
        ShortSpanEmpty.make({ short, scene: span.scene, from: from / fps, to: to / fps }),
      );
    return { scene: span.scene, from, to };
  });

/**
 * `short` on the film laid out as `placed`: each span on whole frames at
 * `fps`, back to back. A scene, mark or cue the film lacks, or a span that
 * holds no frame, fails naming it.
 */
export const resolveShort = (
  placed: ReadonlyArray<Placed>,
  short: Short,
  fps: number,
): Result.Result<ResolvedShort, ShortError> =>
  Result.map(
    Result.all(Arr.map(short.spans, (span) => spanFrames(short.id, placed, span, fps))),
    (frames) => {
      const [length, spans] = Arr.mapAccum(frames, 0, (at, f): [number, ShortCut] => [
        at + f.to - f.from,
        { scene: f.scene, from: f.from / fps, to: f.to / fps, at: at / fps },
      ]);
      return { id: short.id, title: short.title, spans, duration: length / fps, fps };
    },
  );

/** The index of the span playing at short time `s`. */
export const shortSpanAt = (short: ResolvedShort, s: number): number => {
  const spans = short.spans;
  let i = spans.length - 1;
  // The first span also holds every time before it.
  while (i > 0 && s < (spans[i]?.at ?? 0) - 1e-9) i--;
  return i;
};

/** The film time shown at short time `s`. */
export const shortFilmTime = (short: ResolvedShort, s: number): number => {
  const span = short.spans[shortSpanAt(short, s)] ?? short.spans[0];
  return span.from + (s - span.at);
};

/** A stretch of the film's track: `duration` seconds from film second `start`. */
export interface FilmPiece {
  readonly start: number;
  readonly duration: number;
}

/** The film's stretches under the short's seconds `[from, to)`, in the order the short plays them. */
export const shortPieces = (
  short: ResolvedShort,
  from: number,
  to: number,
): ReadonlyArray<FilmPiece> =>
  short.spans.flatMap((span) => {
    const a = Math.max(from, span.at);
    const b = Math.min(to, span.at + (span.to - span.from));
    if (b <= a + 1e-9) return [];
    return [{ start: span.from + (a - span.at), duration: b - a }];
  });
