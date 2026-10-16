// Full-screen cards (CRAFT rule 1, from the owner's editing reference,
// `.claude/skills/film/reference/real-life-tv-study.md` §3): the narration's
// own words typeset over the whole frame. The picture cuts to the card and
// back; each word appears as it is heard; one payoff word is set large in a
// colour from the colour script. And the verse a card may follow: Scripture
// on its page, the phrase highlighted, the highlight flooding into the card.
//
// A scene declares its card once on its drawing (`drawing({ card })`): the
// cue the card holds the frame for (a hard cut in at its start and out at its
// end), the words it sets (from a mark, as the take says them) and its payoff
// word, and, when it follows a highlight, the cue the highlight floods the
// frame over. The scene's draw returns where on the frame the highlight
// stands (`verse` returns it so), and the flood grows from that box: the
// same frame's, never one an earlier frame left. The film draws the card in
// place of the scene, on the film's paper (opaque, so the frame is the same
// whatever was drawn before it), so no act light or vignette dims it, and no
// caption is set over it: the card is the words (`film.ts`); a flood is drawn
// over the lit scene, after its light and vignette. What the card looks like is the look's: `fullCard` sets the words
// in a `CardStyle` (its ground, face, sizes, case and the payoff's colour and
// treatment), or a look draws them its own way from the same `CardWord`s.

import { Option, Predicate, Result } from 'effect';
import { type Hand, sub } from './ink.ts';
import { type TextStyle, measure, write } from './type.ts';
import type { TakeWord } from '../core/schema.ts';
import { cardSaid } from '../core/narration.ts';
import { clamp, ease, lerp } from '../core/time.ts';

