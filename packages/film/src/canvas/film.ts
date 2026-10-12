// A film is an ordered list of scenes. Each scene owns its narration and its
// drawing; the film lays them end to end, sizes each to its voice, and draws
// any instant T — the same function serves the preview player and the export.

import { Predicate, Result, Schema } from 'effect';
import { type Hand, boilTick } from './ink.ts';
import type { Hex } from './colour.ts';
import { DRIFT, type Drift, breathes, hearingCameras, insideCamera } from './camera.ts';
import type { Affine } from '../core/affine.ts';
import { type CaptionCue, sceneCaptions } from '../core/captions.ts';
import {
  type Placed,
  everyTakeRecorded,
  filmEnd,
  layout,
  sceneClock,
  sceneIndexAt,
  sceneOf,
  transitionDur,
} from '../core/layout.ts';
import { FloodInTransition, type UnknownScene } from '../core/errors.ts';
import {
  type Knob,
  Knobs,
  type ResolvedCue,
  type Point,
  type Sound,
  type Span,
  type Timed,
  Timeline,
  type Timings,
  type Transition,
  type Word,
} from '../core/schema.ts';
import {
  cueKeys,
  cueProgress,
  endsLate,
  type TimelineError,
  resolveTimeline,
  staggerAt,
  staggerProgress,
} from '../core/timeline.ts';
import {
  type Grain,
  type Offscreen,
  type PaperStyle,
  grain,
  keepAtMost,
  makeGrain,
  makeLight,
  makePaper,
  makeProduct,
  makeVignette,
  offscreen,
  shadeBy,
} from './paper.ts';
import {
  type BloomSheets,
  BloomStyle,
  GradeStyle,
  bloom,
  grade,
  gradeTables,
  makeBloom,
} from './grade.ts';
import { type Probe, type ProbeSink, probeOf, probing, recordPlate, recordText } from './probe.ts';
import { type Box, type CardSpec, type CardWord, cardWords, floodBox } from './card.ts';
import { type LoadedRig, type PoseOf, type RivePropSpec, drawRig } from './rive.ts';
import { seedOf } from '../core/random.ts';
import {
  CLOCK_EPSILON,
  FILM_FPS,
  type Key,
  clamp,
  ease,
  heardAtOrAfter,
  justBefore,
} from '../core/time.ts';

/** What `f.knob` returns for a knob declared as `V`: a number stays a number, a point a point. */
type KnobValue<V extends Knob> = V extends number ? number : Point;

/**
 * A drawing's Rive rigs, by the names its draw poses them by (`f.rive`): what
 * the film loads before its first frame (`Film.rigs`). A name may stand for no
 * rig (a look that draws its figure some other way declares none for it).
 */
type Rigs = Readonly<Record<string, RivePropSpec | undefined>>;

/** No rigs: every `f.rive` name is a compile error. */
type NoRigs = Record<never, RivePropSpec>;

/**
 * One instant of one scene. `C` names the scene's cues, `K` its knobs and `R`
 * its rigs, when its drawing declares them.
 */
export interface Frame<C extends string = string, K extends Knobs = Knobs, R extends Rigs = Rigs> {
  readonly ctx: CanvasRenderingContext2D;
  readonly w: number;
  readonly h: number;
  /** Seconds since the scene began (keeps running past `dur` during an exit). */
  readonly t: number;
  readonly dur: number;
  /** Film seconds. */
  readonly T: number;
  /** 12 fps tick for line boil. */
  readonly boil: number;
  /** When the narration starts and ends, scene-local. */
  readonly speech: { readonly start: number; readonly end: number };
  /** Local start time of a `{mark}` in this scene's narration. */
  mark(name: string): number;
  /** A named cue from the scene's `timeline`, scene-local. */
  cue(name: C): ResolvedCue;
  /**
   * 0→1 across a named cue, eased by the cue's declared `ease` (default
   * `DEFAULT_EASE`, `inOutCubic`): `progress(t, cue.start, cue.dur, ease[cue.ease])`. The ease
   * is data on the span, so the lab can change it; the draw never passes one.
   */
  at(name: C): number;
  /**
   * Keyframes across a named cue (`cueKeys`): each key's time is a fraction of
   * the cue, 0 its start and 1 its end, and its ease a name; a key that names
   * none takes the cue's `ease`. So the lab's `dur` and `ease` edits reshape the
   * motion: `f.keys('gavel', [[0, 0.35], [0.4, -0.2], [1, 1.5, 'outQuad']])`.
   */
  keys(name: C, frames: ReadonlyArray<Key>): number;
  /**
   * 0→1 for item `i` of `n` across a named cue (`staggerProgress`), eased by
   * the cue's `ease`: the items' starts spread over the span's `stagger` share
   * and each lasts the rest, so a `dur` edit scales every item.
   */
  stagger(name: C, i: number, n: number): number;
  /**
   * 0→1 for the item at `at` (0 the first, 1 the last) across a named cue
   * (`staggerAt`): `f.stagger` for a set spread by place rather than count,
   * `f.staggerAt('green', field.reach)`.
   */
  staggerAt(name: C, at: number): number;
  /** A knob the drawing declares (`knobs: { handY: 800 }`): a number or a point. */
  knob<N extends keyof K & string>(name: N): KnobValue<K[N]>;
  /**
   * Draw a rig the drawing declares (`rigs: { accused: … }`) at the origin
   * under the canvas's transform, posed from rest as `pose` says (its
   * timelines at their times, its view-model numbers): the frame's own, never
   * the frame before's. Throws, naming it, for a rig the film has not loaded,
   * or a pose that names what the rig lacks.
   */
  rive<N extends keyof R & string>(name: N, pose: PoseOf<R[N]>): void;
  /** The spoken words, scene-local. */
  readonly words: ReadonlyArray<Word>;
  /**
   * 0→1 as the narration speaks from `from` to `to` (marks; `to` defaults to
   * the end of speech) — for text that reveals in step with the voice.
   */
  spoken(from: string, to?: string): number;
  /** Line-wobble state for a named or numbered drawing. */
  hand(key: string | number): Hand;
  /**
   * Another scene's hands, as its own `f.hand` gives them there, boiling on
   * this frame's tick: a callback or a shot carried over a cut draws that
   * scene's paper torn as it was, not a new sheet. The scene is found by its
   * drawing, as `f.knobsOf` finds it (`f.handsOf(thesis)`), so a mistyped
   * scene fails to compile. Throws, naming it, for a drawing no scene of the
   * film draws, or that more than one does.
   */
  handsOf(of: KnobsOwner<Knobs>): (key: string | number) => Hand;
  /**
   * Another scene's knobs, as that scene reads them on this frame (a lab
   * edit to them included), found by its drawing: a callback that frames
   * what another scene framed reads it there, so a drag of that knob moves
   * both: `f.knobsOf(thesis)('city')`. Throws, naming it, for a drawing no
   * scene of the film draws, or that more than one does.
   */
  knobsOf<K extends Knobs>(drawing: KnobsOwner<K>): KnobReader<K>;
}

/** A scene's knobs, read by name as its drawing declares them; a name it lacks throws. */
function knobReader<K extends Knobs>(
  knobs: ReadonlyMap<string, Knob>,
  scene: string,
): KnobReader<K>;
function knobReader(knobs: ReadonlyMap<string, Knob>, scene: string) {
  return (name: string): Knob => {
    const k = knobs.get(name);
    if (k === undefined) throw new Error(`scene ${scene} has no knob "${name}"`);
    return k;
  };
}

