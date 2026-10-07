// The player's DOM helpers: a child the markup must have, a page's failure in
// its place, bytes or a canvas as base64, and a canvas's luma.

import type { LumaArea } from '../core/export-handle.ts';

/** The element `sel` finds under `root`: markup the caller wrote, so a missing one is a bug. */
export const required = <T extends Element>(root: ParentNode, sel: string): T => {
  const found = root.querySelector<T>(sel);
  if (found === null) throw new Error(`missing ${sel}`);
  return found;
};

/**
 * A page that could not start: the error, in place of the page, as text (an
 * error's words may hold markup, a film's name from the URL among them). The
 * render page says it here (`render.ts`); a studio page says it only as it
 * ends (`PageEnd.fail`, lab/page-client.tsx), so nothing of it runs on
 * behind the words.
 */
export const showFailure = (e: unknown): void => {
  const shown = document.createElement('pre');
  shown.style.cssText = 'color:var(--state-findings);padding:24px;white-space:pre-wrap';
  shown.textContent = String(e instanceof Error ? (e.stack ?? e.message) : e);
  document.body.replaceChildren(shown);
};

/** Bytes as base64: what the export handle hands back across `page.evaluate`. */
export const bytesBase64 = (bytes: Uint8Array): string => bytes.toBase64();

/** A canvas as base64 PNG or JPEG (JPEG at quality 0.95; PNG is lossless). */
export const canvasBase64 = async (
  canvas: HTMLCanvasElement,
  type: 'image/png' | 'image/jpeg',
): Promise<string> => {
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, type, 0.95));
  if (blob === null) throw new Error('toBlob failed');
  return bytesBase64(new Uint8Array(await blob.arrayBuffer()));
};

/**
 * The luma (Rec. 709, 0–255) of `area` of `canvas`, scaled down to its grid
 * by the browser's own resize, row by row. No 2D context to read it back on:
 * an empty read, which the tools refuse as a failed frame.
 */
export const canvasLuma = async (
  canvas: HTMLCanvasElement,
  area: LumaArea,
): Promise<ReadonlyArray<number>> => {
  const bitmap = await createImageBitmap(canvas, area.x, area.y, area.w, area.h, {
    resizeWidth: area.cols,
    resizeHeight: area.rows,
    resizeQuality: 'medium',
  });
  const ctx = new OffscreenCanvas(area.cols, area.rows).getContext('2d');
  if (ctx === null) return [];
  ctx.drawImage(bitmap, 0, 0);
  const d = ctx.getImageData(0, 0, area.cols, area.rows).data;
  const out: number[] = [];
  for (let i = 0; i < d.length; i += 4)
    out.push(0.2126 * (d[i] ?? 0) + 0.7152 * (d[i + 1] ?? 0) + 0.0722 * (d[i + 2] ?? 0));
  return out;
};
