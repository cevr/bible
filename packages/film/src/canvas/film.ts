// A film is an ordered list of scenes. Each scene owns its narration and its
// drawing; the film lays them end to end, sizes each to its voice, and draws
// any instant T — the same function serves the preview player and the export.

import { Predicate, Result, Schema } from 'effect';
import { BOIL_FPS, type Hand } from './ink.ts';
import { DRIFT, type Drift, breathes, hearingCameras, insideCamera } from './camera.ts';
import type { Affine } from '../core/affine.ts';
import { sceneCaptions } from '../core/captions.ts';
import {
  type Placed,
  everyTakeRecorded,
  filmEnd,
  layout,
  sceneClock,
  sceneIndexAt,
  transitionDur,
} from '../core/layout.ts';
import type {
  Knob,
  Knobs,
  ResolvedCue,
  Point,
  Sound,
  Span,
  Timed,
  Timeline,
  Timings,
  Word,
} from '../core/schema.ts';
import { cueKeys, cueProgress, resolveTimeline, staggerProgress } from '../core/timeline.ts';
import {
  type Grain,
  type Offscreen,
  type PaperStyle,
  grain,
  makeGrain,
  makeLight,
  makePaper,
  makeProduct,
  makeVignette,
  offscreen,
  shadeBy,
} from './paper.ts';
import { type Probe, type ProbeSink, probeOf, probing, recordPlate, recordText } from './probe.ts';
import { seedOf } from '../core/random.ts';
import { FILM_FPS, type Key, clamp, ease } from '../core/time.ts';

/** What `f.knob` returns for a knob declared as `V`: a number stays a number, a point a point. */
export type KnobValue<V extends Knob> = V extends number ? number : Point;

/**
 * One instant of one scene. `C` names the scene's cues and `K` its knobs, when
 * its drawing declares them.
 */
