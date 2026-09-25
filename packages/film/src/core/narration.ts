// Narration drives the clock. A scene's length is its spoken line plus
// breathing room, and animation cues are named marks inside the text:
//
//   "God's word {speak}speaks, and what it says {is}is."
//
// `{speak}` resolves to the moment the next word is spoken — measured from the
// recorded voice when timings exist, estimated from the text when they don't.
// Pure: runs in the browser, in scripts, and in tests.

import { Schema } from 'effect';
import { type Timings, type Voice, VoiceKey, type Word } from './schema.ts';

export interface Parsed {
  /** Text as spoken, marks removed. */
  readonly spoken: string;
  /** Mark name → index of the word it precedes. */
  readonly marks: ReadonlyMap<string, number>;
}

const MARK = /\{([a-zA-Z0-9_-]+)\}/g;

export const parse = (text: string): Parsed => {
  const marks = new Map<string, number>();
  const words: string[] = [];
  for (const token of text.trim().split(/\s+/)) {
    let rest = token;
    let m: RegExpExecArray | null;
    MARK.lastIndex = 0;
    while ((m = MARK.exec(token)) !== null) {
      const name = m[1];
      if (name === undefined) continue;
      if (marks.has(name)) throw new Error(`duplicate mark {${name}} in: ${text}`);
      marks.set(name, words.length);
    }
    rest = rest.replace(MARK, '');
    if (rest.length > 0) words.push(rest);
  }
  return { spoken: words.join(' '), marks };
};

export const hashText = (s: string): string => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0).toString(16).padStart(8, '0');
};

/** The voice part of `timings.json`: a take recorded under another key is stale. */
export const voiceKey = (voice: Voice): string =>
  `${voice.voiceId}/${voice.model}/${Schema.encodeSync(VoiceKey)(voice.settings)}`;

/**
 * Words with estimated times: ~2.7 words/s, longer words take longer, and
 * punctuation adds a pause. Close enough to lay out a cut before recording.
 */
export const estimate = (spoken: string): Word[] => {
  const out: Word[] = [];
  let t = 0;
  for (const w of spoken.split(/\s+/).filter((x) => x.length > 0)) {
    const letters = w.replace(/[^\p{L}\p{N}]/gu, '').length;
    const dur = 0.16 + letters * 0.045;
    out.push({ text: w, start: t, end: t + dur });
    t += dur + 0.05;
    if (/[.!?]["”’)]*$/.test(w)) t += 0.45;
    else if (/[,;:—–]["”’)]*$/.test(w)) t += 0.22;
  }
  return out;
};

/**
 * Words as spoken in a recorded take. ElevenLabs aligns characters; group them
 * back into the words of `spoken`.
 */
export const wordsFromAlignment = (
  spoken: string,
  chars: ReadonlyArray<string>,
  starts: ReadonlyArray<number>,
  ends: ReadonlyArray<number>,
): Word[] => {
  const out: Word[] = [];
  let start = -1;
  let end = 0;
  let text = '';
  const flush = () => {
    if (text.length > 0) out.push({ text, start, end });
    text = '';
    start = -1;
  };
  for (let i = 0; i < chars.length; i++) {
    const c = chars[i] ?? '';
    if (/\s/.test(c)) {
      flush();
      continue;
    }
    if (start < 0) start = starts[i] ?? 0;
    end = ends[i] ?? end;
    text += c;
  }
  flush();
  const expected = spoken.split(/\s+/).filter((x) => x.length > 0).length;
  if (out.length !== expected)
    throw new Error(`alignment has ${out.length} words, text has ${expected}`);
  return out;
};

export interface SceneVoice {
  readonly spoken: string;
  readonly words: ReadonlyArray<Word>;
  /** Seconds of speech (0 for a silent scene). */
  readonly duration: number;
  readonly marks: ReadonlyMap<string, number>;
  /** Audio file, when a current recording exists. */
  readonly file: string | undefined;
  readonly recorded: boolean;
}

/** The voice for one scene: recorded when the take matches the text, estimated otherwise. */
export const voiceFor = (id: string, text: string, timings: Timings | undefined): SceneVoice => {
  const { spoken, marks } = parse(text);
  if (spoken.length === 0)
    return { spoken, words: [], duration: 0, marks: new Map(), file: undefined, recorded: false };
  const take = timings?.scenes[id];
  const recorded = take !== undefined && take.hash === hashText(spoken);
  const words = recorded ? take.words : estimate(spoken);
  const duration = recorded ? take.duration : (words[words.length - 1]?.end ?? 0);
  const times = new Map<string, number>();
  for (const [name, index] of marks) {
    const w = words[index] ?? words[words.length - 1];
    times.set(name, index >= words.length ? duration : (w?.start ?? 0));
  }
  return {
    spoken,
    words,
    duration,
    marks: times,
    file: recorded ? take.file : undefined,
    recorded,
  };
};
