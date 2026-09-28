// A film is an ordered list of scenes. Each scene owns its narration and its
// drawing; the film lays them end to end, sizes each to its voice, and draws
// any instant T — the same function serves the preview player and the export.

import { Predicate, Schema } from 'effect';
import { BOIL_FPS, type Hand } from './ink.ts';
import type { Affine } from '../core/affine.ts';
import { captionCues } from '../core/captions.ts';
import {
  type Placed,
  everyTakeRecorded,
  layout,
  sceneClock,
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
  makePaper,
  makeVignette,
  offscreen,
  shadeBy,
} from './paper.ts';
import { type Probe, type ProbeSink, probeOf, probing, recordPlate, recordText } from './probe.ts';
import { seedOf } from '../core/random.ts';
import { type Key, clamp, ease } from '../core/time.ts';

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
}

export interface SceneSpec extends Timed {
  readonly draw: (f: Frame) => void;
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
  d: Omit<SceneSpec, 'id' | 'say' | 'timeline' | 'knobs' | 'draw'> & {
    readonly timeline: T & Closed<T>;
    readonly knobs?: K;
    readonly draw: (f: Frame<keyof T & string, K>) => void;
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
  /** How strongly the film grain overlays the frame, 0..1. Defaults to 0.09. */
  grain: Schema.optionalKey(Unit),
  /** A grain tile's side in whole px, at least 1. Defaults to 256. */
  grainSize: Schema.optionalKey(Count),
  /** How many grain tiles cycle on the boil tick, at least 1. Defaults to 6. */
  grainTiles: Schema.optionalKey(Count),
});
export type FinishStyle = typeof FinishStyle.Type;

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
}

/** Where a frame records the knobs it read, for the lab (`RenderOptions.knobs`). */
interface Reads {
  readonly list: KnobRead[];
  /** Read straight onto the frame, not into a transition's layer. */
  readonly direct: boolean;
}

/** A scene's timeline or knobs, standing in for its drawing's while the lab previews an edit. */
export interface SceneEdit {
  readonly timeline?: Timeline;
  readonly knobs?: Knobs;
}

