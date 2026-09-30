// What `film check` looks for, as pure functions over a laid-out film: the
// static findings (cues past their scene, sound cues naming nothing, acts out
// of order, stale takes and sounds, an audio master missing or not as long as
// the film, a line handed to a voice the cast lacks) and the layout findings in what a probed frame reports: text over
// text, text off the frame, brush strokes across text, and a plate carrying
// text cut off by the frame; and static holds, where the voice speaks over a
// picture that does not move. Every finding is collected; none stops the others.

import { Array as Arr, Match, Option, Order, Predicate, Result } from 'effect';
import { BOIL_FPS, STROKE_JITTER } from '../canvas/ink.ts';
import type { Pcm } from '../core/audio.ts';
import { BALANCE, hotEffects, voiceLevel } from '../core/balance.ts';
import type { MixPlan, Mixed } from '../core/mix.ts';
import { loudness } from '../core/synth/loudness.ts';
import type { Placed } from '../core/layout.ts';
import { DEFAULT_TAIL, MIN_LEAD, everyTakeRecorded, transitionDur } from '../core/layout.ts';
import { type SceneMoment, sceneMoments } from '../core/moments.ts';
import { insidePolygon } from '../core/polygon.ts';
import {
  endsSentence,
  lastVoiced,
  linesOf,
  parse,
  takeScript,
  takeState,
  voiceKey,
  wordAfter,
} from '../core/narration.ts';
import type {
  InkMark,
  Music,
  Point,
  Probed,
  Sound,
  SoundManifest,
  TextBox,
  Timed,
} from '../core/schema.ts';
import {
  type LibraryEntry,
  type SoundUse,
  type Sounds,
  resolveUse,
  soundState,
} from '../core/sfx.ts';
import { actSpans, cueTime, filmEnd, musicKey, musicPlan } from '../core/sound.ts';
import {
  type ActTooShort,
  type HandFar,
  type HandHidden,
  type HandJump,
  AssetMissing,
  AssetStale,
  type AudioMissing,
  type AudioStale,
  CueLate,
  DeadAir,
  EffectHot,
  EndShort,
  MasterLoudness,
  VoiceLevel,
  type ColourScript,
  type CueInvalid,
  type FaceSmall,
  type HeldShare,
  InkOverText,
  PlateOffFrame,
  SeamLong,
  SoundStale,
  SoundUnmade,
  type SoundUseMismatch,
  type StaticHold,
  TakeStale,
  TextOffFrame,
  TextOffPlate,
  TextOverlap,
  type UnknownCue,
  type UnknownMark,
  type UnknownScene,
  type UnknownSound,
  type UnknownVoice,
  WordPinFar,
} from './errors.ts';
import type { LoadedFilm } from './film-repo.ts';
import { masterFile, masterFinding } from './mixer.ts';

export type StaticFinding =
  | CueLate
  | SeamLong
  | TakeStale
  | AssetStale
  | AssetMissing
  | AudioMissing
  | AudioStale
  | UnknownScene
  | UnknownCue
  | UnknownMark
  | CueInvalid
  | ActTooShort
  | UnknownVoice
  | UnknownSound
  | SoundUseMismatch
  | SoundUnmade
  | SoundStale
  | EffectHot
  | WordPinFar
  | EndShort
  | DeadAir
  | VoiceLevel
  | MasterLoudness;
/** What one probed frame shows wrong. */
export type FrameFinding = TextOverlap | TextOffFrame | InkOverText | PlateOffFrame | TextOffPlate;
export type LayoutFinding = FrameFinding | StaticHold;
/** What the look pass measures across the film (`look.ts`): every one a warning. */
export type LookFinding = HeldShare | ColourScript | FaceSmall | HandJump | HandFar | HandHidden;
export type Finding = StaticFinding | LayoutFinding | LookFinding;

export type Level = 'error' | 'warning';

export interface Reported {
  readonly level: Level;
  readonly finding: Finding;
}

export interface CheckOptions {
  /** Report stale takes and stale sounds as warnings: work in progress, not a broken film. */
  readonly allowStale: boolean;
}

// ---------------------------------------------------------------------------
// Static

/**
 * How many sentence ends a word pin may cross past its mark: its own
 * sentence's end, into the next sentence. Past that, the word it meant near
 * the mark is likely gone from the take.
 */
export const PIN_REACH = 1;

/**
 * Word pins that land more than `PIN_REACH` sentences past their mark. A pin
 * lands on the first saying at or after its mark, so a re-take that drops the
 * word near the mark moves the cue to a later saying without failing; this
 * says so. A pin the line never says is `WordMissing` at layout, not here.
 */
export const farPins = (placed: ReadonlyArray<Placed>): ReadonlyArray<WordPinFar> =>
  placed.flatMap((p) =>
    Object.entries(Option.getOrElse(Option.fromNullishOr(p.spec.timeline), () => ({}))).flatMap(
      ([cue, span]) => {
        if (!('word' in span)) return [];
        const mark = span.mark;
        const pin = Option.all({
          word: Option.fromNullishOr(span.word),
          m: Option.fromNullishOr(p.voice.marks.get(mark)),
        });
        const landed = Option.flatMap(pin, ({ word, m }) =>
          Option.map(wordAfter(p.voice.words, m, word), (t) => ({ word, m, t })),
        );
        return Option.toArray(landed).flatMap(({ word, m, t }) => {
          const sentences = p.voice.words.filter(
            (w) => w.start >= m - 1e-3 && w.start < t && endsSentence(w.text),
          ).length;
          if (sentences <= PIN_REACH) return [];
          return [WordPinFar.make({ scene: p.spec.id, cue, mark, word, sentences })];
        });
      },
    ),
  );

/** Named cues that end after their scene. */
export const lateCues = (placed: ReadonlyArray<Placed>): ReadonlyArray<CueLate> =>
  placed.flatMap((p) =>
    [...p.cues]
      .filter(([, c]) => c.end > p.dur + 1e-9)
      .map(([cue, c]) => CueLate.make({ scene: p.spec.id, cue, end: c.end, dur: p.dur })),
  );

/**
 * The longest pause between two voices a film makes without saying so: the
 * layout's shortest lead plus its default tail (0.6 s), the film skill's CRAFT
 * rule 9.
 */
export const MAX_SEAM = MIN_LEAD + DEFAULT_TAIL;

/**
 * The pause from `p`'s last word to `q`'s voice, when both speak and `q`
 * follows `p`: from where `p`'s last word is heard (`lastVoiced`), so the
 * silence a take trails counts as the pause it is.
 */
