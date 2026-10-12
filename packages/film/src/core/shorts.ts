// Shorts: vertical cuts of a film, declared as data (`shorts.ts`). A short is
// spans of the film's scenes, each from a mark, a named cue or a landmark to a
// later one, played back to back; its picture and its sound are the film's own
// under those spans. Resolved once against the film's layout, on whole frames,
// so the picture the page draws and the track the renderer cuts agree to the
// frame. Pure: the page, the tools and the tests read it alike.

import { Array as Arr, Option, Result, Schema } from 'effect';
import { type ShortError, ShortSpanEmpty, UnknownScene } from './errors.ts';
import { type Placed, pointIn } from './layout.ts';
import type { ScenePoint, Short, ShortSpan } from './schema.ts';
import { CLOCK_EPSILON } from './time.ts';

/** A short as it plays: 1080 × 1920, vertical. */
export const SHORT_WIDTH = 1080;
const SHORT_HEIGHT = 1920;

/** One span of a short on the film's clock: film seconds `[from, to)`, starting at `at` in the short. */
interface ShortCut {
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
 * the platform's own furniture, and so is text past a column of buttons on
 * the right (`ButtonColumn`), which takes more than the margin from its top
 * down. Data, so `film check --short` and the lab read one set of zones.
 */
export interface SafeZone {
  readonly top: number;
  readonly bottom: number;
  readonly left: number;
  readonly right: number;
  readonly columns: ReadonlyArray<ButtonColumn>;
}

/** A column of buttons on the right: `right` px wide, from `from` px down to the foot. */
interface ButtonColumn {
  readonly right: number;
  readonly from: number;
}

/** `share` of `size` px, rounded up to a whole pixel: a margin given as a share of the frame. */
const shareOf = (share: number, size: number) => Math.ceil(share * size);

/**
 * Each platform's own safe zone for a 9:16 video, in 1080 × 1920 px, as each
 * publishes it (read 2026-10-11). Only YouTube and Meta publish numbers in
 * their help text, and both for their ads; TikTok publishes its zone as a
 * downloadable file. A talk is published to all three (one render), so its
 * text keeps inside every one of them (`SAFE_ZONES.platforms`).
 */
export const PLATFORM_ZONES = {
  youtube: {
    title: 'YouTube Shorts',
    // Google Ads Help, "Use square and vertical video to engage mobile customers"
    // (support.google.com/google-ads/answer/9128498): its 1080 × 1920 safe-zone image marks
    // 288 px at the top, 672 at the bottom, 48 on the left and 192 on the right (the
    // figures as upload-post.com/tools/safe-zone-checker transcribes them).
    zone: { top: 288, bottom: 672, left: 48, right: 192, columns: [] },
  },
  reels: {
    title: 'Instagram Reels',
    // Meta Ads Guide, Instagram Reels video (facebook.com/business/ads-guide/update/video/instagram-reels):
    // keep text, logos and other key elements out of the top 14%, the bottom 35% and 6% of each side.
    zone: {
      top: shareOf(0.14, SHORT_HEIGHT),
      bottom: shareOf(0.35, SHORT_HEIGHT),
      left: shareOf(0.06, SHORT_WIDTH),
      right: shareOf(0.06, SHORT_WIDTH),
      columns: [],
    },
  },
  tiktok: {
    title: 'TikTok',
    // TikTok Ads Manager Help, "TikTok Auction In-Feed Ads"
    // (ads.tiktok.com/help/article/tiktok-auction-in-feed-ads), whose safe-zone file
    // "In-Feed Standard Version LTR" at 1080 × 1920 keeps 240 px at the top, 660 at the bottom
    // and 120 on each side, and 300 px on the right from 840 px down, where its like, comment
    // and share buttons stand (as upload-post.com/tools/safe-zone-checker measures it).
    zone: { top: 240, bottom: 660, left: 120, right: 120, columns: [{ right: 300, from: 840 }] },
  },
} as const satisfies Record<string, { readonly title: string; readonly zone: SafeZone }>;

/** The zone inside every one of `zones`: each edge the widest of theirs, and every one's button columns. */
const unionOf = (zones: ReadonlyArray<SafeZone>): SafeZone => ({
  top: Math.max(...zones.map((z) => z.top)),
  bottom: Math.max(...zones.map((z) => z.bottom)),
  left: Math.max(...zones.map((z) => z.left)),
  right: Math.max(...zones.map((z) => z.right)),
  columns: zones.flatMap((z) => z.columns),
});

/**
 * The zones `film check --short --zone` knows: `default` the organic feed's
 * (the like, comment and share buttons on the right, the name and caption
 * above the bottom), `ads` a paid placement's, whose call to action covers
 * the bottom 35%, and `platforms` the zone inside every platform's own
 * (`PLATFORM_ZONES`): where a talk sets its words.
 */
export const SAFE_ZONES = {
  default: { top: 270, bottom: 520, left: 65, right: 140, columns: [] },
  ads: { top: 270, bottom: Math.round(0.35 * SHORT_HEIGHT), left: 65, right: 140, columns: [] },
  platforms: unionOf(Object.values(PLATFORM_ZONES).map((p) => p.zone)),
} as const satisfies Record<string, SafeZone>;
export type SafeZoneName = keyof typeof SAFE_ZONES;
export const SAFE_ZONE_NAMES = [
  'default',
  'ads',
  'platforms',
] as const satisfies ReadonlyArray<SafeZoneName>;

/**
 * The rectangle inside `zone`'s margins, in 1080 × 1920 px: where text is
 * safe above its button columns (`roomAcross` the rows a line takes).
 */
export const safeRect = (zone: SafeZone) => ({
  left: zone.left,
  top: zone.top,
  right: SHORT_WIDTH - zone.right,
  bottom: SHORT_HEIGHT - zone.bottom,
});

/**
 * How far across a line whose foot is at row `bottom` may reach in `zone`,
 * in 1080 × 1920 px: inside its margins, and short of every button column
 * the line runs down into (a column runs to the frame's foot).
 */
export const roomAcross = (zone: SafeZone, bottom: number) => {
  const under = zone.columns.filter((c) => bottom > c.from);
  return {
    left: zone.left,
    right: SHORT_WIDTH - Math.max(zone.right, ...under.map((c) => c.right)),
  };
};

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
  /** The grid the band's luma is sampled down to for `loopDiff`: coarse, so grain and boil wash out. */
  loopGrid: { cols: 64, rows: 36 },
  length: { max: 90, from: 45, to: 75 },
} as const;

