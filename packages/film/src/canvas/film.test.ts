// A film's finish and caption plate are data a film declares; a value the
// canvas cannot draw (a zero-sized grain tile, no tiles, an opacity past 1)
// fails where the film is made, naming the field, never at the first frame
// or silently in it. Laying out a film needs no DOM, so bun can make one.

import { describe, expect, test } from 'bun:test';
import { DRIFT } from './camera.ts';
import { type CaptionStyle, type FilmSpec, type FinishStyle, createFilm } from './film.ts';

const spec = (finish: FinishStyle = {}, plate?: Partial<CaptionStyle>): FilmSpec => ({
  title: 'probe',
  paper: { base: '#fff', tone: '#000', seed: 1 },
  shade: '#000',
  scenes: [{ id: 'a', say: 'A line.', draw: () => undefined }],
  finish,
  captions: { font: '10px x', color: '#000', plate: '#fff', ...plate },
});

describe('createFilm finish and caption plate', () => {
  test('takes the defaults and any value the canvas can draw', () => {
    expect(() => createFilm(spec())).not.toThrow();
    expect(() =>
      createFilm(
        spec(
          { vignette: 0, grain: 1, grainSize: 128, grainTiles: 1 },
          { plateOpacity: 1, plateHeight: 0, platePadding: 0, plateRadius: 0, bottom: 0 },
        ),
      ),
    ).not.toThrow();
  });

  test('lays the screen grain as a faint film layer: the paper carries its own grain', () => {
    expect(createFilm(spec()).look.finish.grain).toBe(0.03);
    expect(createFilm(spec({ grain: 0.2 })).look.finish.grain).toBe(0.2);
  });

  test('breathes by DRIFT unless the film sets its own drift, or none', () => {
    expect(createFilm(spec()).drift).toEqual(DRIFT);
    expect(createFilm({ ...spec(), drift: 0 }).drift).toBe(0);
    expect(createFilm({ ...spec(), drift: { zoom: 0.01, x: 8 } }).drift).toEqual({
      zoom: 0.01,
      x: 8,
    });
  });

  test('refuses a drift the camera cannot take', () => {
    expect(() => createFilm({ ...spec(), drift: { zoom: Number.NaN, x: 0 } })).toThrow('zoom');
    expect(() => createFilm({ ...spec(), drift: { zoom: -1, x: 0 } })).toThrow('zoom');
  });

  test.each([
    ['grainSize', { grainSize: 0 }],
    ['grainSize', { grainSize: 12.5 }],
    ['grainTiles', { grainTiles: 0 }],
    ['vignette', { vignette: -0.1 }],
    ['grain', { grain: 1.5 }],
    ['grain', { grain: Number.NaN }],
  ])('refuses a finish whose %s the canvas cannot draw', (field, finish) => {
    expect(() => createFilm(spec(finish))).toThrow(field);
  });

  test.each([
    ['plateOpacity', { plateOpacity: 1.5 }],
    ['plateHeight', { plateHeight: -1 }],
    ['platePadding', { platePadding: Number.POSITIVE_INFINITY }],
    ['plateRadius', { plateRadius: -2 }],
    ['bottom', { bottom: Number.NaN }],
  ])('refuses a caption plate whose %s the canvas cannot draw', (field, plate) => {
    expect(() => createFilm(spec({}, plate))).toThrow(field);
  });
});
