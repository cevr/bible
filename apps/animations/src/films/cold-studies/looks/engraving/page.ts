// Job 9 on the page of an old illustrated Bible: two justified columns in
// a period serif under a running head and its rules, the chapter's heading,
// each verse its own paragraph with its number set small, the supplied
// words in italic as the printers set them, the page curving into the
// gutter at its inner edge, the shade there cut in lines like the plates.
// As "Job asked it" is said, the phrase is laid over with a gold wash, a
// brush drawn along it word by word; the wash is the card's colour, so the
// card floods out of it.

import { type Box, type TextStyle, measure, write } from '@bible/film/canvas';
import { lerp, rng } from '@bible/film/core';
import { VERSE } from '../../look.ts';
import type { JobFrame } from '../../scenes/job.ts';
import { GOLD_WASH, INK, paper } from './print.ts';

/** The period serif. */
export const FACE = 'EB Garamond';

/** Job 9:1–12, KJV verbatim; the printers' supplied words in [brackets], set in italic. */
const CHAPTER: ReadonlyArray<string> = [
  'Then Job answered and said,',
  'I know [it is] so of a truth: but how should man be just with God?',
  'If he will contend with him, he cannot answer him one of a thousand.',
  '[He is] wise in heart, and mighty in strength: who hath hardened [himself] against him, and hath prospered?',
  'Which removeth the mountains, and they know not: which overturneth them in his anger.',
  'Which shaketh the earth out of her place, and the pillars thereof tremble.',
  'Which commandeth the sun, and it riseth not; and sealeth up the stars.',
  'Which alone spreadeth out the heavens, and treadeth upon the waves of the sea.',
  'Which maketh Arcturus, Orion, and Pleiades, and the chambers of the south.',
  'Which doeth great things past finding out; yea, and wonders without number.',
  'Lo, he goeth by me, and I see [him] not: he passeth on also, but I perceive him not.',
  'Behold, he taketh away, who can hinder him? who will say unto him, What doest thou?',
];

/** Which verse the card lifts its phrase from (Job 9:2), by its place in `CHAPTER`. */
const LIFTED = 1;

/** The page, in its own units: its text block, columns, and the type. */
const PAGE = {
  w: 1500,
  h: 2100,
  left: 110,
  right: 1390,
  rule: 750,
  gap: 26,
  head: 150,
  top: 252,
  size: 34,
  leading: 47,
} as const;

const TEXT: TextStyle = { family: FACE, size: PAGE.size, weight: 400, color: INK };
const ITALIC: TextStyle = { ...TEXT, italic: true };
const NUMBER: TextStyle = { family: FACE, size: 21, weight: 500, color: INK };

/** A word on the page: where its baseline starts, its type, and whether the wash covers it. */
interface Set {
  readonly text: string;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly style: TextStyle;
  readonly phrase: boolean;
}

/** A verse's words: its number, then each word with its italic and whether it is the phrase's. */
const tokens = (v: string, n: number) => {
  const words: Array<{ text: string; italic: boolean; phrase: boolean }> = [];
  let italic = false;
  for (const raw of v.split(/\s+/)) {
    const opens = raw.startsWith('[');
    const closes = raw.includes(']');
    const text = raw.replace(/[[\]]/g, '');
    words.push({
      text: n === 0 && words.length === 0 ? text.toUpperCase() : text,
      italic: italic || opens,
      phrase: false,
    });
    italic = (italic || opens) && !closes;
  }
  if (n === LIFTED) {
    const phrase = VERSE.phrase.split(/\s+/);
    const at = words.findIndex((_, i) => phrase.every((p, k) => words[i + k]?.text === p));
    if (at >= 0)
      for (let k = 0; k < phrase.length; k++) {
        const w = words[at + k];
        if (w !== undefined) w.phrase = true;
      }
  }
  return words;
};

/**
 * The verses `from`..`to` set justified in a column `x`..`x + width` from
 * baseline `y`: each verse a paragraph, its number small and raised.
 */