/** A drawing, as `f.knobsOf` finds its scene: by its `draw`, typed by its knobs. */
interface KnobsOwner<K extends Knobs> {
  readonly draw: (f: never) => void;
  readonly knobs?: K;
}

/** Reads a scene's knobs by name, typed as that drawing declares them. */
type KnobReader<K extends Knobs> = <N extends keyof K & string>(name: N) => KnobValue<K[N]>;

/** The hand scene `scene` gives `key` on boil tick `boil`: what `f.hand` and `f.handsOf` both give. */
const sceneHand = (scene: string, key: string | number, boil: number): Hand => ({
  boil,
  seed: Predicate.isNumber(key) ? key : seedOf(`${scene}:${key}`),
});

export interface SceneSpec extends Timed {
  /**
   * The scene's picture at `f.t`. A scene whose card floods in from a
   * highlight returns the highlight's box (`verse` gives it), which the flood
   * grows from on the same frame (`CardSpec.flood`); any other returns nothing.
   */
  readonly draw: (f: Frame) => Box | void;
  /** The Rive rigs its draw poses by name (`f.rive`): the film loads each before its first frame. */
  readonly rigs?: Rigs;
  /**
   * How this scene breathes (`Drift`), in place of the film's `DRIFT`: `0`
   * holds it still (an end card), a `Drift` sets its own size. `DRIFT` when
   * it names none.
   */
  readonly drift?: Drift | 0;
  /**
   * The light the scene is lit by (CRAFT rule 11, the colour script): its
   * page and all drawn on it multiplied by the light's colours, under the
   * film's vignette and grain. A function reads it each frame, so a light can
   * come up or go down on a cue. Unlit when it names none.
   */
  readonly light?: Light | ((f: Frame) => Light);
  /**
   * The scene's full-screen card (`canvas/card.ts`, CRAFT rule 1): over its
   * cue the card is the frame, drawn on the film's paper in place of the
   * scene (no light or vignette on it, the film's finish over it, no caption:
   * the card is the words); over its flood's cue it grows from the box the
   * scene's draw returns, over the lit scene. A card held to the scene's end
   * leaves as the card into a transition; a flood inside one stops the film.
   */
  readonly card?: CardSpec<string, Frame>;
}

/**
 * A scene's light: `color` over the middle of the frame, falling to `edge`
 * (`color` when it names none) at the corners, at `amount` (0 unlit, 1 fully
 * lit; 1 when it names none). White is no light at all. A light is drawn
 * once per `color` and `edge` and kept (the last `SHEETS_KEPT`), so a draw
 * that returns one of a few lights, its `amount` rewritten, allocates
 * nothing; a light whose colour moves every frame draws a sheet a frame but
 * never holds more than a few.
 */
export interface Light {
  readonly color: Hex;
  readonly edge?: Hex;
  readonly amount?: number;
  /**
   * How much of the film's vignette the scene's frame takes: 1 all of it (when
   * it names none), 0 none (a look whose medium has none: a print), or between.
   * A transition eases from the outgoing scene's share to the incoming one's.
   */
  readonly vignette?: number;
}

/** The share of the film's vignette a scene lit by `light` takes (`Light.vignette`). */
const vignetteOf = (light: Light | undefined) => clamp(light?.vignette ?? 1);

/** A span whose `after` or `with` names one of the cues `K`. */
type SpanOf<K extends string> = Span extends infer S
  ? S extends { readonly after: string }
    ? Omit<S, 'after'> & { readonly after: K }
    : S extends { readonly with: string }
      ? Omit<S, 'with'> & { readonly with: K }
      : S
  : never;

/** A timeline whose cues refer only to each other. */
type Closed<T extends Timeline> = { readonly [N in keyof T]: SpanOf<keyof T & string> };

/** No knobs: every `f.knob` name is a compile error. */
type NoKnobs = Record<never, Knob>;

/**
 * Declare a drawing with a timeline, knobs and rigs, so `after` and `with` in
 * the timeline, `f.cue` and `f.at` in `draw` accept only the cue names it
 * declares, `f.knob` only its knob names, typed as declared, and `f.rive` only
 * its rig names, posed as each rig declares. An identity: the result is an
 * ordinary scene drawing.
 */
export const drawing = <
  const T extends Timeline,
  const K extends Knobs = NoKnobs,
  const R extends Rigs = NoRigs,
>(
  d: Omit<SceneSpec, 'id' | 'say' | 'timeline' | 'knobs' | 'rigs' | 'draw' | 'light' | 'card'> & {
    readonly timeline: T & Closed<T>;
    readonly knobs?: K;
    readonly rigs?: R;
    readonly draw: (f: Frame<keyof T & string, K, R>) => Box | void;
    readonly light?: Light | ((f: Frame<keyof T & string, K, R>) => Light);
    readonly card?: CardSpec<keyof T & string, Frame<keyof T & string, K, R>>;
  },
) => d;

/** An opacity or strength the canvas draws: 0..1. */
const Unit = Schema.Finite.check(Schema.isBetween({ minimum: 0, maximum: 1 }));
/** A length in px the canvas draws: finite, not negative. */
const Length = Schema.Finite.check(Schema.isGreaterThanOrEqualTo(0));
/** A count or a tile side: a whole number, at least 1. */
const Count = Schema.Int.check(Schema.isGreaterThanOrEqualTo(1));

/**
 * The captions' look. The plate fields are checked where the film is made
 * (`createFilm`), so a plate the canvas cannot draw never reaches a frame.
 */
export const CaptionStyle = Schema.Struct({
  font: Schema.String,
  color: Schema.String,
  /** The plate's colour. */
  plate: Schema.String,
  /** How opaque the plate shows, 0..1. Defaults to 0.82. */
  plateOpacity: Schema.optionalKey(Unit),
  /** The plate's height in px. Defaults to 60. */
  plateHeight: Schema.optionalKey(Length),
  /** Space either side of the line inside the plate, in px. Defaults to 26. */
  platePadding: Schema.optionalKey(Length),
  /** The plate's corner radius in px. Defaults to 12. */
  plateRadius: Schema.optionalKey(Length),
  /** How far above the frame's bottom edge the line's centre sits, in px. Defaults to 86. */
  bottom: Schema.optionalKey(Schema.Finite),
});
export type CaptionStyle = typeof CaptionStyle.Type;

/**
 * The finish laid over every frame, after the scenes: a vignette and film
 * grain. Checked where the film is made (`createFilm`).
 */
export const FinishStyle = Schema.Struct({
  /** How strongly the vignette darkens the edges toward `shade`, 0..1. Defaults to 0.28. */
  vignette: Schema.optionalKey(Unit),
  /**
   * How strongly the film grain overlays the frame, 0..1: a faint film layer,
   * since the paper carries its own grain on its planes (`fibre.ts`). Defaults to 0.03.
   */
  grain: Schema.optionalKey(Unit),
  /** A grain tile's side in whole px, at least 1. Defaults to 256. */
  grainSize: Schema.optionalKey(Count),
  /** How many grain tiles cycle on the boil tick, at least 1. Defaults to 6. */
  grainTiles: Schema.optionalKey(Count),
  /** The brightest light spilling soft into the air about it (`grade.ts`). None by default. */
  bloom: Schema.optionalKey(BloomStyle),
  /** Contrast, saturation and a split tone over the whole frame (`grade.ts`). None by default. */
  grade: Schema.optionalKey(GradeStyle),
});
export type FinishStyle = typeof FinishStyle.Type;

