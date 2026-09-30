// Captions from the word timings: when each line shows, in one place. The
// burned-in captions (canvas) and the WebVTT sidecar (the renderer) both read
// `captionCues`, so the file and the picture cannot disagree. Pure.

import { Array as Arr, Option } from 'effect';
import type { Placed } from './layout.ts';
import { type Turn, endsClause, endsSentence } from './narration.ts';
import type { TakeWord, Word } from './schema.ts';
import { phraseCues, shortPhrases } from './phrases.ts';
import type { ResolvedShort } from './shorts.ts';

/** A line shows this long before its first word, so the eye is there first. */
const CAPTION_LEAD = 0.05;
/** The last line of a take holds this long after its last word. */
const CAPTION_HOLD = 0.6;

/**
 * Group words into short caption lines, breaking where a sentence or clause ends (`SENTENCE`, `CLAUSE`) and before
 * each word in `turns`, where another voice takes over.
 */
const captionLines = (
  words: ReadonlyArray<Word>,
  turns: ReadonlySet<number> = new Set(),
  max = 7,
): Word[][] => {
  const out: Word[][] = [];
  let cur: Word[] = [];
  for (const [i, w] of words.entries()) {
    if (turns.has(i) && cur.length > 0) {
      out.push(cur);
      cur = [];
    }
    cur.push(w);
    if (cur.length >= max || endsSentence(w.text) || endsClause(w.text)) {
      out.push(cur);
      cur = [];
    }
  }
  if (cur.length > 0) out.push(cur);
  return out;
};

/** One caption line and the span it shows, in seconds. */
export interface CaptionCue {
  readonly start: number;
  readonly end: number;
  readonly text: string;
}

/**
 * A take's caption lines, take-local. The first leads its first word; each
 * shows until the next line's first word, so no two lines overlap. In a take
 * with turns, a line never spans two voices, and each voice's first line
 * opens with a dash, as spoken dialogue is captioned.
 */
export const captionCues = (
  words: ReadonlyArray<Word>,
  turns: ReadonlyArray<Turn> = [],
): Array<CaptionCue> => {
  const turnAt = new Set(turns.map((t) => t.word));
  const lines = captionLines(words, turnAt);
  const firstWords = lines.map((_, i) => lines.slice(0, i).reduce((n, l) => n + l.length, 0));
  const opensVoice = (i: number) =>
    turns.length > 0 && Option.exists(Arr.get(firstWords, i), (w) => w === 0 || turnAt.has(w));
  return lines.flatMap((line, i) => {
    const first = Arr.head(line);
    const last = Arr.last(line);
    if (Option.isNone(first) || Option.isNone(last)) return [];
    const end = Option.match(Option.flatMap(Arr.get(lines, i + 1), Arr.head), {
      onNone: () => last.value.end + CAPTION_HOLD,
      onSome: (next) => next.start,
    });
    // Only the first line leads: a later one starts where the line before it ends.
    const lead = Arr.match(lines.slice(0, i), { onEmpty: () => CAPTION_LEAD, onNonEmpty: () => 0 });
    const start = first.value.start - lead;
    const said = line.map((w) => w.text).join(' ');
    if (opensVoice(i)) return [{ start, end, text: `- ${said}` }];
    return [{ start, end, text: said }];
  });
};

/**
 * How the long film times its caption lines: by the aligner's word starts, as
 * it always has. A short's captions are timed by the voice (`heard`); to time
 * the film's the same way is this one line, `= heard` (`voiced.ts`). It
 * moves every line after a pause later, by up to most of a second, in the
 * burned-in frames and the sidecar alike: pixel-moving, so the owner's call.
 */
const filmCaptionTimes = (words: ReadonlyArray<TakeWord>): ReadonlyArray<Word> => words;

/** A scene's caption lines, take-local: what the film burns in and the sidecar writes. */
export const sceneCaptions = (p: Placed): Array<CaptionCue> =>
  captionCues(filmCaptionTimes(p.voice.words), p.voice.turns);

/**
 * Every caption line of a film, in the time of the range `[from, to)`: a line
 * shows only while its scene is on screen, and a range starts at zero.
 */
export const filmCaptions = (
  placed: ReadonlyArray<Placed>,
  range: { readonly from: number; readonly to: number },
): Array<CaptionCue> =>
  placed.flatMap((p) => {
    const at = p.start + p.speechStart;
    return sceneCaptions(p).flatMap((cue) => {
      const start = Math.max(p.start, range.from, at + cue.start);
      const end = Math.min(p.start + p.dur, range.to, at + cue.end);
      if (end <= start) return [];
      return [{ start: start - range.from, end: end - range.from, text: cue.text }];
    });
  });

/**
 * Every caption of a short, in the time of its range `[from, to)`: the
 * phrases its page burns in (`shortPhrases`), as it shows them.
 */
export const shortCaptions = (
  placed: ReadonlyArray<Placed>,
  short: ResolvedShort,
  range: { readonly from: number; readonly to: number },
): Array<CaptionCue> =>
  phraseCues(shortPhrases(placed, short)).flatMap((cue) => {
    const start = Math.max(range.from, cue.start);
    const end = Math.min(range.to, cue.end);
    if (end <= start) return [];
    return [{ start: start - range.from, end: end - range.from, text: cue.text }];
  });

const pad = (n: number, width: number) => String(n).padStart(width, '0');

/** `HH:MM:SS.mmm`, the WebVTT timestamp. */
export const vttTime = (secs: number): string => {
  const ms = Math.max(0, Math.round(secs * 1000));
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor(ms / 60_000) % 60;
  const s = Math.floor(ms / 1000) % 60;
  return `${pad(h, 2)}:${pad(m, 2)}:${pad(s, 2)}.${pad(ms % 1000, 3)}`;
};

/** A WebVTT file of these cues. */
export const webVtt = (cues: ReadonlyArray<CaptionCue>): string =>
  [
    'WEBVTT',
    ...cues.map((c, i) => `${i + 1}\n${vttTime(c.start)} --> ${vttTime(c.end)}\n${c.text}`),
  ].join('\n\n') + '\n';