const column = (
  ctx: CanvasRenderingContext2D,
  from: number,
  to: number,
  x: number,
  width: number,
  y: number,
  out: Set[],
) => {
  let base = y;
  const space = measure(ctx, ' ', TEXT);
  for (let n = from; n < to; n++) {
    const v = CHAPTER[n];
    if (v === undefined) continue;
    const num = `${n + 1}`;
    const numW = measure(ctx, num, NUMBER) + space * 0.5;
    const words = tokens(v, n).map((t) => {
      const style = t.italic ? ITALIC : TEXT;
      return { ...t, style, w: measure(ctx, t.text, style) };
    });
    const lines: Array<typeof words> = [];
    let line: typeof words = [];
    let used = numW;
    for (const w of words) {
      const need = (line.length > 0 ? space : 0) + w.w;
      if (line.length > 0 && used + need > width) {
        lines.push(line);
        line = [];
        used = 0;
      }
      used += (line.length > 0 ? space : 0) + w.w;
      line.push(w);
    }
    if (line.length > 0) lines.push(line);
    lines.forEach((l, i) => {
      const indent = i === 0 ? numW : 0;
      const natural = l.reduce((s, w) => s + w.w, 0) + space * (l.length - 1);
      const last = i === lines.length - 1;
      const gap =
        !last && l.length > 1 ? space + (width - indent - natural) / (l.length - 1) : space;
      if (i === 0) out.push({ text: num, x, y: base - 11, w: numW, style: NUMBER, phrase: false });
      let cx = x + indent;
      for (const w of l) {
        out.push({ text: w.text, x: cx, y: base, w: w.w, style: w.style, phrase: w.phrase });
        cx += w.w + gap;
      }
      base += PAGE.leading;
    });
  }
};

/** The page's sheet of paper, larger than any view of it, made once. */
const SHEET = { x: -420, y: -120, w: 1980, h: 2300 } as const;

/** The gutter: the page curving away into the binding, its shade cut as lines. */
const gutter = (ctx: CanvasRenderingContext2D) => {
  ctx.save();
  ctx.fillStyle = INK;
  for (let y = SHEET.y; y < PAGE.h; y += 6.5) {
    // This page darkening toward its inner edge, then the crease, then the facing page.
    for (const [x0, x1, flip] of [
      [0, 120, 1],
      [-130, -14, -1],
    ] as const) {
      const steps = 14;
      for (let k = 0; k < steps; k++) {
        const a = x0 + ((x1 - x0) * k) / steps;
        const toward = flip > 0 ? 1 - k / steps : k / steps;
        const t = 0.3 + 3.2 * toward * toward * toward;
        ctx.fillRect(a, y - t / 2, (x1 - x0) / steps + 0.5, t);
      }
    }
  }
  ctx.fillRect(-14, SHEET.y, 14, SHEET.h);
  ctx.restore();
};

/** The wash laid over one line of the phrase, `x0`..`x1`, ragged at its edges, seeded. */
const wash = (
  ctx: CanvasRenderingContext2D,
  x0: number,
  x1: number,
  top: number,
  h: number,
  seed: number,
) => {
  const r = rng(seed);
  ctx.beginPath();
  const step = 16;
  ctx.moveTo(x0, top + r() * 4);
  for (let x = x0 + step; x < x1; x += step) ctx.lineTo(x, top + (r() - 0.5) * 7);
  ctx.lineTo(x1, top + r() * 4);
  ctx.lineTo(x1 + (r() - 0.5) * 8, top + h);
  for (let x = x1 - step; x > x0; x -= step) ctx.lineTo(x, top + h + (r() - 0.5) * 7);
  ctx.lineTo(x0 + (r() - 0.5) * 8, top + h - r() * 4);
  ctx.closePath();
  ctx.fill();
};

/** `b` (in `ctx`'s current space) on the frame: the box round its corners. */
const onFrame = (ctx: CanvasRenderingContext2D, b: Box): Box => {
  const m = ctx.getTransform();
  const xs = [b.x, b.x + b.w].flatMap((x) => [b.y, b.y + b.h].map((y) => m.a * x + m.c * y + m.e));
  const ys = [b.x, b.x + b.w].flatMap((x) => [b.y, b.y + b.h].map((y) => m.b * x + m.d * y + m.f));
  const x0 = Math.min(...xs);
  const y0 = Math.min(...ys);
  return { x: x0, y: y0, w: Math.max(...xs) - x0, h: Math.max(...ys) - y0 };
};