export const seamAfter = (p: Placed, q: Placed): Option.Option<number> => {
  if (p.voice.duration <= 0 || q.voice.duration <= 0) return Option.none();
  return Option.some(p.dur - (p.speechStart + lastVoiced(p.voice)) + q.speechStart);
};

/**
 * Whether a scene declares the time after its words: a `tail`, or a `min`
 * that stretches the scene past its words and default tail. A `min` its words
 * outrun declares nothing.
 */
const declaresEnd = (p: Placed) =>
  Predicate.isNotUndefined(p.spec.tail) ||
  Option.exists(
    Option.fromUndefinedOr(p.spec.min),
    (min) => min > p.speechStart + p.voice.duration + DEFAULT_TAIL + 1e-9,
  );

/**
 * Seams over `MAX_SEAM` between two speaking scenes, where neither scene
 * declares the pause: a long entrance stretching the default lead, not a pause
 * the script means.
 */
export const longSeams = (placed: ReadonlyArray<Placed>): ReadonlyArray<SeamLong> =>
  placed.slice(1).flatMap((q, i) => {
    const p = Arr.getUnsafe(placed, i);
    if (declaresEnd(p) || Predicate.isNotUndefined(q.spec.lead)) return [];
    return Option.match(seamAfter(p, q), {
      onNone: () => [],
      onSome: (seam) => {
        if (seam <= MAX_SEAM + 1e-9) return [];
        return [SeamLong.make({ from: p.spec.id, to: q.spec.id, seam, max: MAX_SEAM })];
      },
    });
  });

const said = (scene: Timed) => parse(Option.getOrElse(Option.fromNullishOr(scene.say), () => ''));

/**
 * Beats with words whose take is missing or was recorded for other text,
 * other turns or another voice (a person's take is read by no staging voice).
 */
export const staleTakes = (film: LoadedFilm): ReadonlyArray<TakeStale> => {
  const voice = voiceKey(film.voice);
  return film.scenes.flatMap((scene) => {
    const parsed = said(scene);
    if (parsed.spoken.length === 0) return [];
    const state = takeState(scene.id, takeScript(parsed), film.timings, voice);
    if (state._tag !== 'Stale') return [];
    return [TakeStale.make({ scene: scene.id, reason: state.reason, recorded: state.recorded })];
  });
};

/** Lines handed to a voice the film's cast does not have: `narrate` would refuse them. */
export const unknownVoices = (film: LoadedFilm): ReadonlyArray<UnknownVoice> =>
  film.scenes.flatMap((scene) =>
    Result.match(linesOf(scene.id, said(scene), film.voice), {
      onFailure: (error) => [error],
      onSuccess: () => [],
    }),
  );

/** A generated asset against the hash its request has now. */
const assetFinding = (
  asset: string,
  stored: Option.Option<string>,
  wanted: string,
): ReadonlyArray<AssetStale | AssetMissing> =>
  Option.match(stored, {
    onNone: () => [AssetMissing.make({ asset })],
    onSome: (hash) => {
      if (hash === wanted) return [];
      return [AssetStale.make({ asset, stored: hash, wanted })];
    },
  });

/**
 * The score's acts: each names a scene, and each runs in film order for at
 * least the API's shortest chunk (`actSpans`, every failure rather than the
 * first). Only a plan that holds is checked for a stale score.
 */
export const musicFindings = (
  music: Music,
  placed: ReadonlyArray<Placed>,
  manifest: SoundManifest,
): ReadonlyArray<UnknownScene | ActTooShort | AssetStale | AssetMissing> =>
  Result.match(actSpans(music, placed), {
    onFailure: (unknown) => unknown,
    onSuccess: (spans) => {
      const short = Arr.getFailures(spans);
      if (short.length > 0) return short;
      return Result.match(musicPlan(music, placed), {
        onFailure: (error) => [error],
        onSuccess: (plan) =>
          assetFinding(
            'music',
            Option.map(Option.fromNullishOr(manifest.music), (a) => a.hash),
            musicKey(music, plan),
          ),
      });
    },
  });

/**
 * The mix measured against the film's sound rules: the voice's level and the
 * master's loudness off their targets, and each effect that crowds the voice
 * around it (`hotEffects`: its loudest 50 ms, as the mix plays it).
 */
export const balanceFindings = (
  placed: ReadonlyArray<Placed>,
  plan: MixPlan<Pcm>,
  mixed: Mixed,
): ReadonlyArray<VoiceLevel | MasterLoudness | EffectHot> => {
  const { tolerance } = BALANCE;
  const found: Array<VoiceLevel | MasterLoudness | EffectHot> = [];
  const voice = voiceLevel(mixed.voice);
  if (Number.isFinite(voice) && Math.abs(voice - BALANCE.voice) > tolerance)
    found.push(VoiceLevel.make({ level: voice, target: BALANCE.voice, tolerance }));
  const master = loudness(mixed.master).integrated;
  if (Number.isFinite(master) && Math.abs(master - BALANCE.master) > tolerance)
    found.push(MasterLoudness.make({ loudness: master, target: BALANCE.master, tolerance }));
  for (const hot of hotEffects(mixed.voice, plan.effects))
    found.push(
      EffectHot.make({
        effect: hot.name,
        scene: sceneAt(placed, hot.at),
        at: hot.at,
        over: hot.over,
      }),
    );
  return found;
};

/** The scene playing at film second `at`. */
const sceneAt = (placed: ReadonlyArray<Placed>, at: number): string =>
  Option.match(
    Arr.findLast(placed, (p) => p.start <= at + 1e-9),
    { onNone: () => '', onSome: (p) => p.spec.id },
  );

/** A named library sound for `use`: refused (unknown, or for the other use), unmade, stale, or fine. */
const libraryFindings = (
  sounds: Sounds,
  name: string,
  use: SoundUse,
): Result.Result<
  { readonly entry: LibraryEntry; readonly findings: ReadonlyArray<StaticFinding> },
  UnknownSound | SoundUseMismatch
> =>
  Result.map(resolveUse(sounds.library, name, use), (entry) => {
    const state = soundState(entry, Option.fromUndefinedOr(sounds.lock[name]));
    const findings: Array<StaticFinding> = [];
    if (state._tag === 'Missing')
      findings.push(SoundUnmade.make({ name, candidates: state.candidates }));
    if (state._tag === 'Stale') findings.push(SoundStale.make({ name }));
    return { entry, findings };
  });