/**
 * A scene's own breath (`Drift`): a push a share of the shot's zoom, over −1
 * (so the shot never turns inside out), and a slide in frame px; or `0`,
 * none. Checked where the film is made (`createFilm`).
 */
const SceneDrift = Schema.Union([
  Schema.Literal(0),
  Schema.Struct({
    zoom: Schema.Finite.check(Schema.isGreaterThan(-1)),
    x: Schema.Finite,
  }),
]);

/** A CSS font the canvas sets (`600 60px "Fraunces"`): its size in a short's 1080 × 1920 px. */
const Font = Schema.NonEmptyString;

/**
 * How a film's shorts set their words (`canvas/short.ts`): the hook line
 * above the picture, and the captions below it, whose words inside a
 * quotation take the `highlight` as they are read. Checked where the film is
 * made (`createFilm`); each value it leaves out takes its default.
 */
const ShortStyle = Schema.Struct({
  hook: Schema.optionalKey(Schema.Struct({ font: Font, color: Schema.String })),
  caption: Schema.optionalKey(
    Schema.Struct({
      font: Font,
      color: Schema.String,
      highlight: Schema.optionalKey(Schema.String),
    }),
  ),
});
type ShortStyle = typeof ShortStyle.Type;

/** A short style with every value it leaves out at its default. */
export interface ShortLook {
  readonly hook: { readonly font: string; readonly color: string };
  readonly caption: { readonly font: string; readonly color: string; readonly highlight: string };
}

export interface FilmSpec {
  readonly title: string;
  readonly width?: number;
  readonly height?: number;
  readonly fps?: number;
  readonly paper: PaperStyle;
  /** The vignette's colour, and an ink transition's when it names none. */
  readonly shade: string;
  /** The vignette and grain over every frame. */
  readonly finish?: FinishStyle;
  readonly scenes: ReadonlyArray<SceneSpec>;
  readonly timings?: Timings;
  readonly captions?: CaptionStyle;
  /** Film-wide narration track, when every scene is recorded. */
  readonly audio?: string;
  /** The film's music and effects (`sound.ts`): the player marks them on its timeline. */
  readonly sound?: Sound;
  /** The film's named colours (`palette.ts`): the look-book shows them as swatches. */
  readonly palette?: Readonly<Record<string, string>>;
  /** How its shorts set the hook and the captions. */
  readonly short?: ShortStyle;
}

/** A knob as a frame read it (`RenderOptions.knobs`): the lab's handles come from these. */
export interface KnobRead {
  readonly scene: string;
  readonly name: string;
  readonly value: Knob;
  /**
   * The canvas transform when the scene read it, straight onto the frame: a
   * point knob drawn at its value in that space lands at `transform · value`
   * in frame pixels. None when read into a transition's layer, which is
   * composited moving or fading: there the frame cannot say where it lands.
   */
  readonly transform: Affine | undefined;
  /**
   * For a knob read outside every camera, the transform inside the first
   * camera its scene applied after the read: a point read before `camera(…)`
   * (or `multiplane`, its focal plane) and drawn inside it lands at
   * `framed · value`. None when no camera followed, or read inside one.
   */
  readonly framed?: Affine;
  /**
   * Beside `framed`, the same camera as authored, before its drift: where a
   * knob camera keeps its target centred while the shot breathes around it.
   */
  readonly aimed?: Affine;
}

/** Where a frame records the knobs it read, for the lab (`RenderOptions.knobs`). */
interface Reads {
  readonly list: KnobRead[];
  /** Read straight onto the frame, not into a transition's layer. */
  readonly direct: boolean;
}

/**
 * A scene's timeline or knobs, standing in for its drawing's in a frame the
 * lab draws with it: a schema, as the editor's machine carries one in its
 * events.
 */
export const SceneEdit = Schema.Struct({
  timeline: Schema.optionalKey(Timeline),
  knobs: Schema.optionalKey(Knobs),
});
export type SceneEdit = typeof SceneEdit.Type;

/**
 * An edit resolved for its scene (`Film.edit`), on the scene's own clock as
 * `layout()` resolves its drawing's: the cues and knobs a frame draws with in
 * place of the scene's own, and the literals they came from.
 */
export interface ShownEdit {
  readonly edit: SceneEdit;
  readonly cues: ReadonlyMap<string, ResolvedCue>;
  readonly knobs: ReadonlyMap<string, Knob>;
}

/**
 * Why an edit does not resolve: the film has no such scene, its timeline
 * names what the scene lacks, or it moves the card's flood into a transition.
 */
export type EditError = UnknownScene | TimelineError | FloodInTransition;

/**
 * One frame of footage a frame of a film reads (`Film.footageAt`): a derived
 * file of the footage library by its content (`source`, `<name>/<sha12>`,
 * the same in the proxy the lab plays and the mezzanine the render reads),
 * at `at` seconds of the source's own clock.
 */
export interface FootageRead {
  readonly source: string;
  readonly at: number;
}

/**
 * The footage frames the host decoded for one frame (`RenderOptions.footage`):
 * each read the frame named (`Film.footageAt`), as a picture to draw, or none
 * when the host has not decoded it. The host fills it before the frame is
 * drawn (`browser/footage.ts` `Footage`), so a film's draw stays synchronous
 * and keeps nothing between frames.
 */
export interface FootageFrames {
  readonly frame: (read: FootageRead) => CanvasImageSource | undefined;
}

export interface RenderOptions {
  readonly captions?: boolean;
  /**
   * The footage frames this frame reads (`Film.footageAt`), decoded by the
   * host. A film that reads none (a drawn film) is never given any.
   */
  readonly footage?: FootageFrames;
  /**
   * Draw each scene named here with its resolved edit's cues and knobs in
   * place of its drawing's, for this frame only: the lab's live preview of a
   * drag, and its compare with HEAD. Nothing is kept: the next frame draws
   * what it is given.
   */
  readonly edits?: ReadonlyMap<string, ShownEdit>;
  /** Collect every knob the frame reads into this array. The pixels are the same either way. */
  readonly knobs?: KnobRead[];
  /**
   * Collect every line of text and every mark of ink the frame draws into
   * this sink (the probe `film check` reads). Leave it out for an ordinary
   * frame; the pixels are the same either way.
   */
  readonly probe?: ProbeSink;
}

export interface Film {
  readonly title: string;
  readonly width: number;
  readonly height: number;
  readonly fps: number;
  readonly duration: number;
  readonly placed: ReadonlyArray<Placed<SceneSpec>>;
  readonly audio: string | undefined;
  readonly sound: Sound | undefined;
  /** Named colours, as declared (none when the film declares none). */
  readonly palette: Readonly<Record<string, string>>;
  readonly allRecorded: boolean;
  /** The sheet it is drawn on, as made: what a page cut from it (a short) is drawn on too. */
  readonly look: FilmLook;
  sceneAt(T: number): Placed<SceneSpec>;
  /**
   * The footage frame `T` reads, a pure function of the film (a talk's
   * camera take at the source second its edit puts at `T`): what the host
   * decodes before it draws `T` (`RenderOptions.footage`). A drawn film reads
   * none and has no `footageAt`, so it is drawn as it always was.
   */
  readonly footageAt?: (T: number) => ReadonlyArray<FootageRead>;
  render(ctx: CanvasRenderingContext2D, T: number, opts?: RenderOptions): void;
  /**
   * `edit` resolved for `scene` as a frame draws it (`RenderOptions.edits`):
   * its timeline on the scene's clock, else the scene's cues; its knobs, else
   * the scene's. Fails as `layout()` would for a timeline that cannot resolve.
   */
  edit(scene: string, edit: SceneEdit): Result.Result<ShownEdit, EditError>;
  /** The Rive rigs its scenes' drawings declare, and the loaded ones it draws with. */
  readonly rigs: FilmRigs;
}