export interface Frame<C extends string = string, K extends Knobs = Knobs> {
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
  /** A knob the drawing declares (`knobs: { handY: 800 }`): a number or a point. */
  knob<N extends keyof K & string>(name: N): KnobValue<K[N]>;
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
   * scene's paper torn as it was, not a new sheet. Throws, naming it, for a
   * scene the film lacks.
   */
  handsOf(scene: string): (key: string | number) => Hand;
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
export interface KnobsOwner<K extends Knobs> {
  readonly draw: (f: never) => void;
  readonly knobs?: K;
}

/** Reads a scene's knobs by name, typed as that drawing declares them. */
export type KnobReader<K extends Knobs> = <N extends keyof K & string>(name: N) => KnobValue<K[N]>;

/** The hand scene `scene` gives `key` on boil tick `boil`: what `f.hand` and `f.handsOf` both give. */
const sceneHand = (scene: string, key: string | number, boil: number): Hand => ({
  boil,
  seed: Predicate.isNumber(key) ? key : seedOf(`${scene}:${key}`),
});

export interface SceneSpec extends Timed {
  readonly draw: (f: Frame) => void;
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
  readonly color: string;
  readonly edge?: string;
  readonly amount?: number;
}

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
 * Declare a drawing with a timeline and knobs, so `after` and `with` in the
 * timeline, `f.cue` and `f.at` in `draw` accept only the cue names it
 * declares, and `f.knob` only its knob names, typed as declared. An identity:
 * the result is an ordinary scene drawing.
 */
export const drawing = <const T extends Timeline, const K extends Knobs = NoKnobs>(
  d: Omit<SceneSpec, 'id' | 'say' | 'timeline' | 'knobs' | 'draw' | 'light'> & {
    readonly timeline: T & Closed<T>;
    readonly knobs?: K;
    readonly draw: (f: Frame<keyof T & string, K>) => void;
    readonly light?: Light | ((f: Frame<keyof T & string, K>) => Light);
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
export const ShortStyle = Schema.Struct({
  hook: Schema.optionalKey(Schema.Struct({ font: Font, color: Schema.String })),
  caption: Schema.optionalKey(
    Schema.Struct({
      font: Font,
      color: Schema.String,
      highlight: Schema.optionalKey(Schema.String),
    }),
  ),
});
export type ShortStyle = typeof ShortStyle.Type;

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

/** A scene's timeline or knobs, standing in for its drawing's in a frame the lab draws with it. */
export interface SceneEdit {
  readonly timeline?: Timeline;
  readonly knobs?: Knobs;
}

export interface RenderOptions {
  readonly captions?: boolean;
  /**
   * Draw each scene named here with its edit's timeline and knobs in place of
   * its drawing's, for this frame only (resolved on the scene's own clock, as
   * `layout()` resolves them): the lab's live preview of a drag, and its
   * compare with HEAD. Nothing is kept: the next frame draws what it is given.
   */
  readonly edits?: ReadonlyMap<string, SceneEdit>;
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
  render(ctx: CanvasRenderingContext2D, T: number, opts?: RenderOptions): void;
  /**
   * A scene's cues as a frame draws them with `edit` (`RenderOptions.edits`),
   * or as laid out with none. Throws what `layout()` would for a timeline
   * that cannot resolve.
   */
  cuesOf(scene: string, edit?: SceneEdit): ReadonlyMap<string, ResolvedCue>;
}

/** A film's paper, shade and finish, every finish value at its default where it declares none. */
export interface FilmLook {
  readonly paper: PaperStyle;
  readonly shade: string;
  readonly finish: Required<FinishStyle>;
  readonly short: ShortLook;
}

const affineOf = (m: DOMMatrix): Affine => [m.a, m.b, m.c, m.d, m.e, m.f];

/**
 * A film's finish, checked (a `SchemaError` naming the field when the canvas
 * could not draw it), each value it leaves out at its default.
 */
const finishOf = (declared: FinishStyle = {}): Required<FinishStyle> => {
  const f = Schema.decodeSync(FinishStyle)(declared);
  return {
    vignette: f.vignette ?? 0.28,
    grain: f.grain ?? 0.03,
    grainSize: f.grainSize ?? 256,
    grainTiles: f.grainTiles ?? 6,
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

/** Keep `sheet` under `key`, letting go of the oldest past `SHEETS_KEPT`. */
const keep = (sheets: Map<string, HTMLCanvasElement>, key: string, sheet: HTMLCanvasElement) => {
  if (sheets.size >= SHEETS_KEPT) {
    const oldest = sheets.keys().next();
    if (oldest.done !== true) sheets.delete(oldest.value);
  }
  sheets.set(key, sheet);
};

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

  // Built lazily: the film must lay out where there is no DOM (tools, tests).
  let assets:
    | {
        paper: HTMLCanvasElement;
        grain: Grain;
        vignette: HTMLCanvasElement;
        a: Offscreen;
        b: Offscreen;
      }
    | undefined;
  const getAssets = () =>
    (assets ??= {
      paper: makePaper(width, height, spec.paper),
      grain: makeGrain(finish.grainSize, finish.grainTiles, spec.paper.seed + 99, width, height),
      vignette: makeVignette(width, height, spec.shade, finish.vignette),
      a: offscreen(width, height),
      b: offscreen(width, height),
    });

  /** Each light's sheet, by `color` and `edge` (`makeLight`), the fewest kept (`SHEETS_KEPT`). */
  const lights = new Map<string, HTMLCanvasElement>();
  const lightSheet = (light: Light) => {
    const edge = light.edge ?? light.color;
    const key = `${light.color} ${edge}`;
    const have = lights.get(key);
    if (have !== undefined) return have;
    const made = makeLight(width, height, light.color, edge);
    keep(lights, key, made);
    return made;
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
    keep(litVignettes, key, made);
    return made;
  };
  /**
   * The light and the vignette over a whole frame: one multiply by their
   * product for a fixed light, the two in turn for a light read per frame
   * (its amount moves, so a product would be a new sheet each frame).
   */
  const lightAndVignette = (
    ctx: CanvasRenderingContext2D,
    light: Light | undefined,
    fixed: boolean,
  ) => {
    const amount = clamp(light?.amount ?? 1);
    if (light === undefined || amount <= 0) shadeBy(ctx, getAssets().vignette);
    else if (fixed) shadeBy(ctx, litVignette(light, amount));
    else {
      lightUp(ctx, light);
      shadeBy(ctx, getAssets().vignette);
    }
  };

  /** The scene playing at `T`, as the layout attributes it (`sceneIndexAt`): no allocation, for every frame. */
  const sceneAt = (T: number): Placed<SceneSpec> => {
    const p = placed[sceneIndexAt(placed, T)];
    if (p === undefined) throw new Error('film has no scenes');
    return p;
  };

  /** The one scene `draw` draws, for `f.knobsOf`; `by` names the scene that asked. */
  const drawnBy = (draw: (f: never) => void, by: string) => {
    const found = placed.filter((q) => q.spec.draw === draw);
    const one = found[0];
    if (one === undefined || found.length > 1)
      throw new Error(
        `scene ${by}: f.knobsOf takes the drawing of one scene; ${found.length} scenes draw it (${found.map((q) => q.spec.id).join(', ')})`,
      );
    return one;
  };

  /** Every scene's id, for `f.handsOf`. */
  const ids = new Set(placed.map((p) => p.spec.id));

  const placedOf = (scene: string) => {
    const p = placed.find((x) => x.spec.id === scene);
    if (p === undefined) throw new Error(`film has no scene "${scene}"`);
    return p;
  };

  /** A scene's cues and knobs as a frame draws them. */
  interface Shown {
    readonly cues: ReadonlyMap<string, ResolvedCue>;
    readonly knobs: ReadonlyMap<string, Knob>;
  }

  /** An edit's timeline and knobs, resolved on the scene's own clock as `layout()` resolves them. */
  const resolveEdit = (p: Placed<SceneSpec>, edit: SceneEdit): Shown => ({
    cues:
      edit.timeline === undefined
        ? p.cues
        : Result.getOrThrow(resolveTimeline(edit.timeline, sceneClock(p))),
    knobs: edit.knobs === undefined ? p.knobs : new Map(Object.entries(edit.knobs)),
  });

  /**
   * Each edit as resolved for its scene: a frame keyed by the edit value it
   * was handed, so a drag's frames resolve its timeline once and a new edit
   * (a new value) resolves again. Nothing here is what the film shows; the
   * caller's edits are.
   */
  const resolved = new WeakMap<
    SceneEdit,
    { readonly p: Placed<SceneSpec>; readonly shown: Shown }
  >();
  const shownWith = (p: Placed<SceneSpec>, edit: SceneEdit): Shown => {
    const hit = resolved.get(edit);
    if (hit !== undefined && hit.p === p) return hit.shown;
    const shown = resolveEdit(p, edit);
    resolved.set(edit, { p, shown });
    return shown;
  };
  /** Scene `p` as `edits` show it: its edit's cues and knobs, or its own. */
  const shownOf = (p: Placed<SceneSpec>, edits: ReadonlyMap<string, SceneEdit> | undefined) => {
    const edit = edits?.get(p.spec.id);
    return edit === undefined ? p : shownWith(p, edit);
  };

  const cuesOf = (scene: string, edit?: SceneEdit) => {
    const p = placedOf(scene);
    return edit === undefined ? p.cues : shownWith(p, edit).cues;
  };

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

  const drawScene = (
    ctx: CanvasRenderingContext2D,
    p: Placed<SceneSpec>,
    T: number,
    boil: number,
    reads: Reads | undefined,
    edits: ReadonlyMap<string, SceneEdit> | undefined,
  ) => {
    const t = T - p.start;
    const words = localWords.get(p) ?? [];
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
      hand: (key) => sceneHand(p.spec.id, key, boil),
      handsOf: (scene) => {
        if (!ids.has(scene))
          throw new Error(`scene ${p.spec.id}: film has no scene "${scene}" to take hands from`);
        return (key) => sceneHand(scene, key, boil);
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
        const inside = words.filter((w) => w.start >= a - 1e-3 && w.start < b - 1e-3);
        if (inside.length === 0) return t >= b ? 1 : 0;
        let heard = 0;
        for (const w of inside) heard += clamp((t - w.start) / Math.max(0.05, w.end - w.start));
        return heard / inside.length;
      },
    };
    ctx.save();
    const heard =
      reads?.direct === true
        ? (inside: DOMMatrix, aimed: DOMMatrix) => frameReads(reads.list, inside, aimed)
        : undefined;
    const shot = hearingCameras(ctx, heard, breath, () => p.spec.draw(frame));
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

  /** The breath each scene draw is given: one, rewritten per draw, never made per frame. */
  const breath: BreathNow = { through: 0, drift: DRIFT, outer: false, width, height };

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
    edits: ReadonlyMap<string, SceneEdit> | undefined,
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
    edits: ReadonlyMap<string, SceneEdit> | undefined,
  ) => {
    target.ctx.setTransform(1, 0, 0, 1, 0, 0);
    target.ctx.globalAlpha = 1;
    target.ctx.globalCompositeOperation = 'source-over';
    sheet(target.ctx, p, T, boil, probe, reads, edits);
    if (drawnLight !== undefined) lightUp(target.ctx, drawnLight);
    return target.c;
  };

  const render = (ctx: CanvasRenderingContext2D, T: number, opts: RenderOptions = {}) => {
    const { a, b } = getAssets();
    const boil = Math.floor(T * BOIL_FPS + 1e-6);
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

    if (prev === undefined || enter === undefined || enter.kind === 'cut' || local >= tr) {
      sheet(ctx, cur, T, boil, probe(cur, 0, 1), reads(true), edits);
      // The scene's light over its page and all on it, with the vignette.
      lightAndVignette(ctx, drawnLight, drawnFixed);
    } else {
      const p = ease.inOutCubic(clamp(local / tr));
      // The incoming sheet covers the outgoing one as it arrives.
      const dir = enter.kind === 'pan' ? (enter.dir ?? 1) : 1;
      const dx = enter.kind === 'pan' ? -dir * p * width : 0;
      const fading = enter.kind === 'pan' ? 0 : 1;
      const out = layer(a, prev, T, boil, probe(prev, dx, 1 - fading * p), reads(false), edits);
      const inn = layer(
        b,
        cur,
        T,
        boil,
        probe(cur, enter.kind === 'pan' ? dx + dir * width : 0, 1 - fading * (1 - p)),
        reads(false),
        edits,
      );
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
      shadeBy(ctx, getAssets().vignette);
    }

    grain(ctx, getAssets().grain, boil, width, height, finish.grain);
    if (opts.captions === true && captions !== undefined) {
      const style = captions;
      const voice = probe(cur, 0, 1);
      probing(ctx, voice === undefined ? undefined : { ...voice, caption: true }, () =>
        caption(ctx, cur, local, width, height, style),
      );
    }
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
    cuesOf,
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

const caption = (
  ctx: CanvasRenderingContext2D,
  p: Placed<SceneSpec>,
  local: number,
  w: number,
  h: number,
  style: Required<CaptionStyle>,
) => {
  const t = local - p.speechStart;
  const line = sceneCaptions(p).find((c) => t >= c.start && t < c.end);
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
