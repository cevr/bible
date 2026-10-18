// A cast sheet try normalised as the trace will make it: each view cut from
// the sheet, drawn at one head height, and a standing view's body under the
// chin drawn to the canon (3.36 heads) with its head held, so the ask shows
// what a keep sets, never the painting's own height. The views stand side
// by side, their tops on one row, with the canon's band across them: the top
// of the head, the chin and the soles. A view whose head does not read is
// drawn at its height's share of the anchor's head; a heads sheet, and a
// view that does not stand (lying, crouching), only at one head height.
// Under headgear the head reads the face opening, whose top is not the
// view's, so no body is drawn to the canon there either (the canon is read
// on the lock). Pure.

import { Array as Arr, Option } from 'effect';
import { CANON_HEADS, type SheetMeasure, type SheetOptions, standingOf } from './cast-sheet.ts';
import {
  besideRaster,
  cropRaster,
  type Raster,
  type RasterPath,
  scaleRaster,
  stackRaster,
  strokeRaster,
  stretchRaster,
} from './raster.ts';

/** The head height every view is drawn at, in pixels. */
const PREVIEW_HEAD = 120;
/** The space round and between the views. */
const GAP = 24;
const BAND: readonly [number, number, number] = [0, 170, 90];

type View = SheetMeasure['views'][number];

/** A view's head in the sheet's pixels: its own, else the anchor's by its height, else its height over the canon. */
const headOf = (v: View, anchor: Option.Option<View>): number =>
  Option.getOrElse(Option.fromUndefinedOr(v.head), () =>
    Option.getOrElse(
      Option.flatMap(anchor, (a) =>
        Option.map(Option.fromUndefinedOr(a.head), (head) => (head * v.height) / a.height),
      ),
      () => v.height / CANON_HEADS,
    ),
  );

/** One view drawn at `head` pixels a head, its body under the chin to the canon when it stands. */
const normalised = (sheet: Raster, v: View, headPx: number, stands: boolean): Raster => {
  const [x0, y0, x1, y1] = v.box;
  const f = PREVIEW_HEAD / headPx;
  const chin = Math.min(y1 - 1, y0 + headPx);
  if (!stands || chin >= y1 - 1) return scaleRaster(cropRaster(sheet, v.box), f);
  const body = (CANON_HEADS - 1) * PREVIEW_HEAD;
  return stackRaster([
    scaleRaster(cropRaster(sheet, [x0, y0, x1, chin]), f),
    stretchRaster(cropRaster(sheet, [x0, chin, x1, y1]), f, body / (y1 - chin)),
  ]);
};

/** The try `sheet`, measured as `m` under `options`, each view normalised as the trace will make it, the canon's band across. */
export const sheetPreview = (sheet: Raster, m: SheetMeasure, options: SheetOptions): Raster => {
  const anchor = Arr.get(m.views, m.anchor - 1);
  const standing = standingOf(options, m.views);
  const bodies = m.kind !== 'heads';
  const traced = bodies && options.headgear !== true;
  const row = besideRaster(
    m.views.map((v) => ({
      raster: normalised(sheet, v, headOf(v, anchor), traced && standing.includes(v.view)),
      top: 0,
    })),
    GAP,
  );
  const across = (y: number): RasterPath => ({
    points: [
      [0, y],
      [row.width, y],
    ],
    closed: false,
  });
  const band = [GAP, GAP + PREVIEW_HEAD, ...((traced && [GAP + CANON_HEADS * PREVIEW_HEAD]) || [])];
  return strokeRaster(row, band.map(across), BAND, 2);
};
