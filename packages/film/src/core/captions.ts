// Captions from the word timings: when each line shows, in one place. The
// burned-in captions (canvas) and the WebVTT sidecar (the renderer) both read
// `captionCues`, so the file and the picture cannot disagree. Pure.

import { Array as Arr, Option } from 'effect';
import { type Placed, captionLines } from './layout.ts';
import type { Turn } from './narration.ts';
import type { Word } from './schema.ts';
import type { ResolvedShort } from './shorts.ts';

/** A line shows this long before its first word, so the eye is there first. */
export const CAPTION_LEAD = 0.05;
/** The last line of a take holds this long after its last word. */
export const CAPTION_HOLD = 0.6;

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
 * Every caption line of a film, in the time of the range `[from, to)`: a line
 * shows only while its scene is on screen, and a range starts at zero.
 */
export const filmCaptions = (
  placed: ReadonlyArray<Placed>,
  range: { readonly from: number; readonly to: number },
): Array<CaptionCue> =>
  placed.flatMap((p) => {
    const at = p.start + p.speechStart;
    return captionCues(p.voice.words, p.voice.turns).flatMap((cue) => {
      const start = Math.max(p.start, range.from, at + cue.start);
      const end = Math.min(p.start + p.dur, range.to, at + cue.end);
      if (end <= start) return [];
      return [{ start: start - range.from, end: end - range.from, text: cue.text }];
    });
  });

/**
 * Every caption line of a short, in the time of its range `[from, to)`: each
 * span's lines as the film shows them there, laid where the span plays.
 */
export const shortCaptions = (
  placed: ReadonlyArray<Placed>,
  short: ResolvedShort,
  range: { readonly from: number; readonly to: number },
): Array<CaptionCue> =>
  short.spans.flatMap((span) =>
    filmCaptions(placed, { from: span.from, to: span.to }).flatMap((cue) => {
      const start = Math.max(range.from, cue.start + span.at);
      const end = Math.min(range.to, cue.end + span.at);
      if (end <= start) return [];
      return [{ start: start - range.from, end: end - range.from, text: cue.text }];
    }),
  );

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
