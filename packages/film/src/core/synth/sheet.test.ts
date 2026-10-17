// The sheet on sounds whose picture is known: a tone's row in the
// spectrogram, silence's black, a square wave filling the waveform panel,
// the loudness a tone reads, and the lines at each second and at each mark.
// The panels' rows are the module's layout: the spectrogram 0–399, the
// waveform 404–563, the loudness 568–639.

import { describe, expect, test } from 'bun:test';
import type { Pcm } from '../audio.ts';
import type { Raster } from '../raster.ts';
import { sheetOf } from './sheet.ts';

const RATE = 44100;
const pcmOf = (plane: Float32Array): Pcm => ({
  rate: RATE,
  frames: plane.length,
  channels: [plane],
});
const sine = (hz: number, secs: number, amplitude: number) =>
  Float32Array.from(
    { length: Math.round(secs * RATE) },
    (_, i) => amplitude * Math.sin((2 * Math.PI * hz * i) / RATE),
  );

const pixel = (raster: Raster, x: number, y: number) => {
  const i = (y * raster.width + x) * 4;
  return [raster.rgba[i], raster.rgba[i + 1], raster.rgba[i + 2]];
};
const brightness = (raster: Raster, x: number, y: number) =>
  pixel(raster, x, y).reduce((sum: number, v) => sum + (v ?? 0), 0);
/** The rows of column `x` from `top` to `bottom` (exclusive) that are not `colour`. */
const rowsNot = (
  raster: Raster,
  x: number,
  top: number,
  bottom: number,
  colour: ReadonlyArray<number>,
) =>
  Array.from({ length: bottom - top }, (_, k) => top + k).filter(
    (y) => pixel(raster, x, y).join() !== colour.join(),
  );

const QUIETEST = [0, 0, 4];
const PANEL = [14, 14, 18];
const FAINT = [52, 52, 62];

describe('sheetOf', () => {
  const tone = sheetOf(pcmOf(sine(1000, 1, 0.5)), []);

  test('is 1200 by 640 pixels, four bytes each', () => {
    expect([tone.width, tone.height, tone.rgba.length]).toEqual([1200, 640, 1200 * 640 * 4]);
  });

  test("a tone is brightest on its own row of the spectrogram's log scale, and dark far from it", () => {
    const rows = Array.from({ length: 400 }, (_, y) => y);
    const brightest = rows.reduce((best, y) =>
      brightness(tone, 600, y) > brightness(tone, 600, best) ? y : best,
    );
    // 1 kHz is ln(1000/30)/ln(16000/30) of the way up from 30 Hz: row 399 − ⌊0.558 · 400⌋.
    expect(Math.abs(brightest - 176)).toBeLessThanOrEqual(2);
    // −6 dB is near the loud end of the heat; 100 Hz, a decade below, reads the floor.
    expect(pixel(tone, 600, brightest)[0]).toBeGreaterThan(240);
    const hundred = 399 - Math.floor((Math.log(100 / 30) / Math.log(16000 / 30)) * 400);
    expect(pixel(tone, 600, hundred)).toEqual(QUIETEST);
  });

  test('silence is the quietest colour throughout, a flat waveform and no loudness', () => {
    const quiet = sheetOf(pcmOf(new Float32Array(RATE)), []);
    for (const x of [0, 600, 1199]) {
      expect(rowsNot(quiet, x, 0, 400, QUIETEST)).toEqual([]);
      expect(rowsNot(quiet, x, 404, 564, PANEL)).toEqual([484]);
      expect(pixel(quiet, x, 484)).toEqual([150, 196, 255]);
      expect(
        rowsNot(quiet, x, 568, 640, PANEL).every((y) => pixel(quiet, x, y).join() === FAINT.join()),
      ).toBe(true);
    }
  });

  test('a full-scale square fills the waveform panel from edge to edge', () => {
    const square = sheetOf(
      pcmOf(Float32Array.from({ length: RATE }, (_, i) => (Math.floor(i / 50) % 2 === 0 ? 1 : -1))),
      [],
    );
    expect(rowsNot(square, 300, 404, 564, [150, 196, 255])).toEqual([]);
  });

  test("a tone's loudness sits where its LUFS falls on the panel's scale", () => {
    // A 1 kHz sine at half scale measures about −9.7 LUFS: 9.7/70 of the way down 71 rows.
    const lit = rowsNot(tone, 600, 568, 640, PANEL).filter(
      (y) => pixel(tone, 600, y).join() === [255, 206, 84].join(),
    );
    expect(lit.length).toBeGreaterThan(0);
    expect(Math.abs((lit[0] ?? 0) - (568 + Math.round((9.7 / 70) * 71)))).toBeLessThanOrEqual(1);
  });

  test('a click at the very start lights its column as brightly as the same click in the middle', () => {
    const plane = new Float32Array(RATE);
    const click = sine(4000, 0.003, 0.5);
    plane.set(click, 0);
    plane.set(click, RATE / 2);
    const clicked = sheetOf(pcmOf(plane), []);
    // 4 kHz is ln(4000/30)/ln(16000/30) of the way up from 30 Hz: row 399 − ⌊0.780 · 400⌋.
    const row = 399 - Math.floor((Math.log(4000 / 30) / Math.log(16000 / 30)) * 400);
    expect(brightness(clicked, 600, row)).toBeGreaterThan(300);
    expect(Math.abs(brightness(clicked, 0, row) - brightness(clicked, 600, row))).toBeLessThan(40);
  });

  // One sheet a test: a CI runner draws them 17–50 times as slow as a laptop.
  test('a faint line crosses each second, and a hit its own colour through every panel, over a mark given before it', () => {
    const marked = sheetOf(pcmOf(sine(440, 2, 0.25)), [
      { kind: 'onset', at: 0.5 },
      { kind: 'hit', at: 1.5 },
      { kind: 'hit', at: 0.5 },
    ]);
    // The second falls on column 600 of a two-second sheet: lighter than its neighbour in the gap rows.
    expect(brightness(marked, 600, 402)).toBeGreaterThan(brightness(marked, 599, 402));
    for (const y of [0, 200, 402, 500, 600])
      expect([pixel(marked, 300, y), pixel(marked, 900, y)]).toEqual([
        [255, 84, 84],
        [255, 84, 84],
      ]);
  });

  test('an onset is marked its own colour', () => {
    const onsetOnly = sheetOf(pcmOf(sine(440, 2, 0.25)), [{ kind: 'onset', at: 0.5 }]);
    expect(pixel(onsetOnly, 300, 402)).toEqual([84, 222, 120]);
  });

  test('a loop point is marked its own colour', () => {
    const looped = sheetOf(pcmOf(sine(440, 2, 0.25)), [{ kind: 'loop', at: 1.5 }]);
    expect(pixel(looped, 900, 402)).toEqual([84, 206, 255]);
  });
});