/** How opaque the hook is at short second `s`: set at once, held, then faded out. */
export const hookAlpha = (s: number): number => {
  const { hold, fade } = SHORT_LAYOUT.hook;
  return Math.min(1, Math.max(0, 1 - (s - hold) / fade));
};

/** The page a short is drawn on (`shortKey`), in the registry the player loads from. */
export const shortKey = (film: string, id: string): string => `${film}/shorts/${id}`;

/** Whether a page's name is a short's (`shortKey`): the lab opens films, not shorts. */
export const isShortKey = (page: string): boolean => /^[^/]+\/shorts\/[^/]+$/.test(page);

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
interface ShortBand {
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

/**
 * The pause a span that opens on a word keeps before the word is heard: the
 * breath into it. The aligner starts a word with the pause before it, so a
 * span opened on its aligned start would open on up to a second of silence.
 */
export const SHORT_PREROLL = 0.1;

/**
 * Where a span that opens at voice second `at` (a word's aligned start)
 * starts: `SHORT_PREROLL` before the word there is heard, never before `at`.
 * An estimated voice is heard from its aligned start, so it opens there.
 */
const openOnVoice = (p: Placed, at: number): number =>
  Option.match(
    Arr.findFirst(p.voice.words, (w) => w.end > at),
    {
      onNone: () => at,
      onSome: (w) => Math.max(at, w.voiced.start - SHORT_PREROLL),
    },
  );

/**
 * Where a point opens onto the voice, in voice seconds: a mark, or where the
 * voice starts. None for any other point, which opens where it lands.
 */
const onVoice = (p: Placed, point: ScenePoint): Option.Option<number> => {
  const mark = Option.filter(Option.fromUndefinedOr(point.mark), () =>
    Option.isNone(Option.fromUndefinedOr(point.word)),
  );
  if (Option.isSome(mark)) return Option.fromUndefinedOr(p.voice.marks.get(mark.value));
  return Option.as(
    Option.filter(Option.fromUndefinedOr(point.at), (at) => at === 'speech'),
    0,
  );
};

/**
 * Where a point lands in its scene, scene-local (`pointIn`). A cue that names
 * no edge lands on `edge`: its start when it opens a span, its end when it
 * closes one. A mark or the speech opening a span lands on the voice
 * (`openOnVoice`).
 */
const pointAt = (
  short: string,
  p: Placed,
  point: ScenePoint,
  edge: 'start' | 'end',
): Result.Result<number, ShortError> =>
  Result.map(pointIn(p, point, `short "${short}"`, edge), (at) =>
    Option.match(
      Option.filter(onVoice(p, point), () => edge === 'start'),
      {
        onNone: () => at,
        onSome: (voice) => p.speechStart + openOnVoice(p, voice),
      },
    ),
  );

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
        UnknownScene.make({
          scene: span.scene,
          known: placed.map((q) => q.spec.id),
          by: `short "${short}"`,
        }),
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
  while (i > 0 && s < (spans[i]?.at ?? 0) - CLOCK_EPSILON) i--;
  return i;
};

/** A stretch of the film's track: `duration` seconds from film second `start`. */
export const FilmPiece = Schema.Struct({ start: Schema.Finite, duration: Schema.Finite });
export type FilmPiece = typeof FilmPiece.Type;

/** The film's stretches under the short's seconds `[from, to)`, in the order the short plays them. */
export const shortPieces = (
  short: ResolvedShort,
  from: number,
  to: number,
): ReadonlyArray<FilmPiece> =>
  short.spans.flatMap((span) => {
    const a = Math.max(from, span.at);
    const b = Math.min(to, span.at + (span.to - span.from));
    if (b <= a + CLOCK_EPSILON) return [];
    return [{ start: span.from + (a - span.at), duration: b - a }];
  });
