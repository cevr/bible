// A short's burned-in captions: its phrases (`shortPhrases`), one at a time,
// centred under the film's frame with no plate. A quoted word takes a gold
// marker stroke behind it, swept across it as it is read, so a quotation
// lights word by word and plain narration stays plain. Every phrase is set
// once (its lines, each word's place); a frame only looks one up and draws it.

import type { Phrase } from '../core/phrases.ts';
import { SHORT_LAYOUT } from '../core/shorts.ts';
import { clamp } from '../core/time.ts';
import type { ShortLook } from './film.ts';
import { type Probe, recordText } from './probe.ts';

/** A word of a set phrase, in 1080 × 1920 px. */
interface SetWord {
  readonly text: string;
  readonly x: number;
  readonly baseline: number;
  readonly width: number;
  readonly quoted: boolean;
  readonly start: number;
  readonly end: number;
}

/** A line of a set phrase: its words' box, for the probe. */
interface SetLine {
  readonly text: string;
  readonly left: number;
  readonly top: number;
  readonly width: number;
}

interface SetPhrase {
  readonly start: number;
  readonly end: number;
  readonly words: ReadonlyArray<SetWord>;
  readonly lines: ReadonlyArray<SetLine>;
}

/** How far the marker reaches past a word's ends, and how far its top sits below the font's ascent, in px. */
const MARK_PAD = 6;
/** How opaque the gold marker lays over the paper. */
const MARK_ALPHA = 0.7;

/** A phrase's words broken greedily into lines at most `width` wide: each line, its words' indices. */
const greedyLines = (widths: ReadonlyArray<number>, space: number, width: number) => {
  const lines: number[][] = [];
  let used = 0;
  widths.forEach((w, i) => {
    const line = lines[lines.length - 1];
    if (line !== undefined && used + space + w <= width) {
      line.push(i);
      used += space + w;
    } else {
      lines.push([i]);
      used = w;
    }
  });
  return lines;
};

/** The widest line of `lines`, set with `space` between words. */
const widest = (
  lines: ReadonlyArray<ReadonlyArray<number>>,
  widths: ReadonlyArray<number>,
  space: number,
) =>
  lines.reduce(
    (most, line) =>
      Math.max(most, line.reduce((n, i) => n + (widths[i] ?? 0), 0) + space * (line.length - 1)),
    0,
  );

/**
 * A phrase's words in as few lines as the greedy break needs, but balanced:
 * of every way to cut the words into that many lines, the one whose widest
 * line is narrowest, so no word is left alone on a line. A phrase is a few
 * words, so trying every cut is cheap, and it is done once per phrase.
 */
export const breakLines = (widths: ReadonlyArray<number>, space: number, width: number) => {
  const greedy = greedyLines(widths, space, width);
  const n = widths.length;
  if (greedy.length < 2 || n > 12) return greedy;
  let best: number[][] = greedy;
  let bestWidth = widest(greedy, widths, space);
  // Each mask bit i cuts after word i; keep the masks with the greedy's number of cuts.
  for (let mask = 0; mask < 1 << (n - 1); mask++) {
    const lines: number[][] = [[0]];
    for (let i = 1; i < n; i++) {
      if ((mask >> (i - 1)) & 1) lines.push([i]);
      else lines[lines.length - 1]?.push(i);
    }
    if (lines.length !== greedy.length) continue;
    const w = widest(lines, widths, space);
    if (w < bestWidth) {
      best = lines;
      bestWidth = w;
    }
  }
  return best;
};

/** The index of the phrase showing at `s`, or -1: phrases run in order and never overlap. */
const phraseAt = (phrases: ReadonlyArray<SetPhrase>, s: number) => {
  let lo = 0;
  let hi = phrases.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const p = phrases[mid];
    if (p === undefined) return -1;
    if (s < p.start) hi = mid - 1;
    else if (s >= p.end) lo = mid + 1;
    else return mid;
  }
  return -1;
};

/** The captions of a short whose phrases are `phrases`, set in `style`, drawn `k` page px per px. */
export const burnedCaptions = (
  phrases: ReadonlyArray<Phrase>,
  style: ShortLook['caption'],
  k: number,
) => {
  let set: ReadonlyArray<SetPhrase> | undefined;
  let ascent = 0;
  let descent = 0;

  /** Every phrase set once, on the first frame that shows one, in the caption's font. */
  const setAll = (ctx: CanvasRenderingContext2D) => {
    ctx.save();
    ctx.font = style.font;
    const m = ctx.measureText('Hg');
    ascent = m.fontBoundingBoxAscent;
    descent = m.fontBoundingBoxDescent;
    const step = (ascent + descent) * 1.08;
    const space = ctx.measureText(' ').width;
    const { centre, caption } = SHORT_LAYOUT;
    const all = phrases.map((phrase) => {
      const widths = phrase.words.map((w) => ctx.measureText(w.text).width);
      const lines = breakLines(widths, space, caption.width);
      const top = caption.y - ((lines.length - 1) * step) / 2;
      const words: SetWord[] = [];
      const boxes: SetLine[] = [];
      lines.forEach((line, row) => {
        const lineWidth =
          line.reduce((n, i) => n + (widths[i] ?? 0), 0) + space * (line.length - 1);
        const baseline = top + row * step + (ascent - descent) / 2;
        let x = centre - lineWidth / 2;
        boxes.push({
          text: line.map((i) => phrase.words[i]?.text ?? '').join(' '),
          left: x,
          top: baseline - ascent,
          width: lineWidth,
        });
        for (const i of line) {
          const w = phrase.words[i];
          const width = widths[i] ?? 0;
          if (w !== undefined)
            words.push({
              text: w.text,
              x,
              baseline,
              width,
              quoted: w.quoted,
              start: w.start,
              end: w.end,
            });
          x += width + space;
        }
      });
      return { start: phrase.start, end: phrase.end, words, lines: boxes };
    });
    ctx.restore();
    return all;
  };

  /** Draw the phrase showing at short second `s`, if one is; record its lines when probed. */
  const draw = (ctx: CanvasRenderingContext2D, s: number, probe: Probe | undefined) => {
    set ??= setAll(ctx);
    const phrase = set[phraseAt(set, s)];
    if (phrase === undefined) return;
    ctx.save();
    ctx.setTransform(k, 0, 0, k, 0, 0);
    // The marker first, under the words: each quoted word's, swept as it is read.
    ctx.fillStyle = style.highlight;
    ctx.globalAlpha = MARK_ALPHA;
    for (const w of phrase.words) {
      if (!w.quoted || s < w.start) continue;
      const read = clamp((s - w.start) / Math.max(0.05, w.end - w.start));
      ctx.beginPath();
      ctx.roundRect(
        w.x - MARK_PAD,
        w.baseline - ascent + MARK_PAD,
        (w.width + 2 * MARK_PAD) * read,
        ascent + descent - MARK_PAD,
        8,
      );
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.font = style.font;
    ctx.fillStyle = style.color;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    for (const w of phrase.words) ctx.fillText(w.text, w.x, w.baseline);
    if (probe !== undefined)
      for (const line of phrase.lines)
        recordText(ctx, probe, line.text, line.left, line.top, line.width, ascent + descent, 1);
    ctx.restore();
  };

  return { draw };
};