/** A rectangle on the frame (or in a drawing's own space), in px. */
export interface Box {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/** A word a card sets: its text as said, when it is heard (scene seconds), and whether it is the payoff. */
export interface CardWord {
  readonly text: string;
  readonly at: number;
  readonly payoff: boolean;
}

/**
 * A scene's full-screen card, as its drawing declares it: `C` names the
 * drawing's cues and `F` is its frame.
 */
export interface CardSpec<C extends string, F> {
  /** The cue the card holds the frame for: a hard cut in at its start, a hard cut out at its end. */
  readonly cue: C;
  /** The mark its words start at: every word heard from there to `to` (the end of the speech when none). */
  readonly from: string;
  readonly to?: string;
  /** The payoff word, read as a take is checked (`readsWord`): the first of the card's words that reads it. */
  readonly payoff: string;
  /**
   * The highlight the card floods in from: over `cue` the card grows from
   * the box the scene's draw returned on the same frame (the highlight's, in
   * the canvas's own pixels, as `verse` returns it) to the whole frame, drawn
   * over the lit scene. A draw that returns no box while the flood holds
   * stops the frame.
   */
  readonly flood?: {
    readonly cue: C;
    /**
     * The flood's edge as the look draws it, in place of the box's straight
     * one: called on the card's own layer, in the canvas's pixels (no
     * transform), with the box grown so far (`floodBox`), the cue's eased
     * progress `at` and the scene's frame, it paints where the card shows
     * (its alpha is the card's: a ragged edge, a soft wash). The engine keeps
     * the card only there and lays it over the lit scene.
     */
    readonly mask?: (ctx: CanvasRenderingContext2D, box: Box, at: number, f: F) => void;
  };
  /** The card, over the film's paper: the look's ground and typography (`fullCard`, or its own). */
  readonly draw: (f: F, words: ReadonlyArray<CardWord>) => void;
}

/** The words a card's voice says, as `cardWords` reads them. */
interface CardVoice {
  readonly words: ReadonlyArray<TakeWord>;
  readonly marks: ReadonlyMap<string, number>;
}

/**
 * The words `card` sets from a scene's voice, each at the scene second it is
 * heard (`speechStart` plus its voiced start), the payoff marked; or why
 * none: a mark the line lacks, no word between the marks, or no word that
 * reads the payoff.
 */
export const cardWords = (
  scene: string,
  voice: CardVoice,
  speechStart: number,
  card: { readonly from: string; readonly to?: string; readonly payoff: string },
): Result.Result<ReadonlyArray<CardWord>, string> =>
  Result.map(cardSaid(scene, voice.words, voice.marks, card), ({ said, payoff }) =>
    said.map((w, i) => ({
      text: w.text,
      at: speechStart + w.voiced.start,
      payoff: i === payoff,
    })),
  );

/** How a look sets a card: its ground, its face and sizes, and the payoff's colour and treatment. */
export interface CardStyle {
  /** The ground over the whole frame: a colour, or a painter for a ground of the look's own. */
  readonly ground: string | ((ctx: CanvasRenderingContext2D, w: number, h: number) => void);
  /** The lead-in words' face, size (px on the frame) and ink. */
  readonly type: TextStyle;
  /** The payoff's size as a multiple of the lead-in's: two to three (CRAFT rule 1). */
  readonly payoffScale: number;
  /** The payoff's ink, from the colour script (scarlet for sin, white for the robe, gold for the Word). */
  readonly payoffColor: string;
  /** The payoff's own face, weight or tracking, over the lead-in's. */
  readonly payoffType?: Partial<Omit<TextStyle, 'size' | 'color'>>;
  /** How the words are cased: as said (the default), lower case (the reference's) or upper case. */
  readonly case?: 'said' | 'lower' | 'upper';
  /** Flush left (the reference's, the default) or centred. */
  readonly align?: 'left' | 'center';
  /** The space either side of the words, px. Defaults to 9 % of the frame's width (the reference's 8.6 %). */
  readonly margin?: number;
  /** How long each word takes to rise in, seconds: the reference's three frames at 60 fps. */
  readonly rise?: number;
  /**
   * The payoff's treatment, drawn once it is heard: `box` where it is set on
   * the frame, `since` the seconds since it was heard. Over the word unless
   * `under` (a highlight box, a glow).
   */
  readonly treatment?: {
    readonly under?: boolean;
    readonly draw: (ctx: CanvasRenderingContext2D, box: Box, since: number) => void;
  };
}

/** The reference's word rise: three frames at 60 fps. */
const RISE = 0.05;

/** A word as `cardLayout` sets it: its text cased, its type and its box. */
interface SetWord extends CardWord {
  readonly set: string;
  readonly style: TextStyle;
  /** Its baseline's left end. */
  readonly x: number;
  readonly y: number;
  /** Its box, from the top of its line to the bottom. */
  readonly box: Box;
}

const cased = (text: string, how: CardStyle['case']) =>
  how === 'lower' ? text.toLowerCase() : how === 'upper' ? text.toUpperCase() : text;

/** A line of a card being set: its words, their type and its width. */
interface Line {
  readonly words: Array<{ readonly word: CardWord; readonly set: string; readonly w: number }>;
  readonly style: TextStyle;
  width: number;
}

/**
 * The card's words set on a `w` × `h` frame: the lead-in in lines that wrap
 * inside the margins, the payoff on a line of its own at its scale, the block
 * centred on the frame's height, flush left or centred. Pure: it measures in
 * `ctx`'s fonts and draws nothing.
 */
const cardLayout = (
  ctx: CanvasRenderingContext2D,
  words: ReadonlyArray<CardWord>,
  style: CardStyle,
  w: number,
  h: number,
): ReadonlyArray<SetWord> => {
  const margin = style.margin ?? w * 0.09;
  const room = w - 2 * margin;
  const lead = style.type;
  const big: TextStyle = {
    ...lead,
    ...style.payoffType,
    size: lead.size * style.payoffScale,
    color: style.payoffColor,
  };
  const lines: Line[] = [];
  const open = (s: TextStyle): Line => {
    const line: Line = { words: [], style: s, width: 0 };
    lines.push(line);
    return line;
  };
  let line: Line | undefined;
  for (const word of words) {
    const s = word.payoff ? big : lead;
    const set = cased(word.text, style.case);
    const ww = measure(ctx, set, s);
    const space = measure(ctx, ' ', s);
    const fits = line !== undefined && line.style === s && line.width + space + ww <= room;
    if (word.payoff || line === undefined || line.style !== s || !fits) line = open(s);
    if (line.words.length > 0) line.width += space;
    line.words.push({ word, set, w: ww });
    line.width += ww;
    if (word.payoff) line = undefined;
  }
  const leading = (s: TextStyle) => (s.leading ?? 1.15) * s.size;
  const total = lines.reduce((sum, l) => sum + leading(l.style), 0);
  let top = (h - total) / 2;
  const out: SetWord[] = [];
  for (const l of lines) {
    const tall = leading(l.style);
    // The baseline sits where a line's capitals centre in its leading.
    const y = top + tall / 2 + l.style.size * 0.35;
    let x = style.align === 'center' ? (w - l.width) / 2 : margin;
    const space = measure(ctx, ' ', l.style);
    for (const { word, set, w: ww } of l.words) {
      out.push({ ...word, set, style: l.style, x, y, box: { x, y: top, w: ww, h: tall } });
      x += ww + space;
    }
    top += tall;
  }
  return out;
};

/** What `fullCard` draws with: a frame's context, size, scene clock and hands. */
interface CardFrame {
  readonly ctx: CanvasRenderingContext2D;
  readonly w: number;
  readonly h: number;
  readonly t: number;
  hand(key: string | number): Hand;
}

/**
 * A full-screen card in `style`: its ground over the whole frame, then each
 * word from the moment it is heard, rising in over `rise`, the payoff at its
 * scale and colour with its treatment. Text goes through `write`, so `film
 * check` reads every word.
 */
export const fullCard = (f: CardFrame, words: ReadonlyArray<CardWord>, style: CardStyle) => {
  const { ctx, w, h, t } = f;
  ctx.save();
  if (Predicate.isString(style.ground)) {
    ctx.fillStyle = style.ground;
    ctx.fillRect(0, 0, w, h);
  } else style.ground(ctx, w, h);
  const rise = style.rise ?? RISE;
  const set = cardLayout(ctx, words, style, w, h);
  for (const [i, word] of set.entries()) {
    if (t < word.at) continue;
    const since = t - word.at;
    const treat = word.payoff ? style.treatment : undefined;
    if (treat?.under === true) treat.draw(ctx, word.box, since);
    write(ctx, word.set, word.x, word.y, word.style, f.hand(`card${i}`), {
      progress: clamp(since / rise),
      reveal: 'rise',
      boil: 0,
    });
    if (treat !== undefined && treat.under !== true) treat.draw(ctx, word.box, since);
  }
  ctx.restore();
};

/** `from` grown toward the whole `w` × `h` frame by `p`, eased: where a flood stands. */
export const floodBox = (from: Box, w: number, h: number, p: number): Box => {
  const e = ease.inOutCubic(clamp(p));
  return {
    x: lerp(from.x, 0, e),
    y: lerp(from.y, 0, e),
    w: lerp(from.w, w, e),
    h: lerp(from.h, h, e),
  };
};

/** A verse on its page: the text as printed (KJV, verbatim) and the phrase a card lifts from it. */
export interface Verse {
  readonly text: string;
  /** The phrase highlighted: a run of `text`'s words, as printed. */
  readonly phrase: string;
}

/** How a look sets a verse: its type, how wide it runs, and the highlight's colour. */
export interface VerseStyle {
  readonly type: TextStyle;
  /** How wide the text runs before it wraps, px in the drawing's space. */
  readonly width: number;
  /** The highlight's colour: the card's ground, so the flood is the highlight grown. */
  readonly highlight: string;
  /** The ink of the words the highlight covers, where the type's would not read on it (the card's ink). */
  readonly lit?: string;
  /**
   * How far the highlight reaches past each word, px in the drawing's space:
   * `x` each side (0.12 of the type's size when unset), `y` above and below
   * (none when unset). Bars on one line that meet are filled as one, so an
   * `x` of half a space or more joins a line's highlight into one bar.
   */
  readonly pad?: { readonly x?: number; readonly y?: number };
}

/** A verse set: its lines, and the phrase's words as boxes in reading order. */
interface VerseSet {
  readonly lines: ReadonlyArray<{ readonly text: string; readonly y: number }>;
  readonly phrase: ReadonlyArray<Box>;
}

/** The first run of `words` that is `phrase`'s words, by index; none when it is not there. */
const phraseAt = (words: ReadonlyArray<string>, phrase: ReadonlyArray<string>) => {
  for (let i = 0; i + phrase.length <= words.length; i++)
    if (phrase.every((p, k) => words[i + k] === p)) return Option.some(i);
  return Option.none<number>();
};

/** `verse` set in `style` with its first baseline at (x, y): its lines and the phrase's word boxes. */
const verseLayout = (
  ctx: CanvasRenderingContext2D,
  verse: Verse,
  style: VerseStyle,
  x: number,
  y: number,
): VerseSet => {
  const words = verse.text.split(/\s+/).filter((s) => s.length > 0);
  const phrase = verse.phrase.split(/\s+/).filter((s) => s.length > 0);
  // A phrase that is not a run of the verse's words (a typo, other punctuation) would
  // highlight nothing and flood from nowhere: Scripture is set verbatim, so it stops here.
  const found = Option.filter(phraseAt(words, phrase), () => phrase.length > 0);
  if (Option.isNone(found))
    throw new Error(
      `verse: the phrase "${verse.phrase}" is no run of the words of "${verse.text}" (set both verbatim)`,
    );
  const first = found.value;
  const s = style.type;
  const tall = (s.leading ?? 1.3) * s.size;
  const space = measure(ctx, ' ', s);
  const lines: Array<{ text: string; y: number }> = [];
  const boxes: Box[] = [];
  let line = '';
  let lx = 0;
  let row = 0;
  for (const [i, word] of words.entries()) {
    const ww = measure(ctx, word, s);
    if (line.length > 0 && lx + space + ww > style.width) {
      lines.push({ text: line, y: y + row * tall });
      line = '';
      lx = 0;
      row++;
    }
    const at = line.length === 0 ? 0 : lx + space;
    if (i >= first && i < first + phrase.length)
      boxes.push({ x: x + at, y: y + row * tall - s.size * 0.95, w: ww, h: s.size * 1.25 });
    line = line.length === 0 ? word : `${line} ${word}`;
    lx = at + ww;
  }
  if (line.length > 0) lines.push({ text: line, y: y + row * tall });
  return { lines, phrase: boxes };
};

/** A box widened by `x` px each side and `y` px above and below. */
const padded = (b: Box, x: number, y: number): Box => ({
  x: b.x - x,
  y: b.y - y,
  w: b.w + 2 * x,
  h: b.h + 2 * y,
});

/** `bars` in reading order, each run of them on one line that meets or overlaps filled as one bar. */
const joined = (bars: ReadonlyArray<Box>): ReadonlyArray<Box> =>
  bars.reduce<Array<Box>>((out, b) => {
    const prev = out.at(-1);
    if (prev !== undefined && prev.y === b.y && b.x <= prev.x + prev.w) {
      out[out.length - 1] = { ...prev, w: Math.max(prev.x + prev.w, b.x + b.w) - prev.x };
      return out;
    }
    out.push(b);
    return out;
  }, []);

/** The smallest box round `boxes` (an empty box at the origin when there are none). */
const boxAround = (boxes: ReadonlyArray<Box>): Box => {
  if (boxes.length === 0) return { x: 0, y: 0, w: 0, h: 0 };
  const x0 = Math.min(...boxes.map((b) => b.x));
  const y0 = Math.min(...boxes.map((b) => b.y));
  const x1 = Math.max(...boxes.map((b) => b.x + b.w));
  const y1 = Math.max(...boxes.map((b) => b.y + b.h));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
};

/** `b` (in `ctx`'s current space) on the frame: the box round its corners as the transform puts them. */
const onFrame = (ctx: CanvasRenderingContext2D, b: Box): Box => {
  const m = ctx.getTransform();
  const corners = [
    [b.x, b.y],
    [b.x + b.w, b.y],
    [b.x, b.y + b.h],
    [b.x + b.w, b.y + b.h],
  ].map(([px = 0, py = 0]) => ({
    x: m.a * px + m.c * py + m.e,
    y: m.b * px + m.d * py + m.f,
    w: 0,
    h: 0,
  }));
  return boxAround(corners);
};

/**
 * `verse` on its page at (x, y) (its first baseline), the phrase highlighted
 * `highlight` of the way along its words (0 none, 1 all, swept in reading
 * order), the text set over the highlight, in `lit` ink where it covers it.
 * Returns the box of the phrase's last line, where the sweep ends (on a line
 * the phrase shares with words it does not hold, those stay outside it), in
 * the canvas's own pixels, through every transform it was drawn under (a
 * camera, the render's scale): where a card's flood starts. The page itself
 * (paper, a column rule, a verse number) is the look's to draw under it.
 */
export const verse = (
  ctx: CanvasRenderingContext2D,
  v: Verse,
  style: VerseStyle,
  at: { readonly x: number; readonly y: number; readonly highlight: number },
  hand: Hand,
): Box => {
  const set = verseLayout(ctx, v, style, at.x, at.y);
  const padX = style.pad?.x ?? style.type.size * 0.12;
  const padY = style.pad?.y ?? 0;
  const total = set.phrase.reduce((sum, b) => sum + b.w + 2 * padX, 0);
  let left = clamp(at.highlight) * total;
  const swept: Box[] = [];
  for (const b of set.phrase) {
    if (left <= 0) break;
    const p = padded(b, padX, padY);
    swept.push({ ...p, w: Math.min(p.w, left) });
    left -= p.w;
  }
  const lit = joined(swept);
  ctx.save();
  ctx.fillStyle = style.highlight;
  for (const r of lit) ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.restore();
  const lines = (ink: string) => {
    for (const [i, l] of set.lines.entries())
      write(ctx, l.text, at.x, l.y, { ...style.type, color: ink, align: 'left' }, sub(hand, i), {
        boil: 0,
      });
  };
  lines(style.type.color);
  if (style.lit !== undefined && lit.length > 0) {
    ctx.save();
    ctx.beginPath();
    for (const r of lit) ctx.rect(r.x, r.y, r.w, r.h);
    ctx.clip();
    lines(style.lit);
    ctx.restore();
  }
  const last = set.phrase.at(-1)?.y;
  const end = set.phrase.filter((b) => b.y === last).map((b) => padded(b, padX, padY));
  return onFrame(ctx, boxAround(end));
};