/** The view on the page: the page point at the frame's centre, and how close. */
const VIEW = { x: 545, y: 385, from: 1.62, to: 1.72 } as const;

export const job = (f: JobFrame): Box => {
  const { ctx, w, h } = f;
  let box: Box = { x: 0, y: 0, w: 0, h: 0 };
  ctx.save();
  ctx.translate(w / 2, h / 2 + lerp(34, 0, f.at('page')));
  const z = lerp(VIEW.from, VIEW.to, f.t / f.dur);
  ctx.scale(z, z);
  ctx.translate(-VIEW.x, -VIEW.y);

  ctx.drawImage(paper(SHEET.w, SHEET.h, 23), SHEET.x, SHEET.y, SHEET.w, SHEET.h);
  gutter(ctx);

  // The running head and its rules.
  write(
    ctx,
    'JOB.',
    (PAGE.left + PAGE.right) / 2,
    PAGE.head,
    { family: FACE, size: 26, weight: 500, color: INK, align: 'center', tracking: 0.18 },
    f.hand('head'),
    { boil: 0 },
  );
  ctx.fillStyle = INK;
  ctx.fillRect(PAGE.left, PAGE.head + 20, PAGE.right - PAGE.left, 2.2);
  ctx.fillRect(PAGE.left, PAGE.head + 26, PAGE.right - PAGE.left, 0.8);
  ctx.fillRect(PAGE.rule - 3, PAGE.head + 40, 0.9, PAGE.h - PAGE.head - 200);
  ctx.fillRect(PAGE.rule + 2, PAGE.head + 40, 0.9, PAGE.h - PAGE.head - 200);
  const colW = PAGE.rule - PAGE.gap - PAGE.left;
  write(
    ctx,
    'CHAPTER IX.',
    PAGE.left + colW / 2,
    PAGE.top,
    { family: FACE, size: 27, weight: 500, color: INK, align: 'center', tracking: 0.14 },
    f.hand('chapter'),
    { boil: 0 },
  );

  const set: Set[] = [];
  column(ctx, 0, 6, PAGE.left, colW, PAGE.top + 66, set);
  column(
    ctx,
    6,
    CHAPTER.length,
    PAGE.rule + PAGE.gap,
    PAGE.right - PAGE.rule - PAGE.gap,
    PAGE.top - 22,
    set,
  );

  // The gold wash over the phrase, drawn along it in reading order.
  const runs: Box[] = [];
  for (const s of set) {
    if (!s.phrase) continue;
    const last = runs.at(-1);
    const top = s.y - PAGE.size * 0.8;
    if (last !== undefined && Math.abs(last.y - top) < 1)
      runs[runs.length - 1] = { ...last, w: s.x + s.w - last.x };
    else runs.push({ x: s.x, y: top, w: s.w, h: PAGE.size * 1.08 });
  }
  const pad = 9;
  const total = runs.reduce((sum, r) => sum + r.w + 2 * pad, 0);
  let left = Math.max(0, Math.min(1, f.at('sweep'))) * total;
  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  runs.forEach((r, i) => {
    const len = r.w + 2 * pad;
    const shown = Math.min(len, left);
    left -= len;
    if (shown <= 0) return;
    ctx.save();
    ctx.beginPath();
    ctx.rect(r.x - pad - 6, r.y - 12, shown + 6, r.h + 24);
    ctx.clip();
    ctx.globalAlpha = 0.62;
    ctx.fillStyle = GOLD_WASH;
    wash(ctx, r.x - pad, r.x + r.w + pad, r.y, r.h, 300 + i);
    ctx.globalAlpha = 0.3;
    wash(ctx, r.x - pad + 4, r.x + r.w + pad - 6, r.y + 5, r.h - 12, 400 + i);
    ctx.restore();
  });
  ctx.restore();

  set.forEach((s, i) => write(ctx, s.text, s.x, s.y, s.style, f.hand(`w${i}`), { boil: 0 }));

  const end = runs.at(-1);
  if (end !== undefined)
    box = onFrame(ctx, { x: end.x - pad, y: end.y, w: end.w + 2 * pad, h: end.h });
  ctx.restore();
  return box;
};
