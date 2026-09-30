// The look-book: one sheet that shows a whole film's look before (or while)
// its scenes are built. Each scene is a row of stills at every named cue's
// start and end and at its 60% point (`sceneMoments`, the moments `film
// check` probes, less the marks), each labelled, under the film's palette as
// swatches. The page composes it with `film.render`, so the lab shows it live
// (`?film=…&lookbook`, linked from the lab) and `film lookbook` asks an export page for the
// same sheet (`ExportHandle.lookbook`) and writes it to `out/<film>/lookbook.jpg`.
// It is set in the film's own type: its shorts' hook face for the title, their
// caption face for the rest (`film.look.short`), so the engine names no family.

import type { Film } from '../canvas/film.ts';
import { type SceneMoment, sceneMoments } from '../core/moments.ts';
import { labUrl } from './pages.ts';

/** Stills across a row. */
const COLS = 6;
const TILE_W = 320;
const TILE_H = 180;
const LABEL_H = 30;
const GAP = 12;
const PAD = 28;
const SCENE_H = 40;
const SWATCH = 56;
const SWATCH_W = 132;
const SWATCH_H = SWATCH + 44;
const HEADER_H = 64;

/** Chromium's largest canvas side: a canvas past it is never backed and encodes to nothing. */
const CANVAS_SIDE = 32_767;

const INK = '#efe6d4';
const MUTED = '#9d927f';
const PAGE = '#16130f';

/** A still on the sheet: where it sits and the frame it shows. */
export interface Tile {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly moment: SceneMoment;
}

/** A composed look-book: the sheet and where each still sits on it, in the sheet's px. */
export interface Lookbook {
  readonly canvas: HTMLCanvasElement;
  readonly tiles: ReadonlyArray<Tile>;
}

/** Cut `text` with an ellipsis to fit `width` in the context's font. */
const fit = (ctx: CanvasRenderingContext2D, text: string, width: number) => {
  if (ctx.measureText(text).width <= width) return text;
  let cut = text;
  while (cut.length > 1 && ctx.measureText(`${cut}…`).width > width) cut = cut.slice(0, -1);
  return `${cut}…`;
};

/** The family of a CSS font (`600 64px "Fraunces"` → `"Fraunces"`): what follows its size. */
export const familyOf = (font: string): string =>
  /\d(?:px|pt|em|rem|%)(?:\/\S+)?\s+(.+)$/.exec(font)?.[1] ?? 'sans-serif';

/** `cue topple start` reads as `topple ▸`, `cue topple end` as `topple ◂`. */
const labelOf = (at: string) =>
  at
    .split(', ')
    .map((part) => part.replace(/^cue (.+) start$/, '$1 ▸').replace(/^cue (.+) end$/, '$1 ◂'))
    .join(' · ');

/**
 * Compose the look-book of `film`. Draws every still with `film.render` into
 * one full-size frame, then scales it onto the sheet; `onProgress` hears each
 * still as it lands, and the page gets a turn between stills. A sheet laid
 * out taller or wider than `CANVAS_SIDE` is drawn scaled down to fit it, so a
 * long film's sheet is smaller rather than blank.
 */
