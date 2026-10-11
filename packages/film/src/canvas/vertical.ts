// What a vertical film draws over its picture, whichever kind it is: a short
// cut from a film (`short.ts`) or a talk (`talk.ts`). The hook is one line of
// text (`ShortLook.hook`) set once in its font on the first frame that draws
// it, wrapped to the layout's width and centred as a block on its height,
// shown at once, held and faded out (`hookAlpha`), and recorded as the
// caption's when probed. Positions are in 1080 × 1920 px; a page made at
// another density draws them at `k` page px per px.

import { hookAlpha } from '../core/shorts.ts';
import type { ShortLook } from './film.ts';
import { type Probe, recordText } from './probe.ts';

/** Where a vertical film sets its hook, in 1080 × 1920 px: every line centred on `centre`. */
interface HookLayout {
  readonly centre: number;
  readonly hook: { readonly y: number; readonly width: number };
}

/** A line of set text, measured once: where it sits in 1080 × 1920 px. */
interface SetLine {
  readonly text: string;
  /** Its centre's height. */
  readonly y: number;
  readonly width: number;
}

/** A line's box: its height above and below its centre, in the font it is set in. */
interface LineBox {
  readonly ascent: number;
  readonly descent: number;
}

/** `text` broken into lines at most `width` wide in `ctx`'s font, greedily by word. */
const wrap = (
  ctx: CanvasRenderingContext2D,
  text: string,
  width: number,
): ReadonlyArray<string> => {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(' ')) {
    const next = line === '' ? word : `${line} ${word}`;
    if (line !== '' && ctx.measureText(next).width > width) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line !== '') lines.push(line);
  return lines;
};

/** A block of set text: its lines, and the box each line's glyphs fill. */
interface SetBlock {
  readonly lines: ReadonlyArray<SetLine>;
  readonly box: LineBox;
}

/** `text` set in `font`, wrapped to `width` and centred as a block on `y`: measured once. */
const setBlock = (
  ctx: CanvasRenderingContext2D,
  text: string,
  font: string,
  width: number,
  y: number,
): SetBlock => {
  ctx.save();
  ctx.font = font;
  const m = ctx.measureText('Hg');
  const box = { ascent: m.fontBoundingBoxAscent, descent: m.fontBoundingBoxDescent };
  const step = (box.ascent + box.descent) * 1.08;
  const broken = wrap(ctx, text, width);
  const top = y - ((broken.length - 1) * step) / 2;
  const lines = broken.map((line, i) => ({
    text: line,
    y: top + i * step,
    width: ctx.measureText(line).width,
  }));
  ctx.restore();
  return { lines, box };
};

/** A vertical film's hook, drawn each frame it shows. */
interface VerticalHook {
  /** The hook at film second `T`, while it shows; recorded as the caption's when `probe` is given. */
  readonly draw: (ctx: CanvasRenderingContext2D, T: number, probe: Probe | undefined) => void;
}

/**
 * The hook `text` (none: a film with no hook draws nothing) in `style`, set
 * where `layout` puts it, drawn `k` page px per px.
 */
export const verticalHook = (
  text: string | undefined,
  style: ShortLook['hook'],
  k: number,
  layout: HookLayout,
): VerticalHook => {
  /** The hook, set once on the first frame that draws it. */
  let hook: SetBlock | undefined;
  const hookOf = (ctx: CanvasRenderingContext2D, line: string) =>
    (hook ??= setBlock(ctx, line, style.font, layout.hook.width, layout.hook.y));

  const draw = (ctx: CanvasRenderingContext2D, T: number, probe: Probe | undefined) => {
    const alpha = hookAlpha(T);
    if (text === undefined || alpha <= 0) return;
    const set = hookOf(ctx, text);
    ctx.save();
    ctx.setTransform(k, 0, 0, k, 0, 0);
    ctx.font = style.font;
    ctx.fillStyle = style.color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.globalAlpha = alpha;
    for (const line of set.lines) {
      const baseline = line.y + (set.box.ascent - set.box.descent) / 2;
      ctx.fillText(line.text, layout.centre, baseline);
      if (probe !== undefined)
        recordText(
          ctx,
          probe,
          line.text,
          layout.centre - line.width / 2,
          baseline - set.box.ascent,
          line.width,
          set.box.ascent + set.box.descent,
          alpha,
        );
    }
    ctx.restore();
  };
  return { draw };
};