export interface RenderOptions {
  readonly captions?: boolean;
  /**
   * Draw `scene` with this edit's timeline and knobs for this frame only, in
   * place of its drawing's and any preview (the lab's compare with HEAD).
   */
  readonly edit?: { readonly scene: string; readonly edit: SceneEdit };
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
  sceneAt(T: number): Placed<SceneSpec>;
  render(ctx: CanvasRenderingContext2D, T: number, opts?: RenderOptions): void;
  /**
   * Draw `scene` with `edit`'s timeline and knobs in place of its drawing's
   * (resolved on the scene's own clock, as `layout()` resolves them) until
   * called again with `undefined`. The lab's live preview of a drag; nothing
   * is written. Returns the scene's cues as they now resolve.
   */
  preview(scene: string, edit: SceneEdit | undefined): ReadonlyMap<string, ResolvedCue>;
  /** A scene's cues as the frame draws them: previewed, or as laid out. */
  cuesOf(scene: string): ReadonlyMap<string, ResolvedCue>;
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
    grain: f.grain ?? 0.09,
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

export const createFilm = (spec: FilmSpec): Film => {
  const width = spec.width ?? 1920;
  const height = spec.height ?? 1080;
  const fps = spec.fps ?? 30;
  const placed = layout(spec.scenes, spec.timings);
  const last = placed[placed.length - 1];
  const duration = last === undefined ? 0 : last.start + last.dur;
  const allRecorded = everyTakeRecorded(placed);
  const finish = finishOf(spec.finish);
  const captions = spec.captions === undefined ? undefined : captionOf(spec.captions);

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

  const sceneAt = (T: number): Placed<SceneSpec> => {
    for (let i = placed.length - 1; i >= 0; i--) {
      const p = placed[i];
      if (p !== undefined && T >= p.start) return p;
    }
    const first = placed[0];
    if (first === undefined) throw new Error('film has no scenes');
    return first;
  };

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
    cues: edit.timeline === undefined ? p.cues : resolveTimeline(edit.timeline, sceneClock(p)),
    knobs: edit.knobs === undefined ? p.knobs : new Map(Object.entries(edit.knobs)),
  });

  /** The lab's previewed cues and knobs, by scene. */
  const previews = new Map<string, Shown>();

  const preview = (scene: string, edit: SceneEdit | undefined) => {
    const p = placedOf(scene);
    if (edit === undefined) {
      previews.delete(scene);
      return p.cues;
    }
    const shown = resolveEdit(p, edit);
    previews.set(scene, shown);
    return shown.cues;
  };

  const cuesOf = (scene: string) => previews.get(scene)?.cues ?? placedOf(scene).cues;

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
    override: { readonly scene: string; readonly shown: Shown } | undefined,
  ) => {
    const t = T - p.start;
    const words = localWords.get(p) ?? [];
    const shown = override?.scene === p.spec.id ? override.shown : (previews.get(p.spec.id) ?? p);
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
        reads?.list.push({
          scene: p.spec.id,
          name,
          value: k,
          transform: reads.direct ? affineOf(ctx.getTransform()) : undefined,
        });
        return k;
      },
      hand: (key) => ({
        boil,
        seed: Predicate.isNumber(key) ? key : seedOf(`${p.spec.id}:${key}`),
      }),
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
    p.spec.draw(frame);
    ctx.restore();
  };

  /** Paper plus one scene, into a layer. */
  const layer = (
    target: Offscreen,
    p: Placed<SceneSpec>,
    T: number,
    boil: number,
    probe: Probe | undefined,
    reads: Reads | undefined,
    override: { readonly scene: string; readonly shown: Shown } | undefined,
  ) => {
    const { paper } = getAssets();
    target.ctx.setTransform(1, 0, 0, 1, 0, 0);
    target.ctx.globalAlpha = 1;
    target.ctx.globalCompositeOperation = 'source-over';
    target.ctx.drawImage(paper, 0, 0);
    probing(target.ctx, probe, () => drawScene(target.ctx, p, T, boil, reads, override));
    return target.c;
  };

  const render = (ctx: CanvasRenderingContext2D, T: number, opts: RenderOptions = {}) => {
    const { paper, a, b } = getAssets();
    const boil = Math.floor(T * BOIL_FPS + 1e-6);
    const cur = sceneAt(T);
    const prev = placed[cur.index - 1];
    const enter = cur.spec.enter;
    const tr = transitionDur(enter);
    const local = T - cur.start;
    const sink = opts.probe;
    const knobs = opts.knobs;
    const edited = opts.edit;
    const override =
      edited === undefined
        ? undefined
        : { scene: edited.scene, shown: resolveEdit(placedOf(edited.scene), edited.edit) };
    /** Knob reads straight onto the frame, or from a transition's layer. */
    const reads = (direct: boolean): Reads | undefined =>
      knobs === undefined ? undefined : { list: knobs, direct };
    /** A probe for what one scene draws, landing `dx` across and composited at `alpha`. */
    const probe = (p: Placed<SceneSpec>, dx: number, alpha: number): Probe | undefined =>
      sink === undefined ? undefined : { sink, scene: p.spec.id, dx, alpha };
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    if (prev === undefined || enter === undefined || enter.kind === 'cut' || local >= tr) {
      ctx.drawImage(paper, 0, 0);
      probing(ctx, probe(cur, 0, 1), () => drawScene(ctx, cur, T, boil, reads(true), override));
    } else {
      const p = ease.inOutCubic(clamp(local / tr));
      // The incoming sheet covers the outgoing one as it arrives.
      const dir = enter.kind === 'pan' ? (enter.dir ?? 1) : 1;
      const dx = enter.kind === 'pan' ? -dir * p * width : 0;
      const fading = enter.kind === 'pan' ? 0 : 1;
      const out = layer(a, prev, T, boil, probe(prev, dx, 1 - fading * p), reads(false), override);
      const inn = layer(
        b,
        cur,
        T,
        boil,
        probe(cur, enter.kind === 'pan' ? dx + dir * width : 0, 1 - fading * (1 - p)),
        reads(false),
        override,
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
    }

    shadeBy(ctx, getAssets().vignette);
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
    sceneAt,
    render,
    preview,
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
  const line = captionCues(p.voice.words, p.voice.turns).find((c) => t >= c.start && t < c.end);
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