/**
 * Every bed and effect: each cue names a real scene, cue or mark; each sound
 * is in the library, declared for how it is placed, made and current. A
 * sound named twice is reported once. (How loud each plays against the voice
 * is measured on the mix: `balanceFindings`.)
 */
export const soundFindings = (
  sound: Sound,
  placed: ReadonlyArray<Placed>,
  sounds: Sounds,
): ReadonlyArray<StaticFinding> => {
  const named = new Set<string>();
  const once = (name: string, found: ReadonlyArray<StaticFinding>) => {
    if (named.has(name)) return [];
    named.add(name);
    return found;
  };
  const cueFindings = (cue: Sound['effects'][string]['at'][number]) =>
    Result.match(cueTime(cue, placed), { onFailure: (e) => [e], onSuccess: () => [] });
  const beds = (sound.beds ?? []).flatMap((bed) => [
    ...cueFindings(bed.from),
    ...cueFindings(bed.to),
    ...Result.match(libraryFindings(sounds, bed.sound, 'bed'), {
      onFailure: (e) => once(bed.sound, [e]),
      onSuccess: ({ findings }) => once(bed.sound, findings),
    }),
  ]);
  const effects = Object.values(sound.effects).flatMap((effect) => [
    ...effect.at.flatMap(cueFindings),
    ...Result.match(libraryFindings(sounds, effect.sound, 'one-shot'), {
      onFailure: (e) => once(effect.sound, [e]),
      onSuccess: ({ findings }) => once(effect.sound, findings),
    }),
  ]);
  return [...beds, ...effects];
};

const levelOf = (finding: StaticFinding, options: CheckOptions): Level => {
  switch (finding._tag) {
    case 'TakeStale':
    case 'AssetStale':
    case 'AudioStale':
    case 'AudioMissing':
      if (options.allowStale) return 'warning';
      return 'error';
    case 'AssetMissing':
    case 'SoundStale':
    case 'EffectHot':
    case 'VoiceLevel':
    case 'MasterLoudness':
    case 'SeamLong':
    case 'WordPinFar':
    case 'EndShort':
      return 'warning';
    default:
      return 'error';
  }
};

/**
 * How far the audio master may differ from the film's length. The check does
 * not know the film's frame rate, so it holds the master to a frame at 60 fps,
 * no looser than the render's one frame at any rate up to that; a mix is
 * trimmed to the film's length, so a current master is exact.
 */
export const MASTER_TOLERANCE = 1 / 60;

/** Once every take is recorded the film has a mixed track, and its master must cover the film. */
export const masterFindings = (
  film: LoadedFilm,
  placed: ReadonlyArray<Placed>,
  length: Option.Option<number>,
): ReadonlyArray<AudioMissing | AudioStale> => {
  if (!everyTakeRecorded(placed)) return [];
  return Option.toArray(
    masterFinding(masterFile(film.paths), length, filmEnd(placed), MASTER_TOLERANCE),
  );
};

// ---------------------------------------------------------------------------
// The ending and the air

/** After the last word, credits and music alone need at least this long (research #6, #44). */
export const TAIL_MIN = 20;
/** YouTube's end screens need at least this long at the end. */
export const CARD_MIN = 5;

/**
 * The ending, against what YouTube needs: the stretch after the last word
 * under `TAIL_MIN`, or the end card (the last scene, when it speaks nothing)
 * under `CARD_MIN`; a last scene that speaks is no end card at all.
 */
export const endShort = (placed: ReadonlyArray<Placed>): ReadonlyArray<EndShort> => {
  const last = Arr.last(placed);
  if (Option.isNone(last)) return [];
  const spoken = placed.filter((p) => p.voice.duration > 0);
  const lastWord = Math.max(0, ...spoken.map((p) => p.start + p.speechStart + p.voice.duration));
  const tail = filmEnd(placed) - lastWord;
  const card = Option.match(
    Option.liftPredicate(last.value, (p) => p.voice.duration <= 0),
    { onNone: () => 0, onSome: (p) => p.dur },
  );
  return [
    ...Arr.filter(
      [EndShort.make({ part: 'after the last word', secs: tail, min: TAIL_MIN })],
      () => spoken.length > 0 && tail < TAIL_MIN,
    ),
    ...Arr.filter(
      [EndShort.make({ part: 'end card', secs: card, min: CARD_MIN })],
      () => card < CARD_MIN,
    ),
  ];
};

/** The master counts as silent below this level, in dBFS. */
export const DEAD_FLOOR = -60;
/** A silence longer than this, in seconds, that no cue declares is dead air. */
export const DEAD_MAX = 1.5;
/** The master's level is read in windows this long, in seconds. */
export const DEAD_WINDOW = 0.05;

/** The film seconds every cue declared `silence: true` spans. */
export const designedSilences = (placed: ReadonlyArray<Placed>): ReadonlyArray<Span> =>
  placed.flatMap((p) =>
    Object.entries(p.spec.timeline ?? {})
      .filter(([, span]) => span.silence === true)
      .flatMap(([name]) =>
        Option.toArray(Option.fromNullishOr(p.cues.get(name))).map((c): Span => [
          p.start + c.start,
          p.start + c.end,
        ]),
      ),
  );

/** `run` less every span of `cut`, in order. */
const without = (run: Span, cut: ReadonlyArray<Span>): ReadonlyArray<Span> =>
  cut.reduce<ReadonlyArray<Span>>(
    (pieces, [a, b]) =>
      pieces.flatMap(([from, to]): ReadonlyArray<Span> => {
        if (b <= from || a >= to) return [[from, to]];
        const kept: ReadonlyArray<Span> = [
          [from, a],
          [b, to],
        ];
        return kept.filter(([x, y]) => y > x);
      }),
    [run],
  );

/**
 * Dead air in the master: each run of `levels` (dBFS per `window` seconds)
 * under `DEAD_FLOOR` that, less the designed silences, still lasts over
 * `DEAD_MAX`.
 */
export const deadAir = (
  levels: ArrayLike<number>,
  window: number,
  designed: ReadonlyArray<Span>,
): ReadonlyArray<DeadAir> => {
  const runs: Span[] = [];
  let from = -1;
  for (let i = 0; i <= levels.length; i++) {
    const quiet = i < levels.length && (levels[i] ?? 0) < DEAD_FLOOR;
    if (quiet && from < 0) from = i;
    if (!quiet && from >= 0) {
      runs.push([from * window, i * window]);
      from = -1;
    }
  }
  return runs
    .flatMap((run) => without(run, designed))
    .filter(([a, b]) => b - a > DEAD_MAX)
    .map(([a, b]) => DeadAir.make({ from: a, to: b, floor: DEAD_FLOOR, max: DEAD_MAX }));
};

