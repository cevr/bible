// The credits, over the landing's last shot: the camera goes on easing back
// from where `thesis` leaves the city, the two of them still sitting together
// on the rooftop, while the film's name and its sources roll up a torn paper
// strip at the left. The sources are each beat's `cite`, by author. Then the
// strip goes and the city holds, clear, for the end screens. It does not
// breathe: the film has stopped breathing by its last card, and the pull back
// is its only move.

import {
  type Camera,
  drawing,
  knobCamera,
  probePlate,
  rectShape,
  shotPath,
  write,
} from '@bible/film/canvas';
import { clamp } from '@bible/film/core';
import { landingSky, rooftop } from '../city.ts';
import { C, F, glow, handsOf, piece } from '../kit.ts';
import { script } from '../script.ts';

/** The authors the sources are grouped under, in the order the credits give them, after scripture. */
const AUTHORS = [
  'Ellen G. White',
  'E. J. Waggoner',
  'A. T. Jones',
  'Fundamental Principles of the Seventh-day Adventists',
] as const;
/** How the script cites the 1889 statement. */
const PRINCIPLES = 'Fundamental Principles';

/** The widest line on the strip, in characters of the body type. */
const MEASURE = 38;

/** `parts` joined by `sep` into lines no longer than `MEASURE` characters, never breaking a part. */
const wrap = (parts: ReadonlyArray<string>, sep: string): string[] => {
  const lines: string[] = [];
  let line = '';
  for (const part of parts) {
    const next = line === '' ? part : `${line}${sep}${part}`;
    if (next.length > MEASURE && line !== '') {
      lines.push(line);
      line = part;
    } else line = next;
  }
  if (line !== '') lines.push(line);
  return lines;
};
/** `text` broken at spaces. */
const words = (text: string) => wrap(text.split(' '), ' ');

/** One line of the roll: its text, its type, and the space above it. */
interface Credit {
  readonly text: string;
  readonly kind: 'name' | 'head' | 'item';
  readonly gap: number;
}

/** Every cite in the script, once each, in the order the film first cites it. */
const CITES = [...new Set(script.flatMap((b) => b.cite ?? []))];

/** A cite as the credits give it: its author (none for scripture) and the work it names. */
interface Source {
  readonly author: string | undefined;
  readonly work: string;
}

/** A cite's author and the work it names. */
const authorOf = (cite: string): Source => {
  if (cite.startsWith(PRINCIPLES))
    return { author: AUTHORS[3], work: cite.slice(PRINCIPLES.length + 1) };
  for (const author of AUTHORS)
    if (cite.startsWith(`${author}, `)) return { author, work: cite.slice(author.length + 2) };
  return { author: undefined, work: cite };
};

/** The roll: the film's name, then scripture, then each author's works, as the script cites them. */
const CREDITS: ReadonlyArray<Credit> = (() => {
  const out: Credit[] = [{ text: 'Righteousness by Faith', kind: 'name', gap: 0 }];
  const scripture = CITES.filter((c) => authorOf(c).author === undefined);
  out.push({ text: 'Scripture (King James Version)', kind: 'head', gap: 70 });
  for (const line of wrap(scripture, ' · ')) out.push({ text: line, kind: 'item', gap: 0 });
  for (const author of AUTHORS) {
    const works = CITES.map(authorOf).filter((c) => c.author === author);
    if (works.length === 0) continue;
    for (const [j, line] of words(author).entries())
      out.push({ text: line, kind: 'head', gap: j === 0 ? 46 : 0 });
    for (const { work } of works)
      for (const line of words(work)) out.push({ text: line, kind: 'item', gap: 0 });
  }
  return out;
})();

const STYLES = {
  name: { family: F.display, size: 52, weight: 700, color: C.ink, align: 'center' },
  head: { family: F.display, size: 30, weight: 700, color: C.ink, align: 'center' },
  item: { family: F.body, size: 26, color: C.inkSoft, align: 'center' },
} as const;
/** Each line's height by its type. */
const LEADING = { name: 72, head: 46, item: 38 } as const;

/** Each line's baseline down the roll from its top, and the roll's height. */
const BASELINES = CREDITS.reduce<number[]>((ys, c, i) => {
  ys.push((i === 0 ? 0 : (ys[i - 1] ?? 0)) + c.gap + LEADING[c.kind]);
  return ys;
}, []);
const ROLL_H = (BASELINES[BASELINES.length - 1] ?? 0) + 40;

/** The torn paper strip the credits roll up, at the frame's left, clear of the rooftop. */
const STRIP = { x: 90, y: 70, w: 700, h: 940 } as const;
const STRIP_SHAPE = rectShape(STRIP.x, STRIP.y, STRIP.w, STRIP.h);
/** How far inside the strip's top and bottom a line fades out, and the margin it never crosses. */
const FADE = 90;
const MARGIN = 24;

export const end = drawing({
  drift: 0,
  timeline: {
    // The strip comes in, the credits roll up it, and it goes: the rest is clear for the end screens.
    stripIn: { scene: 'start', dur: 0.8 },
    roll: { scene: 'start', dur: 22, ease: 'linear' },
    stripOut: { after: 'roll', dur: 0.8 },
    // The pull back, from where `thesis` leaves the city, settling as the strip goes.
    back: { with: 'roll', dur: 24, ease: 'inOutSine' },
  },
  knobs: {
    // Where `thesis` leaves the city (its `city` knob), and the wider city the card ends on.
    from: [1200, 640],
    fromZoom: 1.3,
    wide: [1060, 560],
    wideZoom: 1,
  },
  draw: (f) => {
    const { ctx, w, h } = f;
    landingSky(ctx, w, h);
    glow(ctx, 960, 380, 750, C.glow, 0.55);
    const cam: Camera = shotPath(knobCamera(f.knob('from'), f.knob('fromZoom')), [
      [f.at('back'), knobCamera(f.knob('wide'), f.knob('wideZoom'))],
    ]);
    // `thesis`'s rooftop, its paper cut as it was, the two turned to each other.
    rooftop(ctx, w, h, handsOf(f, 'thesis'), cam, 1);

    const shown = f.at('stripIn') * (1 - f.at('stripOut'));
    if (shown <= 0) return;
    ctx.save();
    ctx.globalAlpha *= shown;
    piece(ctx, STRIP_SHAPE, C.cream, f.hand('strip'), {
      role: 'scenery',
      kind: 'cut',
      line: 0,
      torn: 3,
      shadow: 0.5,
    });
    // The roll starts below the strip and ends above it; a line shows only
    // while it is wholly on the strip, fading at its top and bottom.
    const top = STRIP.y + STRIP.h - f.at('roll') * (ROLL_H + STRIP.h);
    const cx = STRIP.x + STRIP.w / 2;
    probePlate(ctx, STRIP_SHAPE, () =>
      CREDITS.forEach((c, i) => {
        const y = top + (BASELINES[i] ?? 0);
        const above = y - STYLES[c.kind].size - STRIP.y - MARGIN;
        const below = STRIP.y + STRIP.h - MARGIN - y;
        if (above < 0 || below < 0) return;
        write(ctx, c.text, cx, y, STYLES[c.kind], f.hand(`credit${i}`), {
          alpha: clamp(Math.min(above, below) / FADE),
          boil: 0,
        });
      }),
    );
    ctx.restore();
  },
});
