// A film's finish and caption plate are data a film declares; a value the
// canvas cannot draw (a zero-sized grain tile, no tiles, an opacity past 1)
// fails where the film is made, naming the field, never at the first frame
// or silently in it. Laying out a film needs no DOM, so bun can make one.

import { describe, expect, test } from 'bun:test';
import type { Drift } from './camera.ts';
import { type CaptionStyle, type FilmSpec, type FinishStyle, createFilm } from './film.ts';
import { recorder, withDom } from './fixtures/stand-in.ts';

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

  test("takes a scene's own drift, or none, and refuses one the camera cannot take", () => {
    const drifting = (drift: Drift | 0): FilmSpec => ({
      ...spec(),
      scenes: [{ id: 'a', say: 'A line.', draw: () => undefined, drift }],
    });
    expect(() => createFilm(drifting(0))).not.toThrow();
    expect(() => createFilm(drifting({ zoom: 0.01, x: 8 }))).not.toThrow();
    expect(() => createFilm(drifting({ zoom: Number.NaN, x: 0 }))).toThrow('zoom');
    expect(() => createFilm(drifting({ zoom: -1, x: 0 }))).toThrow('zoom');
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

describe('an edit is a value a frame draws with', () => {
  /** A film whose one scene reads knob `x` and cue `go`, logging what each frame saw. */
  const seeing = () => {
    const seen: Array<readonly [unknown, number]> = [];
    const film = createFilm({
      ...spec(),
      scenes: [
        {
          id: 'a',
          say: 'A line.',
          min: 4,
          knobs: { x: 3 },
          timeline: { go: { at: 'start', dur: 2 } },
          draw: (f) => {
            seen.push([f.knob('x'), f.at('go')]);
          },
        },
      ],
    });
    return { film, seen };
  };
  const edit = { knobs: { x: 7 }, timeline: { go: { at: 'start' as const, dur: 1 } } };

  test('draws the edit it is handed, and the frame after with none draws the scene as declared', () => {
    const { film, seen } = seeing();
    withDom(
      () => {
        film.render(recorder().ctx, 0.5);
        film.render(recorder().ctx, 0.5, { edits: new Map([['a', edit]]) });
        film.render(recorder().ctx, 0.5);
      },
      { record: false },
    );
    const [declared, edited, after] = seen.slice(-3);
    // Half of the edit's one-second cue, eased; a quarter of the declared two.
    expect(edited).toEqual([7, 0.5]);
    expect(declared?.[0]).toBe(3);
    expect(declared?.[1]).toBeLessThan(0.5);
    expect(after).toEqual(declared);
  });

  test("a scene's cues with an edit, and as laid out without one", () => {
    const { film } = seeing();
    expect(film.cuesOf('a', edit).get('go')).toMatchObject({ start: 0, end: 1 });
    expect(film.cuesOf('a').get('go')).toMatchObject({ start: 0, end: 2 });
  });
});