/**
 * Everything the check finds without drawing a frame. `master` is the audio
 * master's measured length, or none when there is no master.
 */
export const staticFindings = (
  film: LoadedFilm,
  placed: ReadonlyArray<Placed>,
  options: CheckOptions,
  master: Option.Option<number>,
): ReadonlyArray<Reported> => {
  const sound = Option.toArray(film.sound).flatMap((s) => [
    ...Option.toArray(Option.fromNullishOr(s.music)).flatMap((m) =>
      musicFindings(m, placed, film.manifest),
    ),
    ...soundFindings(s, placed, film.sounds),
  ]);
  const audio = masterFindings(film, placed, master);
  const takes = [...unknownVoices(film), ...staleTakes(film)];
  return [
    ...lateCues(placed),
    ...longSeams(placed),
    ...farPins(placed),
    ...takes,
    ...sound,
    ...audio,
    ...endShort(placed),
  ].map((finding) => ({
    level: levelOf(finding, options),
    finding,
  }));
};

// ---------------------------------------------------------------------------
// Layout

/** A frame the layout leg probes, and why: a mark, a cue edge, the scene's 60% point. */
export type Sample = SceneMoment;

/** The frames to probe in each scene: every mark, every cue's start and end, and the 60% point. */
export const layoutSamples = (placed: ReadonlyArray<Placed>, fps: number): ReadonlyArray<Sample> =>
  sceneMoments(placed, fps, { marks: true });

/**
 * Text fainter than this reads as gone. Both lines of a pair must be above it
 * to collide, so a word fading out where another fades in is a crossfade, not
 * a collision.
 */
export const VISIBLE_ALPHA = 0.3;
/** Two lines collide only where they overlap by more than this many pixels, across and down. */
export const OVERLAP_TOLERANCE = 4;

const visible = (box: TextBox) => box.alpha > VISIBLE_ALPHA;

type Quad = TextBox['corners'];

const sub = (a: Point, b: Point): Point => [a[0] - b[0], a[1] - b[1]];
const cross = (a: Point, b: Point) => a[0] * b[1] - a[1] * b[0];

/** Shoelace area of a polygon: positive for one winding, negative for the other. */
const signedArea = (poly: ReadonlyArray<Point>): number =>
  poly.reduce((sum, p, i) => sum + cross(p, Arr.getUnsafe(poly, (i + 1) % poly.length)), 0) / 2;

/** Sutherland–Hodgman: the part of `subject` inside the convex polygon `clip`. */
const clipPolygon = (
  subject: ReadonlyArray<Point>,
  clip: ReadonlyArray<Point>,
): ReadonlyArray<Point> => {
  const winding = Math.sign(signedArea(clip));
  return clip.reduce<ReadonlyArray<Point>>((poly, a, i) => {
    if (poly.length === 0) return poly;
    const b = Arr.getUnsafe(clip, (i + 1) % clip.length);
    const inside = (p: Point) => winding * cross(sub(b, a), sub(p, a)) >= 0;
    const meet = (p: Point, q: Point): Point => {
      const d = sub(q, p);
      const k = cross(sub(b, a), sub(a, p)) / cross(sub(b, a), d);
      return [p[0] + d[0] * k, p[1] + d[1] * k];
    };
    return poly.flatMap((p, j) => {
      const prev = Arr.getUnsafe(poly, (j + poly.length - 1) % poly.length);
      if (inside(p)) {
        if (inside(prev)) return [p];
        return [meet(prev, p), p];
      }
      if (inside(prev)) return [meet(prev, p)];
      return [];
    });
  }, subject);
};

/** The area two convex quads share. */
const sharedArea = (a: Quad, b: Quad): number => {
  if (signedArea(a) === 0 || signedArea(b) === 0) return 0;
  return Math.abs(signedArea(clipPolygon(a, b)));
};

/** A quad pulled in by `by` pixels on every side along its own axes; none if too thin. */
const inset = (q: Quad, by: number): Option.Option<Quad> => {
  const [tl, tr, br, bl] = q;
  const across = Math.hypot(...sub(tr, tl));
  const down = Math.hypot(...sub(bl, tl));
  if (across <= 2 * by || down <= 2 * by) return Option.none();
  const u = sub(tr, tl).map((c) => (c / across) * by);
  const v = sub(bl, tl).map((c) => (c / down) * by);
  const move = (p: Point, su: number, sv: number): Point => [
    p[0] + su * Arr.getUnsafe(u, 0) + sv * Arr.getUnsafe(v, 0),
    p[1] + su * Arr.getUnsafe(u, 1) + sv * Arr.getUnsafe(v, 1),
  ];
  return Option.some([move(tl, 1, 1), move(tr, -1, 1), move(br, -1, -1), move(bl, 1, -1)]);
};

/**
 * The area two lines of text share, in their own rotated boxes, or 0 when
 * they overlap by no more than the tolerance: each box is pulled in by half
 * of it before they are compared.
 */
export const overlapArea = (a: TextBox, b: TextBox): number => {
  const deep = Option.zipWith(
    inset(a.corners, OVERLAP_TOLERANCE / 2),
    inset(b.corners, OVERLAP_TOLERANCE / 2),
    sharedArea,
  );
  if (Option.getOrElse(deep, () => 0) <= 0) return 0;
  return sharedArea(a.corners, b.corners);
};

/** Whether a box lies wholly outside a `width` × `height` frame: it shows nothing. */
export const offFrame = (
  box: { readonly x: number; readonly y: number; readonly w: number; readonly h: number },
  width: number,
  height: number,
) => box.x >= width || box.y >= height || box.x + box.w <= 0 || box.y + box.h <= 0;

/**
 * How far a box reaches past each edge of a `width` × `height` frame (0 where
 * it does not). A box wholly outside the frame shows nothing, so it reaches
 * past nothing: text that has slid or fallen away is gone, not cut off.
 */
export const pastFrame = (
  box: { readonly x: number; readonly y: number; readonly w: number; readonly h: number },
  width: number,
  height: number,
) => {
  if (offFrame(box, width, height)) return { left: 0, top: 0, right: 0, bottom: 0 };
  return {
    left: Math.max(0, -box.x),
    top: Math.max(0, -box.y),
    right: Math.max(0, box.x + box.w - width),
    bottom: Math.max(0, box.y + box.h - height),
  };
};