/**
 * A film's rigs: every one its drawings declare (`drawing({ rigs })`), each
 * once, never listed a second time; and where the loader (`loadRigs`,
 * src/rive) stands the loaded ones for its draws. They belong to this film
 * value: another film, a page's second one among them, loads its own.
 */
interface FilmRigs {
  readonly declared: ReadonlyArray<RivePropSpec>;
  /** Draw with `loaded` from now on; what it returns stands them down again (the load's scope closing). */
  readonly stand: (loaded: ReadonlyMap<RivePropSpec, LoadedRig>) => () => void;
}

/** The finish's vignette and grain, each at its default where the film declares none. */
type Finish = Required<Omit<FinishStyle, 'bloom' | 'grade'>> & {
  readonly bloom: BloomStyle | undefined;
  readonly grade: GradeStyle | undefined;
};

/** A film's paper, shade and finish, every finish value at its default where it declares none. */
interface FilmLook {
  readonly paper: PaperStyle;
  readonly shade: string;
  readonly finish: Finish;
  readonly short: ShortLook;
}

const affineOf = (m: DOMMatrix): Affine => [m.a, m.b, m.c, m.d, m.e, m.f];

/**
 * A film's finish, checked (a `SchemaError` naming the field when the canvas
 * could not draw it), each value it leaves out at its default.
 */
const finishOf = (declared: FinishStyle = {}): Finish => {
  const f = Schema.decodeSync(FinishStyle)(declared);
  return {
    vignette: f.vignette ?? 0.28,
    grain: f.grain ?? 0.03,
    grainSize: f.grainSize ?? 256,
    grainTiles: f.grainTiles ?? 6,
    bloom: f.bloom,
    grade: f.grade,
  };
};

/**
 * A film's caption style, checked (a `SchemaError` naming the field when the
 * canvas could not draw it), each plate value it leaves out at its default.
 */
const captionOf = (declared: CaptionStyle): Required<CaptionStyle> => {
  const c = Schema.decodeSync(CaptionStyle)(declared);
  return {
    font: c.font,
    color: c.color,
    plate: c.plate,
    plateOpacity: c.plateOpacity ?? 0.82,
    plateHeight: c.plateHeight ?? 60,
    platePadding: c.platePadding ?? 26,
    plateRadius: c.plateRadius ?? 12,
    bottom: c.bottom ?? 86,
  };
};

/** The gold a quotation's words take in a short's captions when the film names none. */
const QUOTE_GOLD = '#e6b347';

/**
 * A film's short style, checked (a `SchemaError` naming the field when the
 * canvas could not set it), each value it leaves out at its default: the
 * film's `shade` for the words, serif for the hook and sans for the captions.
 */
const shortOf = (declared: ShortStyle = {}, shade: string): ShortLook => {
  const s = Schema.decodeSync(ShortStyle)(declared);
  return {
    hook: s.hook ?? { font: '600 60px serif', color: shade },
    caption: {
      font: s.caption?.font ?? '600 58px sans-serif',
      color: s.caption?.color ?? shade,
      highlight: s.caption?.highlight ?? QUOTE_GOLD,
    },
  };
};

/** The most full-frame light sheets a film keeps of each kind (8 MB each at 1080p). */
export const SHEETS_KEPT = 4;

/** How much a probe's sink held before a scene drew into it (scratch, one draw at a time). */
const SINK_MARK = { texts: 0, inks: 0, faces: 0, hands: 0 };

/** Mark how much `sink` holds now, so a draw made again can let the first go. */
const markSink = (sink: ProbeSink | undefined) => {
  SINK_MARK.texts = sink?.texts.length ?? 0;
  SINK_MARK.inks = sink?.inks.length ?? 0;
  SINK_MARK.faces = sink?.faces?.length ?? 0;
  SINK_MARK.hands = sink?.hands?.length ?? 0;
};

/** Let go of everything `sink` took since `markSink`. */
const rewindSink = (sink: ProbeSink | undefined) => {
  if (sink === undefined) return;
  sink.texts.length = SINK_MARK.texts;
  sink.inks.length = SINK_MARK.inks;
  if (sink.faces !== undefined) sink.faces.length = SINK_MARK.faces;
  if (sink.hands !== undefined) sink.hands.length = SINK_MARK.hands;
};

/** The breath a scene draw is given (`SceneBreath`), rewritten for each draw. */
interface BreathNow {
  through: number;
  drift: Drift | 0;
  outer: boolean;
  readonly width: number;
  readonly height: number;
}

/**
 * Scene `p`'s cues (`cues`: its own, or an edit's) unless its card's flood
 * would fall inside a transition: a flood is drawn over its scene's own frame
 * alone, never over a transition's two layers, so one that starts inside the
 * scene's way in (`enter`, not a cut) or runs past its end (`endsLate`, the
 * one judgement of a late end) into the next scene's way in is refused, where
 * the film is made and where an edit is, rather than silently not drawn. A
 * flood naming a cue the scene lacks is the frame's to refuse (`holds`).
 */
const floodInTransition = (
  p: Placed<SceneSpec>,
  next: Placed<SceneSpec> | undefined,
  cues: ReadonlyMap<string, ResolvedCue>,
): Result.Result<ReadonlyMap<string, ResolvedCue>, FloodInTransition> => {
  const flood = p.spec.card?.flood;
  const c = flood === undefined ? undefined : cues.get(flood.cue);
  if (flood === undefined || c === undefined) return Result.succeed(cues);
  const enter = transitionDur(p.spec.enter);
  const refused = (side: 'into' | 'out', at: number, edge: number) =>
    Result.fail(
      FloodInTransition.make({
        scene: p.spec.id,
        cue: flood.cue,
        side,
        next: next?.spec.id ?? '',
        at,
        edge,
      }),
    );
  if (p.index > 0 && c.start < enter) return refused('into', c.start, enter);
  if (next !== undefined && transitionDur(next.spec.enter) > 0 && endsLate(c, p.dur))
    return refused('out', c.end, p.dur);
  return Result.succeed(cues);
};

