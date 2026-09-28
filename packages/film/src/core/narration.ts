// Narration drives the clock. A scene's length is its spoken line plus
// breathing room, and animation cues are named marks inside the text:
//
//   "God's word {speak}speaks, and what it says {is}is."
//
// `{speak}` resolves to the moment the next word is spoken — measured from the
// recorded voice when timings exist, estimated from the text when they don't.
// A film read by a cast hands a line to another voice the same way:
//
//   "That's the law. {@ask}So where does that leave us? {@lead}Stuck."
//
// Pure: runs in the browser, in scripts, and in tests.

import { Array as Arr, Option, Result, Schema } from 'effect';
import { AlignmentMismatch, UnknownVoice } from './errors.ts';
import { fnv1a } from './random.ts';
import { type Timings, type Voice, VoiceKey, type Word, isCast } from './schema.ts';

/** Another voice takes the line: `{@name}` before a word. */
export interface Turn {
  /** The voice's name in the cast. */
  readonly voice: string;
  /** Index of the first word it reads. */
  readonly word: number;
}

export interface Parsed {
  /** Text as spoken, marks and turns removed. */
  readonly spoken: string;
  /** Mark name → index of the word it precedes. */
  readonly marks: ReadonlyMap<string, number>;
  /** Where the line changes voice, in order. */
  readonly turns: ReadonlyArray<Turn>;
}

/** `{name}` is a mark, `{@name}` a turn. */
const TOKEN = /\{(@?)([a-zA-Z0-9_-]+)\}/g;

export const parse = (text: string): Parsed => {
  const marks = new Map<string, number>();
  const turns: Turn[] = [];
  const words: string[] = [];
  for (const token of text.trim().split(/\s+/)) {
    for (const [, at, name] of token.matchAll(TOKEN)) {
      if (name === undefined) continue;
      if (at === '@') {
        if (Arr.last(turns).pipe(Option.exists((t) => t.word === words.length)))
          throw new Error(`two turns before one word in: ${text}`);
        turns.push({ voice: name, word: words.length });
        continue;
      }
      if (marks.has(name)) throw new Error(`duplicate mark {${name}} in: ${text}`);
      marks.set(name, words.length);
    }
    const rest = token.replace(TOKEN, '');
    if (rest.length > 0) words.push(rest);
  }
  if (Arr.last(turns).pipe(Option.exists((t) => t.word >= words.length)))
    throw new Error(`a turn with no words after it in: ${text}`);
  return { spoken: words.join(' '), marks, turns };
};

/**
 * What a take says and who says it: the spoken words, with each turn written
 * `{@name}` before its first word. A take is kept under this text's hash, so
 * moving a turn re-records the take; with no turns it is the spoken text.
 */
export const takeScript = (parsed: Parsed): string => {
  const turns = new Map(parsed.turns.map((t) => [t.word, t.voice]));
  if (turns.size === 0) return parsed.spoken;
  return parsed.spoken
    .split(' ')
    .map((word, i) => {
      const voice = turns.get(i);
      return voice === undefined ? word : `{@${voice}}${word}`;
    })
    .join(' ');
};

/** One voice's stretch of a take. */
export interface Line {
  /** Its voice's name in the cast; empty when one voice reads the film. */
  readonly name: string;
  readonly voiceId: string;
  readonly text: string;
}

/**
 * The lines a take is read in: the whole take for a film with one voice, and
 * for a cast, a line per turn, the first read by the cast's first voice. A
 * turn to a voice the film does not have fails with the voices it does.
 */
export const linesOf = (
  scene: string,
  parsed: Parsed,
  voice: Voice,
): Result.Result<ReadonlyArray<Line>, UnknownVoice> => {
  if (parsed.spoken.length === 0) return Result.succeed([]);
  if (!isCast(voice))
    return Arr.match(parsed.turns, {
      onEmpty: () => Result.succeed([{ name: '', voiceId: voice.voiceId, text: parsed.spoken }]),
      onNonEmpty: ([turn]) =>
        Result.fail(UnknownVoice.make({ scene, voice: turn.voice, known: [] })),
    });
  const known = voice.voices.map((v) => v.name);
  const words = parsed.spoken.split(' ');
  const lines: Array<Line> = [];
  let reader = Arr.headNonEmpty(voice.voices);
  let from = 0;
  const readTo = (to: number) => {
    if (to <= from) return;
    const text = words.slice(from, to).join(' ');
    const before = lines.at(-1);
    // A turn to the voice already reading continues its line.
    if (before !== undefined && before.name === reader.name)
      lines[lines.length - 1] = { ...before, text: `${before.text} ${text}` };
    else lines.push({ name: reader.name, voiceId: reader.voiceId, text });
    from = to;
  };
  for (const turn of parsed.turns) {
    const next = voice.voices.find((v) => v.name === turn.voice);
    if (next === undefined)
      return Result.fail(UnknownVoice.make({ scene, voice: turn.voice, known }));
    readTo(turn.word);
    reader = next;
  }
  readTo(words.length);
  return Result.succeed(lines);
};

/** A text's key for content-addressed assets: its FNV-1a as eight hex digits. */
export const hashText = (s: string): string => fnv1a(s).toString(16).padStart(8, '0');