/**
 * A plate or fill drawn over a stroke lets `1 - alpha` of it through, and
 * layers multiply: the stroke is hidden where what shows of it is no more
 * than `VISIBLE_ALPHA`, the opacity below which ink does not read over text
 * (so a full-strength stroke is hidden by one layer at 0.7 or more).
 */
export const showing = (stroke: InkMark, layers: ReadonlyArray<InkMark>): number =>
  layers.reduce((left, layer) => left * (1 - layer.alpha), stroke.alpha);
/**
 * A stroke drawn before a line of text lies under it, and one that is both
 * light and thin is page texture the words read over (greeked copy on a
 * newspaper, the lines of a decree under its stamp). Light: at most this
 * opacity, so full-strength letters keep at least twice the ink's contrast
 * over it. Only a stroke drawn over the text, or a heavier or wider one under
 * it, strikes it.
 */
export const UNDER_ALPHA = 0.5;
/**
 * Thin, for texture: at most this share of the letters' height (the text box
 * measured down its own side, so a turned line counts its real height). A
 * rule that thin sits across a third of each glyph at most and every letter
 * keeps its shape; a wider one is a bar through the words.
 */
export const TEXTURE_WIDTH = 1 / 3;
/** Along a crossing, the check looks for a plate over the stroke every this many pixels. */
const CROSS_STEP = 2;

/**
 * The part of the segment `p` → `q` inside the convex polygon `poly`, as the
 * fractions of the way along it where it enters and leaves (Cyrus–Beck); none
 * when it misses.
 */
export const clipSegment = (
  p: Point,
  q: Point,
  poly: ReadonlyArray<Point>,
): Option.Option<readonly [number, number]> => {
  const winding = Math.sign(signedArea(poly));
  if (winding === 0) return Option.none();
  const d = sub(q, p);
  let enter = 0;
  let leave = 1;
  for (const [i, a] of poly.entries()) {
    const edge = sub(Arr.getUnsafe(poly, (i + 1) % poly.length), a);
    // Inside where winding · cross(edge, x − a) ≥ 0, with x = p + t·d.
    const at = winding * cross(edge, sub(p, a));
    const rate = winding * cross(edge, d);
    if (rate === 0) {
      if (at < 0) return Option.none();
      continue;
    }
    const t = -at / rate;
    if (rate > 0) enter = Math.max(enter, t);
    else leave = Math.min(leave, t);
    if (enter > leave) return Option.none();
  }
  return Option.some([enter, leave]);
};

/** The point of the segment `a` → `b` nearest `p`. */
const nearestOnSegment = (a: Point, b: Point, p: Point): Point => {
  const d = sub(b, a);
  const span = d[0] * d[0] + d[1] * d[1];
  if (span === 0) return a;
  const t = Math.min(1, Math.max(0, ((p[0] - a[0]) * d[0] + (p[1] - a[1]) * d[1]) / span));
  return [a[0] + d[0] * t, a[1] + d[1] * t];
};

/** The point of the quad `q` (its inside or its outline) nearest `p`: `p` itself when inside. */
export const nearestIn = (q: Quad, p: Point): Point => {
  if (insidePolygon(q, p)) return p;
  const candidates = q.map((a, i) => nearestOnSegment(a, Arr.getUnsafe(q, (i + 1) % q.length), p));
  return Arr.reduce(candidates.slice(1), Arr.getUnsafe(candidates, 0), (best, c) => {
    if (Math.hypot(...sub(c, p)) < Math.hypot(...sub(best, p))) return c;
    return best;
  });
};

/**
 * How much of a stroke runs through a line of text where it shows: its
 * centre line clipped to the text's box grown by half the stroke's width (in
 * canvas pixels, after its transform) less half the tolerance, so the
 * stroke's edge, not its centre, is what meets the letters, and a stroke that
 * grazes a box by no more than the tolerance does not cross it; less every
 * stretch the plates and fills drawn after the stroke hide (see `showing`). Where the centre
 * runs beside the box, what meets the letters is the edge, so a plate hides
 * that stretch when it covers the point of the letters (less the tolerance)
 * nearest the centre.
 */
export const crossing = (
  stroke: InkMark,
  text: TextBox,
  covers: ReadonlyArray<InkMark>,
): number => {
  const box = inset(text.corners, OVERLAP_TOLERANCE / 2 - stroke.width / 2);
  if (Option.isNone(box)) return 0;
  const over = covers.filter((c) => c.order > stroke.order);
  // The letters less the tolerance: where an edge that crosses by more than it lands.
  const letters = Option.getOrElse(inset(text.corners, OVERLAP_TOLERANCE / 2), () => text.corners);
  const hidden = (at: Point) => {
    const meets = nearestIn(letters, at);
    const layers = over.filter((c) => insidePolygon(c.points, meets));
    return showing(stroke, layers) <= VISIBLE_ALPHA;
  };
  return stroke.points.slice(1).reduce((sum, q, i) => {
    const p = Arr.getUnsafe(stroke.points, i);
    return Option.match(clipSegment(p, q, box.value), {
      onNone: () => sum,
      onSome: ([enter, leave]) => {
        const len = Math.hypot(...sub(q, p)) * (leave - enter);
        const steps = Math.max(1, Math.ceil(len / CROSS_STEP));
        const shown = Arr.range(0, steps - 1).filter((k) => {
          const t = enter + ((leave - enter) * (k + 0.5)) / steps;
          return !hidden([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]);
        }).length;
        return sum + (len * shown) / steps;
      },
    });
  }, 0);
};

/** Two boxes' bounds meet, with `pad` pixels to spare. */
const near = (
  a: { readonly x: number; readonly y: number; readonly w: number; readonly h: number },
  b: { readonly x: number; readonly y: number; readonly w: number; readonly h: number },
  pad: number,
) =>
  a.x - pad <= b.x + b.w &&
  b.x <= a.x + a.w + pad &&
  a.y - pad <= b.y + b.h &&
  b.y <= a.y + a.h + pad;

/** The box around a set of ink marks. */
const boundsOf = (marks: ReadonlyArray<InkMark>) => {
  const x = Math.min(...marks.map((m) => m.x));
  const y = Math.min(...marks.map((m) => m.y));
  return {
    x,
    y,
    w: Math.max(...marks.map((m) => m.x + m.w)) - x,
    h: Math.max(...marks.map((m) => m.y + m.h)) - y,
  };
};

/** The letters' height: the text box measured down its own side. */
const lettersHeight = (text: TextBox) => Math.hypot(...sub(text.corners[3], text.corners[0]));