export const createFilm = (spec: FilmSpec): Film => {
  const width = spec.width ?? 1920;
  const height = spec.height ?? 1080;
  const fps = spec.fps ?? FILM_FPS;
  const placed = Result.getOrThrow(layout(spec.scenes, spec.timings));
  const duration = filmEnd(placed);
  const allRecorded = everyTakeRecorded(placed);
  const finish = finishOf(spec.finish);
  /** Each scene's breath: its own `drift` where it sets one, `DRIFT` where it does not. */
  const drifts = new Map<string, Drift | 0>(
    placed.map((p) => [
      p.spec.id,
      p.spec.drift === undefined ? DRIFT : Schema.decodeSync(SceneDrift)(p.spec.drift),
    ]),
  );
  const captions = spec.captions === undefined ? undefined : captionOf(spec.captions);
  const short = shortOf(spec.short, spec.shade);
  /**
   * Each card's words, set once from its scene's take (`cardWords`): a card
   * that names a mark its line lacks, or a payoff it never says, stops the
   * film here, as a timeline that does not resolve does.
   */
  const cards = new Map<string, ReadonlyArray<CardWord>>();
  for (const p of placed) {
    const card = p.spec.card;
    if (card === undefined) continue;
    const words = cardWords(p.spec.id, p.voice, p.speechStart, card);
    if (Result.isFailure(words)) throw new Error(words.failure);
    cards.set(p.spec.id, words.success);
    const flooded = floodInTransition(p, placed[p.index + 1], p.cues);
    if (Result.isFailure(flooded)) throw new Error(flooded.failure.message);
  }

  // Built lazily: the film must lay out where there is no DOM (tools, tests).
  let assets:
    | {
        paper: HTMLCanvasElement;
        grain: Grain;
        vignette: HTMLCanvasElement;
        a: Offscreen;
        b: Offscreen;
        bloom: BloomSheets | undefined;
      }
    | undefined;
  const getAssets = () =>
    (assets ??= {
      paper: makePaper(width, height, spec.paper),
      grain: makeGrain(finish.grainSize, finish.grainTiles, spec.paper.seed + 99, width, height),
      vignette: makeVignette(width, height, spec.shade, finish.vignette),
      a: offscreen(width, height),
      b: offscreen(width, height),
      bloom: finish.bloom === undefined ? undefined : makeBloom(width, height),
    });
  /** The grade's tables, built once (none for a film with no grade). */
  const graded = finish.grade === undefined ? undefined : gradeTables(finish.grade);

  /** Each light's sheet, by `color` and `edge` (`makeLight`), the fewest kept (`SHEETS_KEPT`). */
  const lights = new Map<string, HTMLCanvasElement>();
  const lightSheet = (light: Light) => {
    const edge = light.edge ?? light.color;
    const key = `${light.color} ${edge}`;
    const have = lights.get(key);
    if (have !== undefined) return have;
    return keepAtMost(lights, key, makeLight(width, height, light.color, edge), SHEETS_KEPT);
  };
  /** Multiply the frame by `light` at its amount. */
  const lightUp = (ctx: CanvasRenderingContext2D, light: Light) => {
    const amount = clamp(light.amount ?? 1);
    if (amount > 0) shadeBy(ctx, lightSheet(light), amount);
  };
  /**
   * A fixed light at its amount and the vignette, multiplied into one sheet
   * by `color`, `edge` and amount, the fewest kept (`SHEETS_KEPT`): a frame
   * lit by one takes one multiply for both.
   */
  const litVignettes = new Map<string, HTMLCanvasElement>();
  const litVignette = (light: Light, amount: number) => {
    const key = `${light.color} ${light.edge ?? light.color} ${amount}`;
    const have = litVignettes.get(key);
    if (have !== undefined) return have;
    const made = makeProduct(width, height, lightSheet(light), amount, getAssets().vignette);
    return keepAtMost(litVignettes, key, made, SHEETS_KEPT);
  };
  /**
   * The light and the vignette over a whole frame: one multiply by their
   * product for a fixed light, the two in turn for a light read per frame
   * (its amount moves, so a product would be a new sheet each frame). The
   * vignette at the light's share of it (`Light.vignette`): the product only
   * for the whole of it.
   */
  const lightAndVignette = (
    ctx: CanvasRenderingContext2D,
    light: Light | undefined,
    fixed: boolean,
  ) => {
    const amount = clamp(light?.amount ?? 1);
    const share = vignetteOf(light);
    if (light === undefined || amount <= 0) vignetteAt(ctx, share);
    else if (fixed && share === 1) shadeBy(ctx, litVignette(light, amount));
    else {
      lightUp(ctx, light);
      vignetteAt(ctx, share);
    }
  };

  /** The film's vignette over `ctx` at `share` of it; none at none. */
  const vignetteAt = (ctx: CanvasRenderingContext2D, share: number) => {
    if (share > 0) shadeBy(ctx, getAssets().vignette, share);
  };

  /**
   * The vignette over a transition's composite: the outgoing side's share
   * (`from`; none for a card) to the incoming side's (`to`). One share, as
   * ever, when they are the same; across a pan each side's share over the
   * part of the frame it holds (`out` from `outX`, the incoming from `inX`),
   * and otherwise eased between them by the transition's progress `p`.
   */
  const transitionVignette = (
    ctx: CanvasRenderingContext2D,
    pan: boolean,
    p: number,
    from: number,
    to: number,
    outX: number,
    inX: number,
  ) => {
    if (from === to) return vignetteAt(ctx, from);
    if (!pan) return vignetteAt(ctx, from + (to - from) * p);
    for (const [x, share] of [
      [outX, from],
      [inX, to],
    ] as const) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(x, 0, width, height);
      ctx.clip();
      vignetteAt(ctx, share);
      ctx.restore();
    }
  };

  /** The scene playing at `T`, as the layout attributes it (`sceneIndexAt`): no allocation, for every frame. */
  const sceneAt = (T: number): Placed<SceneSpec> => {
    const p = placed[sceneIndexAt(placed, T)];
    if (p === undefined) throw new Error('film has no scenes');
    return p;
  };

  /** The scenes each drawing draws, gathered once: what `f.knobsOf` and `f.handsOf` look a drawing up in. */
  const drawnScenes = new Map<(f: never) => void, Array<Placed<SceneSpec>>>();
  for (const q of placed) {
    const same = drawnScenes.get(q.spec.draw);
    if (same === undefined) drawnScenes.set(q.spec.draw, [q]);
    else same.push(q);
  }

  /** The one scene `draw` draws, for `f.knobsOf` and `f.handsOf`; `by` names the scene that asked. */
  const drawnBy = (draw: (f: never) => void, by: string) => {
    const found = drawnScenes.get(draw) ?? [];
    const one = found[0];
    if (one === undefined || found.length > 1)
      throw new Error(
        `scene ${by}: f.knobsOf and f.handsOf take the drawing of one scene; ${found.length} scenes draw it (${found.map((q) => q.spec.id).join(', ')})`,
      );
    return one;
  };

  /** Every rig the scenes declare, each once, in film order. */
  const declaredRigs = [
    ...new Set(
      placed.flatMap((q) =>
        Object.values(q.spec.rigs ?? {}).filter((r): r is RivePropSpec => r !== undefined),
      ),
    ),
  ];
  /** The loaded rigs the film draws with: none until its loader stands them (`FilmRigs.stand`). */
  let standing: ReadonlyMap<RivePropSpec, LoadedRig> = new Map();
  const rigs: FilmRigs = {
    declared: declaredRigs,
    stand: (loaded) => {
      const before = standing;
      standing = loaded;
      return () => {
        standing = before;
      };
    },
  };

  const edit = (scene: string, e: SceneEdit): Result.Result<ShownEdit, EditError> =>
    Result.flatMap(sceneOf(placed, scene), (p) =>
      Result.map(
        Result.flatMap(
          e.timeline === undefined
            ? Result.succeed(p.cues)
            : resolveTimeline(e.timeline, sceneClock(p)),
          // An edit is refused a flood it would move into a transition, as the source is.
          (cues): Result.Result<ReadonlyMap<string, ResolvedCue>, EditError> =>
            floodInTransition(p, placed[p.index + 1], cues),
        ),
        (cues): ShownEdit => ({
          edit: e,
          cues,
          knobs: e.knobs === undefined ? p.knobs : new Map(Object.entries(e.knobs)),
        }),
      ),
    );

  /** Scene `p` as `edits` show it: its edit's cues and knobs, or its own. */
  const shownOf = (p: Placed<SceneSpec>, edits: ReadonlyMap<string, ShownEdit> | undefined) =>
    edits?.get(p.spec.id) ?? p;

  /**
   * Each scene's captions, built once from its words when the film has a
   * caption style: a captioned frame only finds its line.
   */
  const captionsOf =
    captions === undefined ? undefined : new Map(placed.map((p) => [p, sceneCaptions(p)]));

  const localWords = new Map(
    placed.map((p) => [
      p,
      p.voice.words.map((w) => ({
        ...w,
        start: w.start + p.speechStart,
        end: w.end + p.speechStart,
      })),
    ]),
  );

  /**
   * Scene `p`'s frame at film time `T`, drawn on `ctx`: its clock, cues,
   * knobs and words. A knob read outside every camera is noted in `unframed`
   * (its place in `reads`), for the next camera to frame.
   */
  const frameOf = (
    ctx: CanvasRenderingContext2D,
    p: Placed<SceneSpec>,
    T: number,
    boil: number,
    reads: Reads | undefined,
    edits: ReadonlyMap<string, ShownEdit> | undefined,
    unframed: number[],
  ): Frame => {
    const t = T - p.start;
    const words = localWords.get(p) ?? [];
    const shown = shownOf(p, edits);
    const frame: Frame = {
      ctx,
      w: width,
      h: height,
      t,
      dur: p.dur,
      T,
      boil,
      speech: { start: p.speechStart, end: p.speechStart + p.voice.duration },
      mark: (name) => {
        const at = p.voice.marks.get(name);
        if (at === undefined) throw new Error(`scene ${p.spec.id} has no mark {${name}}`);
        return p.speechStart + at;
      },
      cue: (name) => {
        const c = shown.cues.get(name);
        if (c === undefined) throw new Error(`scene ${p.spec.id} has no cue "${name}"`);
        return c;
      },
      at: (name) => cueProgress(frame.cue(name), t),
      keys: (name, frames) => cueKeys(frame.cue(name), t, frames),
      stagger: (name, i, n) => staggerProgress(frame.cue(name), t, i, n),
      staggerAt: (name, at) => staggerAt(frame.cue(name), t, at),
      knob: (name) => {
        const k = shown.knobs.get(name);
        if (k === undefined) throw new Error(`scene ${p.spec.id} has no knob "${name}"`);
        if (reads?.direct === true && !insideCamera(ctx)) unframed.push(reads.list.length);
        reads?.list.push({
          scene: p.spec.id,
          name,
          value: k,
          transform: reads.direct ? affineOf(ctx.getTransform()) : undefined,
        });
        return k;
      },
      rive: (name, pose) => {
        const spec = p.spec.rigs?.[name];
        if (spec === undefined) throw new Error(`scene ${p.spec.id} has no rig "${name}"`);
        const rig = standing.get(spec);
        if (rig === undefined)
          throw new Error(
            `scene ${p.spec.id}: rig "${name}" (${spec.key}) is not loaded: a film's rigs load with it, before its first frame (loadRigs)`,
          );
        const why = drawRig(ctx, spec, rig, pose);
        if (why !== undefined) throw new Error(`scene ${p.spec.id}: ${why}`);
      },
      hand: (key) => sceneHand(p.spec.id, key, boil),
      handsOf: (of) => {
        const id = drawnBy(of.draw, p.spec.id).spec.id;
        return (key) => sceneHand(id, key, boil);
      },
      knobsOf: <K extends Knobs>(of: KnobsOwner<K>) => {
        const q = drawnBy(of.draw, p.spec.id);
        const knobs = shownOf(q, edits).knobs;
        // The scene is the one `of` draws, so each name holds the kind `of` declares.
        return knobReader<K>(knobs, q.spec.id);
      },
      words,
      spoken: (from, to) => {
        const a = frame.mark(from);
        const b = to === undefined ? p.speechStart + p.voice.duration : frame.mark(to);
        // Progress by words heard, so the text keeps pace with the voice.
        const inside = words.filter((w) => heardAtOrAfter(w, a) && w.start < justBefore(b));
        if (inside.length === 0) return t >= b ? 1 : 0;
        let heard = 0;
        for (const w of inside) heard += clamp((t - w.start) / Math.max(0.05, w.end - w.start));
        return heard / inside.length;
      },
    };
    return frame;
  };

  const drawScene = (
    ctx: CanvasRenderingContext2D,
    p: Placed<SceneSpec>,
    T: number,
    boil: number,
    reads: Reads | undefined,
    edits: ReadonlyMap<string, ShownEdit> | undefined,
  ) => {
    // The reads made outside every camera and not yet framed by one: the next camera frames them.
    const unframed: number[] = [];
    const frameReads = (list: KnobRead[], inside: DOMMatrix, aimed: DOMMatrix) => {
      for (const i of unframed) {
        const read = list[i];
        if (read !== undefined)
          list[i] = { ...read, framed: affineOf(inside), aimed: affineOf(aimed) };
      }
      unframed.length = 0;
    };
    const frame = frameOf(ctx, p, T, boil, reads, edits, unframed);
    drawnFrame = frame;
    drawnBox = undefined;
    ctx.save();
    const heard =
      reads?.direct === true
        ? (inside: DOMMatrix, aimed: DOMMatrix) => frameReads(reads.list, inside, aimed)
        : undefined;
    const shot = hearingCameras(ctx, heard, breath, () => {
      drawnBox = p.spec.draw(frame);
    });
    ctx.restore();
    const light = p.spec.light;
    drawnFixed = !Predicate.isFunction(light);
    drawnLight = Predicate.isFunction(light) ? light(frame) : light;
    return shot;
  };

  /** The light the last scene drawn is lit by, read on its own frame (`SceneSpec.light`). */
  let drawnLight: Light | undefined;
  /** Whether that light is fixed, not read per frame. */
  let drawnFixed = true;
  /** The frame the last scene drawn was drawn on: what its card's flood reads. */
  let drawnFrame: Frame | undefined;
  /** The box that draw returned, reset before each draw: where its card's flood grows from on the same frame. */
  let drawnBox: Box | void;

  /** The breath each scene draw is given: one, rewritten per draw, never made per frame. */
  const breath: BreathNow = { through: 0, drift: DRIFT, outer: false, width, height };
  /** No breath: a card holds still. */
  const still: BreathNow = { through: 0, drift: 0, outer: false, width, height };

  /** Whether cue `name` of scene `p` (as `edits` show it) holds at film time `T`: from its start, up to its end. */
  const holds = (
    p: Placed<SceneSpec>,
    name: string,
    T: number,
    edits: ReadonlyMap<string, ShownEdit> | undefined,
  ) => {
    const c = shownOf(p, edits).cues.get(name);
    if (c === undefined) throw new Error(`scene ${p.spec.id} has no cue "${name}"`);
    const t = T - p.start;
    return t >= c.start && t < c.end;
  };

  /** Whether scene `p`'s card is the frame at `T`. */
  const carded = (
    p: Placed<SceneSpec>,
    T: number,
    edits: ReadonlyMap<string, ShownEdit> | undefined,
  ) => p.spec.card !== undefined && holds(p, p.spec.card.cue, T, edits);

  /** Scene `p`'s card on `ctx` as frame `f` draws it, probed as the scene's own text. */
  const drawCard = (
    ctx: CanvasRenderingContext2D,
    p: Placed<SceneSpec>,
    f: Frame,
    probe: Probe | undefined,
  ) => {
    const card = p.spec.card;
    if (card === undefined) return;
    const words = cards.get(p.spec.id) ?? [];
    ctx.save();
    probing(ctx, probe, () => hearingCameras(ctx, undefined, still, () => card.draw(f, words)));
    ctx.restore();
  };

  /**
   * Scene `p`'s card in place of its picture at `T`: on the film's paper
   * alone, opaque, so the frame is the same whatever was drawn on the canvas
   * before it (a look's card may paint a ground with alpha, or none); the
   * scene's picture, light and vignette are left off, so nothing dims or
   * tints it.
   */
  const cardFrame = (
    ctx: CanvasRenderingContext2D,
    p: Placed<SceneSpec>,
    T: number,
    boil: number,
    probe: Probe | undefined,
    reads: Reads | undefined,
    edits: ReadonlyMap<string, ShownEdit> | undefined,
  ) => {
    ctx.drawImage(getAssets().paper, 0, 0);
    drawCard(ctx, p, frameOf(ctx, p, T, boil, reads, edits, []), probe);
  };

  /**
   * Whether scene `p`'s card holds to its scene's end (as `edits` show it):
   * the card is then what the scene leaves on screen, so a transition out of
   * it carries the card, never the picture under it.
   */
  const cardToEnd = (p: Placed<SceneSpec>, edits: ReadonlyMap<string, ShownEdit> | undefined) => {
    const card = p.spec.card;
    if (card === undefined) return false;
    const c = shownOf(p, edits).cues.get(card.cue);
    return c !== undefined && p.dur - c.end <= CLOCK_EPSILON;
  };

  /** Scene `p`'s card at `T` into a layer, on the film's paper: the outgoing side of a transition out of a card. */
  const cardLayer = (
    target: Offscreen,
    p: Placed<SceneSpec>,
    T: number,
    boil: number,
    probe: Probe | undefined,
    reads: Reads | undefined,
    edits: ReadonlyMap<string, ShownEdit> | undefined,
  ) => {
    target.ctx.setTransform(1, 0, 0, 1, 0, 0);
    target.ctx.globalAlpha = 1;
    target.ctx.globalCompositeOperation = 'source-over';
    cardFrame(target.ctx, p, T, boil, probe, reads, edits);
    return target.c;
  };

  /**
   * Scene `p`'s card flooding in over its lit frame at `T`, when its flood's
   * cue holds: grown from the highlight's box toward the whole frame.
   */
  const floodOver = (
    ctx: CanvasRenderingContext2D,
    p: Placed<SceneSpec>,
    T: number,
    boil: number,
    probe: Probe | undefined,
    reads: Reads | undefined,
    edits: ReadonlyMap<string, ShownEdit> | undefined,
  ) => {
    const flood = p.spec.card?.flood;
    const f = drawnFrame;
    if (flood === undefined || f === undefined || !holds(p, flood.cue, T, edits)) return;
    const from = drawnBox;
    if (from === undefined)
      throw new Error(
        `scene ${p.spec.id}: its card floods in over "${flood.cue}", but its draw returned no box to flood from`,
      );
    // The box is in the canvas's own pixels (`verse` gives it so, through the
    // transform it drew under), so the clip is laid with none, whatever scale
    // the frame is drawn at, and the card drawn under the frame's.
    const frame = ctx.getTransform();
    const at = f.at(flood.cue);
    const box = floodBox(from, ctx.canvas.width, ctx.canvas.height, at);
    const mask = flood.mask;
    if (mask !== undefined) {
      // The look's own edge: the card on a layer of its own, kept where the look paints.
      const { b } = getAssets();
      b.ctx.setTransform(1, 0, 0, 1, 0, 0);
      b.ctx.globalAlpha = 1;
      b.ctx.globalCompositeOperation = 'source-over';
      b.ctx.clearRect(0, 0, width, height);
      b.ctx.setTransform(frame);
      drawCard(b.ctx, p, frameOf(b.ctx, p, T, boil, reads, edits, []), probe);
      b.ctx.setTransform(1, 0, 0, 1, 0, 0);
      b.ctx.globalCompositeOperation = 'destination-in';
      mask(b.ctx, box, at, f);
      b.ctx.globalCompositeOperation = 'source-over';
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(b.c, 0, 0);
      ctx.restore();
      return;
    }
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.beginPath();
    ctx.rect(box.x, box.y, box.w, box.h);
    ctx.clip();
    ctx.setTransform(frame);
    drawCard(ctx, p, f, probe);
    ctx.restore();
  };

  /**
   * Scenes whose last frame framed no shot of their own: the first guess for
   * their next. It only saves a draw, never decides a pixel (`sheet`).
   */
  const unshot = new Set<string>();

  /**
   * Paper, then one scene over it, breathing once (`SceneBreath`): through its
   * outermost shot when it frames one, around its whole draw when it frames
   * none. Which it is shows only once it has drawn, so the frame is drawn on
   * the scene's last answer and, where that was wrong (a scene that frames a
   * shot in one part and none in another, or a first frame), drawn again from
   * the paper the other way, the knobs and probe of the first draw let go.
   * The pixels are the right draw's alone, whatever was drawn before.
   */
  const sheet = (
    ctx: CanvasRenderingContext2D,
    p: Placed<SceneSpec>,
    T: number,
    boil: number,
    probe: Probe | undefined,
    reads: Reads | undefined,
    edits: ReadonlyMap<string, ShownEdit> | undefined,
  ) => {
    const { paper } = getAssets();
    const id = p.spec.id;
    breath.through = p.dur > 0 ? (T - p.start) / p.dur : 0;
    breath.drift = drifts.get(id) ?? DRIFT;
    const moving = p.spec.storyboard !== true && breathes(breath);
    breath.outer = moving && unshot.has(id);
    const sink = probe?.sink;
    markSink(sink);
    const read = reads?.list.length ?? 0;
    ctx.drawImage(paper, 0, 0);
    let shot = false;
    probing(ctx, probe, () => {
      shot = drawScene(ctx, p, T, boil, reads, edits);
    });
    // Guessed whole but it framed a shot, or guessed a shot and it framed none: draw it the other way.
    if (moving && shot === breath.outer) {
      rewindSink(sink);
      if (reads !== undefined) reads.list.length = read;
      breath.outer = !shot;
      ctx.drawImage(paper, 0, 0);
      probing(ctx, probe, () => drawScene(ctx, p, T, boil, reads, edits));
    }
    if (moving && shot) unshot.delete(id);
    else if (moving) unshot.add(id);
  };

  /** Paper plus one scene, lit by its light, into a layer (light is no ink: outside the probe). */
  const layer = (
    target: Offscreen,
    p: Placed<SceneSpec>,
    T: number,
    boil: number,
    probe: Probe | undefined,
    reads: Reads | undefined,
    edits: ReadonlyMap<string, ShownEdit> | undefined,
  ) => {
    target.ctx.setTransform(1, 0, 0, 1, 0, 0);
    target.ctx.globalAlpha = 1;
    target.ctx.globalCompositeOperation = 'source-over';
    sheet(target.ctx, p, T, boil, probe, reads, edits);
    if (drawnLight !== undefined) lightUp(target.ctx, drawnLight);
    return target.c;
  };

  /** The finish over a drawn frame: the light spilling (bloom), then the grade, under the grain. */
  const finishFrame = (ctx: CanvasRenderingContext2D, boil: number) => {
    const sheets = getAssets().bloom;
    if (finish.bloom !== undefined && sheets !== undefined)
      bloom(ctx, sheets, finish.bloom, width, height);
    if (graded !== undefined) grade(ctx, graded, width, height);
    grain(ctx, getAssets().grain, boil, width, height, finish.grain);
  };

  /** Scene `cur`'s caption at scene time `local`, when the film captions, probed as a caption. */
  const captionOver = (
    ctx: CanvasRenderingContext2D,
    cur: Placed<SceneSpec>,
    local: number,
    voice: Probe | undefined,
  ) => {
    if (captions === undefined) return;
    const style = captions;
    probing(ctx, voice === undefined ? undefined : { ...voice, caption: true }, () =>
      caption(ctx, captionsOf?.get(cur) ?? [], local - cur.speechStart, width, height, style),
    );
  };

  /**
   * A transition's two layers onto `ctx` at progress `p`: the incoming one
   * fading in over, panning in beside (`dx` across, `dir` its way), or wiped
   * in over the outgoing one.
   */
  const composite = (
    ctx: CanvasRenderingContext2D,
    enter: Exclude<Transition, { readonly kind: 'cut' }>,
    out: HTMLCanvasElement,
    inn: HTMLCanvasElement,
    p: number,
    dx: number,
    dir: number,
  ) => {
    switch (enter.kind) {
      case 'fade':
        ctx.drawImage(out, 0, 0);
        ctx.globalAlpha = p;
        ctx.drawImage(inn, 0, 0);
        break;
      case 'pan':
        ctx.drawImage(out, dx, 0);
        ctx.drawImage(inn, dx + dir * width, 0);
        break;
      case 'ink':
        ctx.drawImage(out, 0, 0);
        inkWipe(ctx, inn, p, width, height, enter.color ?? spec.shade);
        break;
    }
  };

  const render = (ctx: CanvasRenderingContext2D, T: number, opts: RenderOptions = {}) => {
    const { a, b } = getAssets();
    const boil = boilTick(T);
    const cur = sceneAt(T);
    const prev = placed[cur.index - 1];
    const enter = cur.spec.enter;
    const tr = transitionDur(enter);
    const local = T - cur.start;
    const sink = opts.probe;
    const knobs = opts.knobs;
    const edits = opts.edits;
    /** Knob reads straight onto the frame, or from a transition's layer. */
    const reads = (direct: boolean): Reads | undefined =>
      knobs === undefined ? undefined : { list: knobs, direct };
    /** A probe for what one scene draws, landing `dx` across and composited at `alpha`. */
    const probe = (p: Placed<SceneSpec>, dx: number, alpha: number): Probe | undefined =>
      sink === undefined ? undefined : { sink, scene: p.spec.id, dx, alpha };
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    const isCard = carded(cur, T, edits);
    if (isCard) {
      // A full-screen card: the frame is the card alone, cut to and from.
      cardFrame(ctx, cur, T, boil, probe(cur, 0, 1), reads(true), edits);
    } else if (prev === undefined || enter === undefined || enter.kind === 'cut' || local >= tr) {
      sheet(ctx, cur, T, boil, probe(cur, 0, 1), reads(true), edits);
      // The scene's light over its page and all on it, with the vignette.
      lightAndVignette(ctx, drawnLight, drawnFixed);
      floodOver(ctx, cur, T, boil, probe(cur, 0, 1), reads(true), edits);
    } else {
      const p = ease.inOutCubic(clamp(local / tr));
      // The incoming sheet covers the outgoing one as it arrives.
      const dir = enter.kind === 'pan' ? (enter.dir ?? 1) : 1;
      const dx = enter.kind === 'pan' ? -dir * p * width : 0;
      const fading = enter.kind === 'pan' ? 0 : 1;
      // A card held to its scene's end leaves as the card, not the picture under it.
      const leavesCard = cardToEnd(prev, edits);
      const outgoing = leavesCard ? cardLayer : layer;
      const out = outgoing(a, prev, T, boil, probe(prev, dx, 1 - fading * p), reads(false), edits);
      // A card takes no vignette; a scene its light's share of it (read as its layer is drawn).
      const from = leavesCard ? 0 : vignetteOf(drawnLight);
      const inn = layer(
        b,
        cur,
        T,
        boil,
        probe(cur, enter.kind === 'pan' ? dx + dir * width : 0, 1 - fading * (1 - p)),
        reads(false),
        edits,
      );
      composite(ctx, enter, out, inn, p, dx, dir);
      const to = vignetteOf(drawnLight);
      transitionVignette(ctx, enter.kind === 'pan', p, from, to, dx, dx + dir * width);
    }

    finishFrame(ctx, boil);
    // No caption over a card: the card is the words (CRAFT rule 1), set as they are
    // said; the caption track (`.vtt`) keeps the line.
    if (opts.captions === true && !isCard) captionOver(ctx, cur, local, probe(cur, 0, 1));
    ctx.restore();
  };

  return {
    title: spec.title,
    width,
    height,
    fps,
    duration,
    placed,
    audio: allRecorded ? spec.audio : undefined,
    sound: spec.sound,
    palette: spec.palette ?? {},
    allRecorded,
    look: { paper: spec.paper, shade: spec.shade, finish, short },
    sceneAt,
    render,
    edit,
    rigs,
  };
};