export const composeLookbook = async (
  film: Film,
  options: { readonly captions: boolean; readonly onProgress?: (done: number, of: number) => void },
): Promise<Lookbook> => {
  const moments = sceneMoments(film.placed, film.fps, { marks: false });
  const swatches = Object.entries(film.palette);
  const width = PAD * 2 + COLS * TILE_W + (COLS - 1) * GAP;
  const perRow = Math.max(1, Math.floor((width - PAD * 2) / SWATCH_W));
  const swatchRows = Math.ceil(swatches.length / perRow);
  const top = PAD + HEADER_H + swatchRows * SWATCH_H + (swatchRows > 0 ? GAP : 0);

  // Where each scene's row starts, and each still in it.
  const tiles: Tile[] = [];
  const heads: Array<{ readonly y: number; readonly text: string }> = [];
  let y = top;
  for (const p of film.placed) {
    const mine = moments.filter((m) => m.scene === p.spec.id);
    heads.push({
      y,
      text: `${p.index + 1}. ${p.spec.id} · ${p.start.toFixed(2)}–${(p.start + p.dur).toFixed(2)} s`,
    });
    y += SCENE_H;
    mine.forEach((moment, k) => {
      const col = k % COLS;
      const row = Math.floor(k / COLS);
      tiles.push({
        x: PAD + col * (TILE_W + GAP),
        y: y + row * (TILE_H + LABEL_H + GAP),
        w: TILE_W,
        h: TILE_H,
        moment,
      });
    });
    y += Math.ceil(mine.length / COLS) * (TILE_H + LABEL_H + GAP) + GAP;
  }

  const height = y + PAD;
  const scale = Math.min(1, CANVAS_SIDE / width, CANVAS_SIDE / height);
  const canvas = document.createElement('canvas');
  canvas.width = Math.floor(width * scale);
  canvas.height = Math.floor(height * scale);
  const ctx = canvas.getContext('2d');
  if (ctx === null) throw new Error('2d context unavailable');
  ctx.scale(scale, scale);
  ctx.fillStyle = PAGE;
  ctx.fillRect(0, 0, width, height);
  const display = familyOf(film.look.short.hook.font);
  const body = familyOf(film.look.short.caption.font);

  // The title, and what the sheet shows.
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = INK;
  ctx.font = `700 34px ${display}`;
  ctx.fillText(film.title, PAD, PAD + 34);
  ctx.fillStyle = MUTED;
  ctx.font = `400 16px ${body}`;
  ctx.fillText(
    `Look-book · ${film.placed.length} scenes · ${tiles.length} stills at each cue's start (▸) and end (◂) and each scene's 60% point · ${film.duration.toFixed(1)} s`,
    PAD,
    PAD + 58,
  );

  // The palette.
  swatches.forEach(([name, color], k) => {
    const sx = PAD + (k % perRow) * SWATCH_W;
    const sy = PAD + HEADER_H + Math.floor(k / perRow) * SWATCH_H;
    ctx.fillStyle = color;
    ctx.fillRect(sx, sy, SWATCH, SWATCH);
    ctx.strokeStyle = 'rgb(255 255 255 / 0.18)';
    ctx.strokeRect(sx + 0.5, sy + 0.5, SWATCH - 1, SWATCH - 1);
    ctx.fillStyle = INK;
    ctx.font = `600 14px ${body}`;
    ctx.fillText(fit(ctx, name, SWATCH_W - 8), sx, sy + SWATCH + 18);
    ctx.fillStyle = MUTED;
    ctx.font = `400 13px ${body}`;
    ctx.fillText(color, sx, sy + SWATCH + 35);
  });

  for (const head of heads) {
    ctx.fillStyle = INK;
    ctx.font = `600 20px ${body}`;
    ctx.fillText(head.text, PAD, head.y + 26);
  }

  // The stills: each drawn full size, then scaled onto its tile.
  const frame = document.createElement('canvas');
  frame.width = film.width;
  frame.height = film.height;
  const fctx = frame.getContext('2d');
  if (fctx === null) throw new Error('2d context unavailable');
  const draw = (tile: Tile, k: number) => {
    film.render(fctx, tile.moment.time, { captions: options.captions });
    ctx.drawImage(frame, tile.x, tile.y, tile.w, tile.h);
    ctx.fillStyle = INK;
    ctx.font = `500 15px ${body}`;
    ctx.fillText(fit(ctx, labelOf(tile.moment.at), tile.w - 70), tile.x, tile.y + tile.h + 21);
    ctx.fillStyle = MUTED;
    ctx.font = `400 14px ${body}`;
    ctx.textAlign = 'right';
    ctx.fillText(`${tile.moment.time.toFixed(2)} s`, tile.x + tile.w, tile.y + tile.h + 21);
    ctx.textAlign = 'left';
    options.onProgress?.(k + 1, tiles.length);
  };
  // One still at a time, the page getting a turn between them.
  await tiles.reduce(
    (before, tile, k) =>
      before.then(() => {
        draw(tile, k);
        return new Promise<void>((resolve) => setTimeout(resolve, 0));
      }),
    Promise.resolve(),
  );
  return {
    canvas,
    tiles: tiles.map((t) => ({
      ...t,
      x: t.x * scale,
      y: t.y * scale,
      w: t.w * scale,
      h: t.h * scale,
    })),
  };
};

/**
 * The lab's look-book page (`?film=…&lookbook`): the sheet, composed live
 * from the code as it is now; a still opens that frame in the lab.
 */
export const mountLookbook = (film: Film, name: string, captions: boolean): void => {
  document.body.classList.add('lookbook');
  const bar = document.createElement('header');
  bar.className = 'lookbook-bar';
  const lab = labUrl(name);
  bar.innerHTML = `<strong>Look-book</strong> <span class="lookbook-status">composing…</span>
    <a href="${lab}">back to the lab</a>`;
  const status = bar.querySelector<HTMLSpanElement>('.lookbook-status');
  const sheet = document.createElement('div');
  sheet.className = 'lookbook-sheet';
  document.body.replaceChildren(bar, sheet);
  const say = (text: string) => {
    if (status !== null) status.textContent = text;
  };
  composeLookbook(film, {
    captions,
    onProgress: (done, of) => say(`composing… ${done}/${of}`),
  })
    .then(({ canvas, tiles }) => {
      say(`${tiles.length} stills · click one to open that frame in the lab`);
      sheet.append(canvas);
      canvas.addEventListener('click', (e) => {
        const r = canvas.getBoundingClientRect();
        const x = ((e.clientX - r.left) / r.width) * canvas.width;
        const y = ((e.clientY - r.top) / r.height) * canvas.height;
        const hit = tiles.find((t) => x >= t.x && x <= t.x + t.w && y >= t.y && y <= t.y + t.h);
        if (hit !== undefined) location.href = `${lab}#${hit.moment.time.toFixed(2)}`;
      });
    })
    .catch((e: unknown) => say(`failed: ${String(e)}`));
};