/** Whether `stroke` marks this very line on purpose: it names the hand that wrote it. */
const marksLine = (stroke: InkMark, text: TextBox) =>
  text.scene === stroke.scene &&
  Option.exists(Option.fromUndefinedOr(text.hand), (hand) =>
    Option.exists(Option.fromUndefinedOr(stroke.marks), (marks) => marks.includes(hand)),
  );

/** Whether `stroke` is page texture under `text`: drawn before it, light and thin. */
const textureUnder = (stroke: InkMark, text: TextBox) =>
  stroke.order < text.order &&
  stroke.alpha <= UNDER_ALPHA &&
  stroke.width <= lettersHeight(text) * TEXTURE_WIDTH;

/**
 * Strokes across text: for each visible line, the visible strokes (more than
 * `VISIBLE_ALPHA`: fainter ink does not read over letters) whose width runs
 * through its box (and is not hidden there by the plates and fills drawn after them),
 * other than page texture under it and a stroke that `marks` that very line.
 *
 * Hatching is not measured: it is shading clipped inside a cutout, which the
 * probe records as a fill (`unprobed` in the draw path), so its lines are not
 * where its ink shows; the cutout's outline is what the check sees.
 */
export const inkOverText = (sample: Sample, probed: Probed): ReadonlyArray<InkOverText> => {
  const texts = probed.texts.filter(visible);
  const strokes = probed.inks.filter((m) => m.kind === 'stroke' && m.alpha > VISIBLE_ALPHA);
  const covers = probed.inks.filter((m) => m.kind !== 'stroke');
  const where = { scene: sample.scene, time: sample.time, at: sample.at, frames: 1 };
  const byText = new Map<string, Array<readonly [InkMark, number]>>();
  for (const text of texts)
    for (const stroke of strokes) {
      if (marksLine(stroke, text) || !near(stroke, text, stroke.width)) continue;
      if (textureUnder(stroke, text)) continue;
      const length = crossing(stroke, text, covers);
      if (length <= OVERLAP_TOLERANCE) continue;
      const found = Option.getOrElse(Option.fromNullishOr(byText.get(text.text)), () => []);
      byText.set(text.text, [...found, [stroke, length]]);
    }
  return [...byText].map(([text, crossed]) => {
    const marks = Arr.dedupe(crossed.map(([m]) => m));
    return InkOverText.make({
      ...where,
      text,
      strokes: marks.length,
      length: crossed.reduce((sum, [, len]) => sum + len, 0),
      ...boundsOf(marks),
    });
  });
};

/** The plate under a line of text: the topmost fill or plate under its centre, drawn before it. */
const plateUnder = (probed: Probed, text: TextBox) => {
  const centre: Point = [text.x + text.w / 2, text.y + text.h / 2];
  return Arr.last(
    probed.inks.filter(
      (m) =>
        m.kind !== 'stroke' &&
        m.alpha > VISIBLE_ALPHA &&
        m.order < text.order &&
        insidePolygon(m.points, centre),
    ),
  );
};

/** A plate at least this share of the frame wide and high is a backdrop, and may bleed. */
const BACKDROP = 0.5;
/** How far a plate may drift between two frames and still be at rest. */
const AT_REST = 1;

/**
 * Plates cut off by the frame: a line of text, wholly inside the frame, whose
 * plate (the topmost fill under its centre, drawn before it) reaches past an
 * edge by more than the tolerance and sits still there (`next`, the following
 * frame, has the same line on the same plate). Two kinds of plate bleed off it
 * by design: one at least half the frame wide and half its height, a backdrop
 * or a panel (a sky, a split page), and a band that runs past both opposite
 * edges (a stripe of sky across the frame), whose ends are never meant to
 * show; a banner that is only tall, or only wide, and cut by one edge, is a
 * plate like any other. A line that is past an edge itself, or wholly off
 * the frame (it shows nothing), or a plate still moving, is entering or
 * leaving.
 */
export const platesOffFrame = (
  sample: Sample,
  probed: Probed,
  size: { readonly width: number; readonly height: number },
  next: Probed = probed,
): ReadonlyArray<PlateOffFrame> => {
  const where = { scene: sample.scene, time: sample.time, at: sample.at, frames: 1 };
  const still = (plate: InkMark, text: TextBox) =>
    Arr.some(next.texts, (later) => {
      if (later.text !== text.text) return false;
      return Option.match(plateUnder(next, later), {
        onNone: () => false,
        onSome: (moved) =>
          Math.max(
            Math.abs(moved.x - plate.x),
            Math.abs(moved.y - plate.y),
            Math.abs(moved.w - plate.w),
            Math.abs(moved.h - plate.h),
          ) <= AT_REST,
      });
    });
  return probed.texts.filter(visible).flatMap((text) => {
    if (offFrame(text, size.width, size.height)) return [];
    const inside = pastFrame(text, size.width, size.height);
    if (Math.max(inside.left, inside.top, inside.right, inside.bottom) > 0) return [];
    return Option.match(plateUnder(probed, text), {
      onNone: () => [],
      onSome: (plate) => {
        if (plate.w >= size.width * BACKDROP && plate.h >= size.height * BACKDROP) return [];
        const past = pastFrame(plate, size.width, size.height);
        if (Math.max(past.left, past.top, past.right, past.bottom) <= OVERLAP_TOLERANCE) return [];
        const across = past.left > OVERLAP_TOLERANCE && past.right > OVERLAP_TOLERANCE;
        const down = past.top > OVERLAP_TOLERANCE && past.bottom > OVERLAP_TOLERANCE;
        if (across || down) return [];
        if (!still(plate, text)) return [];
        return [PlateOffFrame.make({ ...where, text: text.text, ...past })];
      },
    });
  });
};

/** How far box `a` reaches past each side of box `b` (0 where it does not). */
const pastBox = (
  a: { readonly x: number; readonly y: number; readonly w: number; readonly h: number },
  b: { readonly x: number; readonly y: number; readonly w: number; readonly h: number },
) => ({
  left: Math.max(0, b.x - a.x),
  top: Math.max(0, b.y - a.y),
  right: Math.max(0, a.x + a.w - (b.x + b.w)),
  bottom: Math.max(0, a.y + a.h - (b.y + b.h)),
});

/**
 * Text running off its plate: a visible line drawn on a declared plate
 * (`probePlate`, so it carries the plate's `order` as `on`) whose box, pulled
 * in by the tolerance, leaves the plate's box, as a brief overrunning its card
 * would. Only a declared plate counts: text over scenery (a sky, a pillar, a
 * coin) has no plate to run off.
 */