/**
 * The incoming layer, revealed behind a ragged diagonal brush edge, with a
 * band of wet ink riding the edge.
 */
const inkWipe = (
  ctx: CanvasRenderingContext2D,
  layer: HTMLCanvasElement,
  p: number,
  w: number,
  h: number,
  color: string,
) => {
  const span = w + h * 0.6 + 400;
  const edge = -200 + p * span;
  const ragged = (y: number, off: number) =>
    edge - (y / h) * h * 0.6 + off + Math.sin(y * 0.021 + off) * 18 + Math.sin(y * 0.063) * 9;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(-10, -10);
  for (let y = -10; y <= h + 10; y += 20) ctx.lineTo(ragged(y, 0), y);
  ctx.lineTo(-10, h + 10);
  ctx.closePath();
  ctx.clip();
  ctx.drawImage(layer, 0, 0);
  ctx.restore();
  // The brush band itself.
  ctx.save();
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.9 * Math.sin(Math.PI * p);
  ctx.beginPath();
  for (let y = -10; y <= h + 10; y += 20) ctx.lineTo(ragged(y, 0), y);
  for (let y = h + 10; y >= -10; y -= 20) ctx.lineTo(ragged(y, 140 + Math.sin(y * 0.013) * 40), y);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
};

/** The caption of `cues` spoken at `t` (speech-relative) on its plate, if one is. */
const caption = (
  ctx: CanvasRenderingContext2D,
  cues: ReadonlyArray<CaptionCue>,
  t: number,
  w: number,
  h: number,
  style: Required<CaptionStyle>,
) => {
  const line = cues.find((c) => t >= c.start && t < c.end);
  if (line === undefined) return;
  const text = line.text;
  ctx.save();
  ctx.font = style.font;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const tw = ctx.measureText(text).width;
  const y = h - style.bottom;
  const left = w / 2 - tw / 2 - style.platePadding;
  const top = y - style.plateHeight / 2;
  const pw = tw + 2 * style.platePadding;
  ctx.globalAlpha = style.plateOpacity;
  ctx.fillStyle = style.plate;
  ctx.beginPath();
  ctx.roundRect(left, top, pw, style.plateHeight, style.plateRadius);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.fillStyle = style.color;
  ctx.fillText(text, w / 2, y + 1);
  // The plate hides whatever is under it, so the check measures the plate.
  const probe = probeOf(ctx);
  if (probe !== undefined) {
    recordPlate(ctx, probe, left, top, pw, style.plateHeight, style.plateOpacity);
    recordText(ctx, probe, text, left, top, pw, style.plateHeight, style.plateOpacity);
  }
  ctx.restore();
};
