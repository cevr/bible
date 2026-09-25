// A film is an ordered list of scenes. Each scene owns its narration and its
// drawing; the film lays them end to end, sizes each to its voice, and draws
// any instant T — the same function serves the preview player and the export.

import { Predicate } from 'effect';
import type { Hand } from './ink.ts';
import { captionCues } from '../core/captions.ts';
import { type Placed, layout, transitionDur } from '../core/layout.ts';
import type { Timed, Timeline, Timings, Word } from '../core/schema.ts';
import type { ResolvedCue } from '../core/timeline.ts';
import { type PaperStyle, grain, makeGrain, makePaper, vignette } from './paper.ts';
import { seedOf } from '../core/random.ts';
import { type Ease, clamp, ease, progress } from '../core/time.ts';

export const BOIL_FPS = 12;

/** One instant of one scene. `C` names the scene's cues, when its drawing declares them. */
export interface Frame<C extends string = string> {
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
  /** 0→1 across a named cue, eased: `progress(t, cue.start, cue.dur, ease)`. */
  at(name: C, e?: Ease): number;
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

/**
 * Declare a drawing with a timeline, so `f.cue` and `f.at` accept only the cue
 * names it declares. An identity: the result is an ordinary scene drawing.
 */
export const drawing = <const T extends Timeline>(
  d: Omit<SceneSpec, 'id' | 'say' | 'timeline' | 'draw'> & {
    readonly timeline: T;
    readonly draw: (f: Frame<keyof T & string>) => void;
  },
) => d;

export interface CaptionStyle {
  readonly font: string;
  readonly color: string;
  readonly plate: string;
}

export interface FilmSpec {
  readonly title: string;
  readonly width?: number;
  readonly height?: number;
  readonly fps?: number;
  readonly paper: PaperStyle;
  readonly shade: string;
  readonly scenes: ReadonlyArray<SceneSpec>;
  readonly timings?: Timings;
  readonly captions?: CaptionStyle;
  /** Film-wide narration track, when every scene is recorded. */
  readonly audio?: string;
}

export interface RenderOptions {
  readonly captions?: boolean;
}

export interface Film {
  readonly title: string;
  readonly width: number;
  readonly height: number;
  readonly fps: number;
  readonly duration: number;
  readonly placed: ReadonlyArray<Placed<SceneSpec>>;
  readonly audio: string | undefined;
  readonly allRecorded: boolean;
  sceneAt(T: number): Placed<SceneSpec>;
  render(ctx: CanvasRenderingContext2D, T: number, opts?: RenderOptions): void;
}

const offscreen = (w: number, h: number) => {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  if (ctx === null) throw new Error('2d context unavailable');
  return { c, ctx };
};

export const createFilm = (spec: FilmSpec): Film => {
  const width = spec.width ?? 1920;
  const height = spec.height ?? 1080;
  const fps = spec.fps ?? 30;
  const placed = layout(spec.scenes, spec.timings);
  const last = placed[placed.length - 1];
  const duration = last === undefined ? 0 : last.start + last.dur;
  const allRecorded = placed.every((p) => p.voice.duration === 0 || p.voice.recorded);

  // Built lazily: the film must lay out where there is no DOM (tools, tests).
  let assets:
    | {
        paper: HTMLCanvasElement;
        grain: HTMLCanvasElement[];
        a: ReturnType<typeof offscreen>;
        b: ReturnType<typeof offscreen>;
      }
    | undefined;
  const getAssets = () =>
    (assets ??= {
      paper: makePaper(width, height, spec.paper),
      grain: makeGrain(256, 6, spec.paper.seed + 99),
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
  ) => {
    const t = T - p.start;
    const words = localWords.get(p) ?? [];
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
        const c = p.cues.get(name);
        if (c === undefined) throw new Error(`scene ${p.spec.id} has no cue "${name}"`);
        return c;
      },
      at: (name, e) => {
        const c = frame.cue(name);
        return progress(t, c.start, c.dur, e);
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
    target: ReturnType<typeof offscreen>,
    p: Placed<SceneSpec>,
    T: number,
    boil: number,
  ) => {
    const { paper } = getAssets();
    target.ctx.setTransform(1, 0, 0, 1, 0, 0);
    target.ctx.globalAlpha = 1;
    target.ctx.globalCompositeOperation = 'source-over';
    target.ctx.drawImage(paper, 0, 0);
    drawScene(target.ctx, p, T, boil);
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
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    if (prev === undefined || enter === undefined || enter.kind === 'cut' || local >= tr) {
      ctx.drawImage(paper, 0, 0);
      drawScene(ctx, cur, T, boil);
    } else {
      const p = ease.inOutCubic(clamp(local / tr));
      const out = layer(a, prev, T, boil);
      const inn = layer(b, cur, T, boil);
      switch (enter.kind) {
        case 'fade':
          ctx.drawImage(out, 0, 0);
          ctx.globalAlpha = p;
          ctx.drawImage(inn, 0, 0);
          break;
        case 'pan': {
          const dir = enter.dir ?? 1;
          const dx = -dir * p * width;
          ctx.drawImage(out, dx, 0);
          ctx.drawImage(inn, dx + dir * width, 0);
          break;
        }
        case 'ink':
          ctx.drawImage(out, 0, 0);
          inkWipe(ctx, inn, p, width, height, enter.color ?? spec.shade);
          break;
      }
    }

    vignette(ctx, width, height, spec.shade, 0.28);
    grain(ctx, getAssets().grain, boil, width, height, 0.09);
    if (opts.captions === true && spec.captions !== undefined)
      caption(ctx, cur, local, width, height, spec.captions);
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
    allRecorded,
    sceneAt,
    render,
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
  style: CaptionStyle,
) => {
  const t = local - p.speechStart;
  const line = captionCues(p.voice.words).find((c) => t >= c.start && t < c.end);
  if (line === undefined) return;
  const text = line.text;
  ctx.save();
  ctx.font = style.font;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const tw = ctx.measureText(text).width;
  const y = h - 86;
  ctx.globalAlpha = 0.82;
  ctx.fillStyle = style.plate;
  ctx.beginPath();
  ctx.roundRect(w / 2 - tw / 2 - 26, y - 30, tw + 52, 60, 12);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.fillStyle = style.color;
  ctx.fillText(text, w / 2, y + 1);
  ctx.restore();
};