export const textsOffPlate = (sample: Sample, probed: Probed): ReadonlyArray<TextOffPlate> => {
  const where = { scene: sample.scene, time: sample.time, at: sample.at, frames: 1 };
  const plates = new Map(probed.texts.map((t) => [t.order, t] as const));
  return probed.texts.filter(visible).flatMap((text) =>
    Option.match(
      Option.flatMap(Option.fromUndefinedOr(text.on), (on) =>
        Option.fromUndefinedOr(plates.get(on)),
      ),
      {
        onNone: () => [],
        onSome: (plate) => {
          const inner = Option.getOrElse(
            inset(text.corners, OVERLAP_TOLERANCE),
            () => text.corners,
          );
          if (inner.every((corner) => insidePolygon(plate.corners, corner))) return [];
          return [TextOffPlate.make({ ...where, text: text.text, ...pastBox(text, plate) })];
        },
      },
    ),
  );
};

/** Whether one box is the plate the other line sits on (`probePlate`): they never collide. */
const carries = (a: TextBox, b: TextBox) => a.on === b.order || b.on === a.order;

/**
 * The layout findings in one probed frame; `next` is the frame after it, which
 * tells a plate at rest from one on its way in or out (the frame itself when
 * there is none).
 */
export const frameFindings = (
  sample: Sample,
  probed: Probed,
  size: { readonly width: number; readonly height: number },
  next: Probed = probed,
): ReadonlyArray<FrameFinding> => {
  const shown = probed.texts.filter(visible);
  const where = { scene: sample.scene, time: sample.time, at: sample.at, frames: 1 };
  const overlaps = shown.flatMap((a, i) =>
    shown.slice(i + 1).flatMap((b) => {
      if (a.text === b.text || carries(a, b)) return [];
      const area = overlapArea(a, b);
      if (area <= 0) return [];
      const [first, second] = Arr.sort([a.text, b.text], Order.String);
      return [TextOverlap.make({ ...where, a: first ?? a.text, b: second ?? b.text, area })];
    }),
  );
  const off = shown.flatMap((box) => {
    const past = pastFrame(box, size.width, size.height);
    if (past.left + past.top + past.right + past.bottom <= 0) return [];
    return [TextOffFrame.make({ ...where, text: box.text, ...past })];
  });
  return [
    ...overlaps,
    ...off,
    ...inkOverText(sample, probed),
    ...platesOffFrame(sample, probed, size, next),
    ...textsOffPlate(sample, probed),
  ];
};

const matchFinding = Match.type<FrameFinding>();

const keyOf = matchFinding.pipe(
  Match.tagsExhaustive({
    TextOverlap: (f) => `overlap\u0000${f.scene}\u0000${f.a}\u0000${f.b}`,
    TextOffFrame: (f) => `off\u0000${f.scene}\u0000${f.text}`,
    InkOverText: (f) => `ink\u0000${f.scene}\u0000${f.text}`,
    PlateOffFrame: (f) => `plate\u0000${f.scene}\u0000${f.text}`,
    TextOffPlate: (f) => `offplate\u0000${f.scene}\u0000${f.text}`,
  }),
);

const edges = (f: { left: number; top: number; right: number; bottom: number }) =>
  f.left + f.top + f.right + f.bottom;

const size = matchFinding.pipe(
  Match.tagsExhaustive({
    TextOverlap: (f) => f.area,
    InkOverText: (f) => f.length,
    TextOffFrame: edges,
    PlateOffFrame: edges,
    TextOffPlate: edges,
  }),
);

const withFrames = (f: FrameFinding, frames: number): FrameFinding => {
  const where = { scene: f.scene, time: f.time, at: f.at, frames };
  return matchFinding.pipe(
    Match.tagsExhaustive({
      TextOverlap: (o): FrameFinding =>
        TextOverlap.make({ ...where, a: o.a, b: o.b, area: o.area }),
      InkOverText: (o): FrameFinding =>
        InkOverText.make({
          ...where,
          text: o.text,
          strokes: o.strokes,
          length: o.length,
          x: o.x,
          y: o.y,
          w: o.w,
          h: o.h,
        }),
      TextOffFrame: (o): FrameFinding =>
        TextOffFrame.make({
          ...where,
          text: o.text,
          left: o.left,
          top: o.top,
          right: o.right,
          bottom: o.bottom,
        }),
      PlateOffFrame: (o): FrameFinding =>
        PlateOffFrame.make({
          ...where,
          text: o.text,
          left: o.left,
          top: o.top,
          right: o.right,
          bottom: o.bottom,
        }),
      TextOffPlate: (o): FrameFinding =>
        TextOffPlate.make({
          ...where,
          text: o.text,
          left: o.left,
          top: o.top,
          right: o.right,
          bottom: o.bottom,
        }),
    }),
  )(f);
};

/**
 * One finding per scene and pair of texts (or per text off the frame): the
 * sampled frame where it is worst, with how many sampled frames show it.
 */
export const mergeFindings = (
  findings: ReadonlyArray<FrameFinding>,
): ReadonlyArray<FrameFinding> => {
  const merged = new Map<string, FrameFinding>();
  for (const f of findings) {
    const key = keyOf(f);
    const seen = Option.fromNullishOr(merged.get(key));
    const frames = Option.match(seen, { onNone: () => 0, onSome: (s) => s.frames }) + f.frames;
    const worst = Option.match(seen, {
      onNone: () => f,
      onSome: (s) => {
        if (size(f) > size(s)) return f;
        return s;
      },
    });
    merged.set(key, withFrames(worst, frames));
  }
  return [...merged.values()];
};

/** Every layout finding is an error but a static hold, which asks for a look (the owner, 2026-09-27). */
export const layoutLevel = (finding: LayoutFinding): Level => {
  if (finding._tag === 'StaticHold') return 'warning';
  return 'error';
};

// ---------------------------------------------------------------------------
// Holds

/**
 * The longest a drawn scene may hold still while its voice speaks: past it
 * the viewer waits on the picture (the `exchange` opening held about 6 s).
 */
export const HOLD = 4;
/**
 * How far a mark's box may move between two probed frames, in the units of
 * the space it was drawn in (its screen drift over its `scale`), and still be
 * at rest: what one boil tick moves a default stroke's box edge at most, twice
 * its jitter. It is the only boil the probe sees: type records its box from the
 * unjittered glyphs, and a cutout the shape it was given, not its torn edge.
 */
export const STILL_DRIFT = 2 * STROKE_JITTER;
/** How far a mark's opacity may change and still be at rest. */
export const STILL_FADE = 0.02;

