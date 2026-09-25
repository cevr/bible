// Sound: a film's music and effects, declared as data and placed on the same
// clock as the pictures. A music act starts at a scene; an effect fires at a
// scene's mark, so re-recording a line moves its sounds with it. Pure — the
// score and mix scripts read it without a DOM.

import type { Placed } from './film.ts';
import { hashText } from './narration.ts';

/** A moment on the film clock: a scene, then a mark in its narration, then an offset in seconds. */
export interface Cue {
  readonly scene: string;
  readonly mark?: string;
  readonly offset?: number;
}

/** One stretch of the score, from the start of `from` until the next act begins. */
export interface Act {
  readonly from: string;
  readonly name: string;
  readonly styles: ReadonlyArray<string>;
  readonly avoid?: ReadonlyArray<string>;
}

export interface Music {
  readonly model: 'music_v2' | 'music_v2_5';
  readonly styles: ReadonlyArray<string>;
  readonly avoid: ReadonlyArray<string>;
  readonly acts: ReadonlyArray<Act>;
  /** Linear gain of the bed before it ducks under the voice. */
  readonly gain: number;
}

export interface Effect {
  readonly prompt: string;
  readonly secs: number;
  /** Linear gain; 1 leaves the generated level alone. */
  readonly gain?: number;
  readonly at: ReadonlyArray<Cue>;
}

export interface Sound {
  readonly music?: Music;
  readonly effects: Readonly<Record<string, Effect>>;
}

/** The generated files, keyed so a changed request is known to be stale. */
export interface Asset {
  readonly hash: string;
  readonly file: string;
}

export interface SoundManifest {
  readonly music?: Asset;
  readonly effects: Readonly<Record<string, Asset>>;
}

/**
 * The ElevenLabs composition plan for the v2 music models: timed chunks, each
 * carrying its own styles. v2 always honours chunk durations, which is what
 * lets the score turn with the film.
 */
export interface Plan {
  readonly chunks: ReadonlyArray<{
    readonly text: string;
    readonly duration_ms: number;
    readonly positive_styles: ReadonlyArray<string>;
    readonly negative_styles: ReadonlyArray<string>;
    readonly context_adherence: 'high';
  }>;
}

/** The API refuses chunks shorter than this. */
const MIN_CHUNK_MS = 3000;

const sceneOf = (placed: ReadonlyArray<Placed>, id: string): Placed => {
  const p = placed.find((s) => s.spec.id === id);
  if (p === undefined) throw new Error(`sound: no scene "${id}"`);
  return p;
};

export const filmEnd = (placed: ReadonlyArray<Placed>): number => {
  const last = placed.at(-1);
  return last === undefined ? 0 : last.start + last.dur;
};

/** Absolute film time of a cue. */
export const cueTime = (cue: Cue, placed: ReadonlyArray<Placed>): number => {
  const p = sceneOf(placed, cue.scene);
  let t = p.start + (cue.offset ?? 0);
  if (cue.mark !== undefined) {
    const m = p.voice.marks.get(cue.mark);
    if (m === undefined) throw new Error(`sound: scene "${cue.scene}" has no mark "${cue.mark}"`);
    t += p.speechStart + m;
  }
  return t;
};

/**
 * The score's plan: each act lasts from its scene to the next act's scene, and
 * carries the film-wide styles ahead of its own. The act name is a structure
 * tag, never a lyric.
 */
export const musicPlan = (music: Music, placed: ReadonlyArray<Placed>): Plan => {
  const end = filmEnd(placed);
  const starts = music.acts.map((a, i) => (i === 0 ? 0 : sceneOf(placed, a.from).start));
  const bounds = [...starts, end].map((s) => Math.round(s * 1000));
  const chunks = music.acts.map((a, i) => {
    const ms = (bounds[i + 1] ?? 0) - (bounds[i] ?? 0);
    if (ms < MIN_CHUNK_MS)
      throw new Error(`sound: act "${a.name}" is ${ms}ms; acts must run in film order, 3s or more`);
    return {
      text: `[${a.name}]`,
      duration_ms: ms,
      positive_styles: [...music.styles, ...a.styles],
      negative_styles: [...music.avoid, ...(a.avoid ?? [])],
      context_adherence: 'high' as const,
    };
  });
  return { chunks };
};

export const musicKey = (music: Music, plan: Plan): string =>
  hashText(JSON.stringify({ model: music.model, plan }));

export const effectKey = (e: Effect): string =>
  hashText(JSON.stringify({ prompt: e.prompt, secs: e.secs }));