/** The voice part of `timings.json`: a take recorded under another key is stale. */
export const voiceKey = (voice: Voice): string => {
  const settings = Schema.encodeSync(VoiceKey)(voice.settings);
  if (!isCast(voice)) return `${voice.voiceId}/${voice.model}/${settings}`;
  const voices = voice.voices.map((v) => `${v.name}=${v.voiceId}`).join(',');
  return `${voices}/${voice.model}/${settings}`;
};

/** Why a beat's take no longer fits it. */
export type StaleReason = 'missing' | 'text changed' | 'voice changed';

/**
 * Where a beat's take stands: current and read by a person (`Recorded`),
 * current and read by the staging voice (`Staging`), or `Stale`. A person's
 * take is read by no voice in the film, so a change of staging voice never
 * stales it; only a change of its words does. `recorded` says whether the
 * stale take was a person's, which staging must not replace unasked.
 */
export type TakeState =
  | { readonly _tag: 'Recorded' }
  | { readonly _tag: 'Staging' }
  | { readonly _tag: 'Stale'; readonly reason: StaleReason; readonly recorded: boolean };

/** The state of the take `timings` keep for beat `id`, whose take script is `script`, under `voice` (`voiceKey`). */
export const takeState = (
  id: string,
  script: string,
  timings: Timings,
  voice: string,
): TakeState => {
  const take = timings.scenes[id];
  if (take === undefined) return { _tag: 'Stale', reason: 'missing', recorded: false };
  const recorded = take.source === 'recorded';
  if (!recorded && timings.voice !== voice)
    return { _tag: 'Stale', reason: 'voice changed', recorded };
  if (take.hash !== hashText(script)) return { _tag: 'Stale', reason: 'text changed', recorded };
  if (recorded) return { _tag: 'Recorded' };
  return { _tag: 'Staging' };
};

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
 * Words only, as a take is checked against its script (`narrator`'s word
 * error): composed (NFC, so an accent is one letter however it was typed),
 * lower case, apostrophes dropped (`God’s` is `gods`), and every other mark a
 * break (`cover-up` is `cover`, `up`). Letters are any script's, accents kept.
 */
export const normalizeWords = (s: string): ReadonlyArray<string> =>
  s
    .normalize('NFC')
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 0);

/**
 * Whether a spoken word reads `word`, both normalised as a take is checked
 * (`normalizeWords`): `“Not,` reads `not`, `God’s` reads `god's`, and
 * `cover-up` reads `cover`, `up` and `cover-up`, a whole part at a time.
 */
export const readsWord = (text: string, word: string): boolean => {
  const said = normalizeWords(text);
  const want = normalizeWords(word);
  if (want.length === 0) return false;
  for (let i = 0; i + want.length <= said.length; i++)
    if (want.every((w, k) => said[i + k] === w)) return true;
  return false;
};

/** Whether a spoken word ends a sentence: `.`, `!` or `?`, before any closing quote or bracket. */
export const endsSentence = (text: string): boolean => /[.!?]["”’)]*$/.test(text);

/**
 * When the first word said at or after `from` (seconds, on the words' clock)
 * that reads `word` starts; none when the line never says it there. A word
 * pin (`{ mark, word }`) lands here.
 */
export const wordAfter = (
  words: ReadonlyArray<Word>,
  from: number,
  word: string,
): Option.Option<number> =>
  Option.map(
    Arr.findFirst(words, (w) => w.start >= from - 1e-3 && readsWord(w.text, word)),
    (w) => w.start,
  );

/**
 * Words as spoken in a recorded take. ElevenLabs aligns characters; group them
 * back into the words of `spoken`. A dialogue joins its lines with nothing
 * between them, so each line's first character (`breaks`) starts a word too.
 */
export const wordsFromAlignment = (
  spoken: string,
  chars: ReadonlyArray<string>,
  starts: ReadonlyArray<number>,
  ends: ReadonlyArray<number>,
  breaks: ReadonlyArray<number> = [],
): Result.Result<Word[], AlignmentMismatch> => {
  const out: Word[] = [];
  const lineStarts = new Set(breaks);
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
    if (lineStarts.has(i)) flush();
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
    return Result.fail(AlignmentMismatch.make({ spoken, words: out.length, expected }));
  return Result.succeed(out);
};

export interface SceneVoice {
  readonly spoken: string;
  readonly words: ReadonlyArray<Word>;
  /** Seconds of speech (0 for a silent scene). */
  readonly duration: number;
  readonly marks: ReadonlyMap<string, number>;
  /** Where another voice takes the line. */
  readonly turns: ReadonlyArray<Turn>;
  /** Audio file, when a current recording exists. */
  readonly file: string | undefined;
  readonly recorded: boolean;
}

/** The voice for one scene: recorded when the take matches the text, estimated otherwise. */
export const voiceFor = (id: string, text: string, timings: Timings | undefined): SceneVoice => {
  const parsed = parse(text);
  const { spoken, marks, turns } = parsed;
  if (spoken.length === 0)
    return {
      spoken,
      words: [],
      duration: 0,
      marks: new Map(),
      turns: [],
      file: undefined,
      recorded: false,
    };
  const take = timings?.scenes[id];
  const recorded = take !== undefined && take.hash === hashText(takeScript(parsed));
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
    turns,
    file: recorded ? take.file : undefined,
    recorded,
  };
};