/**
 * A stretch where the voice speaks and nothing is declared to move: no cue
 * of the scene starts, ends or runs, and the scene is not arriving. `from`
 * and `to` are film seconds.
 */
export interface HoldCandidate {
  readonly scene: string;
  readonly from: number;
  readonly to: number;
}

type Span = readonly [from: number, to: number];

/** Scene-local spans in which the scene declares motion: each cue, and its entering transition. */
const busySpans = (p: Placed): ReadonlyArray<Span> => {
  const cues = [...p.cues.values()].map((c): Span => [c.start, c.end]);
  // The first scene has nothing to arrive from.
  const arriving = Math.min(p.index, 1) * transitionDur(p.spec.enter);
  if (arriving <= 0) return cues;
  return [[0, arriving], ...cues];
};

/** Scene-local: from the first word's start to the last word's end. */
const spokenSpan = (p: Placed): Option.Option<Span> =>
  Option.zipWith(Arr.head(p.voice.words), Arr.last(p.voice.words), (first, last): Span => [
    p.speechStart + first.start,
    p.speechStart + last.end,
  ]);

/** The parts of `within` that no span of `busy` covers. */
const gapsIn = (within: Span, busy: ReadonlyArray<Span>): ReadonlyArray<Span> => {
  const [from, to] = within;
  const sorted = Arr.sort(
    busy,
    Order.mapInput(Order.Number, (s: Span) => s[0]),
  );
  const swept = sorted.reduce<{ readonly gaps: ReadonlyArray<Span>; readonly at: number }>(
    ({ gaps, at }, [start, end]) => {
      const until = Math.min(start, to);
      const next = Math.max(at, end);
      if (until > at) return { gaps: [...gaps, [at, until]], at: next };
      return { gaps, at: next };
    },
    { gaps: [], at: from },
  );
  if (swept.at >= to) return swept.gaps;
  return [...swept.gaps, [swept.at, to]];
};

/**
 * The static leg of `StaticHold`: in each drawn scene (a storyboard card holds
 * still by design), the stretches over `HOLD` inside the voice's spoken span
 * that no cue and no entrance covers. The layout leg probes each one to tell
 * a still picture from motion no cue declares (a walk loop, drifting snow).
 */
export const holdCandidates = (placed: ReadonlyArray<Placed>): ReadonlyArray<HoldCandidate> =>
  placed.flatMap((p) => {
    if (p.spec.storyboard === true) return [];
    return Option.match(spokenSpan(p), {
      onNone: () => [],
      onSome: (spoken) => {
        const gaps = gapsIn(spoken, busySpans(p)).filter(([a, b]) => b - a > HOLD + 1e-9);
        return gaps.map(([a, b]) => ({ scene: p.spec.id, from: p.start + a, to: p.start + b }));
      },
    });
  });

/**
 * The frames across a candidate the layout leg may probe: one per boil tick,
 * from its first frame to its last. Nothing faster than the boil can be told
 * from it, and a sway slower than it is sampled at more than one phase.
 */
export const holdTicks = (
  hold: Pick<HoldCandidate, 'from' | 'to'>,
  fps: number,
): ReadonlyArray<number> => {
  const first = Math.ceil(hold.from * fps - 1e-6);
  const last = Math.ceil(hold.to * fps - 1e-6) - 1;
  const per = fps / BOIL_FPS;
  const ticks = Arr.range(0, Math.floor((last - first) / per)).map(
    (k) => first + Math.round(k * per),
  );
  return Arr.dedupe([...ticks, last]).filter((f) => f >= first && f <= last);
};

/**
 * The ticks the layout leg probes first: one every `HOLD / 2`, and the last.
 * A still run over `HOLD` spans two of them in a row, so only where two in a
 * row hold still does it probe the ticks around them.
 */
export const holdGrid = (ticks: ReadonlyArray<number>): ReadonlyArray<number> => {
  const step = Math.round((HOLD / 2) * BOIL_FPS);
  return Arr.dedupe([
    ...ticks.filter((_, i) => i % step === 0),
    ...Option.toArray(Arr.last(ticks)),
  ]);
};

/**
 * The film seconds a still run covers, from its first still tick `lo` to its
 * last `hi`: a run that reaches the candidate's first or last tick covers it
 * to its edge.
 */
export const stillSpan = (
  hold: Pick<HoldCandidate, 'from' | 'to'>,
  ticks: ReadonlyArray<number>,
  lo: number,
  hi: number,
  fps: number,
): Span => {
  const edge = (end: Option.Option<number>, tick: number, whole: number) => {
    if (Option.exists(end, (f) => f === tick)) return whole;
    return tick / fps;
  };
  return [edge(Arr.head(ticks), lo, hold.from), edge(Arr.last(ticks), hi, hold.to)];
};

type Mark = {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly alpha: number;
  readonly scale: number;
};

/** A mark's box moved no more than `STILL_DRIFT` of its own units, and it faded no more than `STILL_FADE`. */
const boxAtRest = (a: Mark, b: Mark) =>
  Math.max(
    Math.abs(a.x - b.x),
    Math.abs(a.y - b.y),
    Math.abs(a.x + a.w - (b.x + b.w)),
    Math.abs(a.y + a.h - (b.y + b.h)),
  ) <=
    STILL_DRIFT * Math.min(a.scale, b.scale) + 1e-9 && Math.abs(a.alpha - b.alpha) <= STILL_FADE;

/** The picture in a probed frame: everything but the caption line and its plate, which are the voice. */
const pictureOf = (probed: Probed): Probed => ({
  texts: probed.texts.filter((t) => t.caption !== true),
  inks: probed.inks.filter((m) => m.caption !== true),
});

/** Two pictures draw the same marks, in the same order, each where and as strong as it was. */
const atRest = (a: Probed, b: Probed) =>
  a.texts.length === b.texts.length &&
  a.inks.length === b.inks.length &&
  Arr.zip(a.texts, b.texts).every(([s, t]) => s.text === t.text && boxAtRest(s, t)) &&
  Arr.zip(a.inks, b.inks).every(([m, n]) => m.kind === n.kind && boxAtRest(m, n));

/**
 * Whether probed frames hold still: each frame's picture (the caption left
 * out) at rest against the first's, so a slow drift adds up and is seen.
 */
export const heldStill = (frames: ReadonlyArray<Probed>): boolean => {
  const pictures = frames.map(pictureOf);
  return Option.match(Arr.head(pictures), {
    onNone: () => true,
    onSome: (first) => pictures.slice(1).every((p) => atRest(first, p)),
  });
};
