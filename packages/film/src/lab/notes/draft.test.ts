// A note's draft and where it sits, pure: the scene and timecode of the
// moment noted, with the cue edge and mark nearest it; the draft carries
// the box and the ink only when there are any; its scope (the cue selected,
// the in and out points cut to its scene) as its chip says it and as the
// draft carries it, and nothing once cleared; and a pointer's place on the
// frame in film pixels.

import { Option, Schema } from 'effect';
import { describe, expect, test } from 'effect-bun-test';
import { NoteDraft } from '../../core/schema.ts';
import { probeFilm } from '../fixtures/probe-film.ts';
import {
  NO_SCOPE,
  type Scope,
  boxOf,
  draftOf,
  filmPixel,
  scopeText,
  whenText,
  whereText,
} from './draft.ts';

const film = probeFilm();

describe('where a note sits', () => {
  test('names the scene and the timecode, with the nearest cue edge', () => {
    const where = whereText(film.placed, film.fps, 1);
    expect(where.startsWith('one · 00:00:01:00 · ')).toBe(true);
    expect(where).toContain('cue ');
  });

  test('names the mark nearest it', () => {
    expect(whereText(film.placed, film.fps, 1)).toMatch(/ · \{\w+\}$/);
  });

  test("speaks the scene's time beside the scene's name, never the film's", () => {
    const two = film.placed[1]?.start ?? 0;
    expect(whereText(film.placed, film.fps, two + 0.5).startsWith('two · 00:00:00:15')).toBe(true);
  });

  test("a made note says its time into its scene now, or the film's, named, once its scene is gone", () => {
    expect(whenText(film.placed, film.fps, { scene: 'two', T: 0.5, local: 0.4 })).toBe(
      '00:00:00:12',
    );
    expect(whenText(film.placed, film.fps, { scene: 'gone', T: 2, local: 0.4 })).toBe(
      'film 00:00:02:00',
    );
  });
});

describe('the draft', () => {
  test('a point or a box goes with the draft; no ink leaves ink out', () => {
    const draft = draftOf(film.placed, film.fps, {
      T: 1,
      box: Option.some({ x: 5, y: 6, w: 0, h: 0 }),
      ink: [],
      text: '  too early ',
    });
    expect(Option.map(draft, (d) => [d.scene, d.T, d.frame, d.text, d.box, 'ink' in d])).toEqual(
      Option.some(['one', 1, 30, 'too early', { x: 5, y: 6, w: 0, h: 0 }, false]),
    );
  });

  test('ink goes with the draft; no box leaves the box out', () => {
    const draft = draftOf(film.placed, film.fps, {
      T: 1,
      box: Option.none(),
      ink: [
        [
          [1, 2],
          [3, 4],
        ],
      ],
      text: 'this arc',
    });
    expect(Option.map(draft, (d) => ['box' in d, d.ink])).toEqual(
      Option.some([
        false,
        [
          [
            [1, 2],
            [3, 4],
          ],
        ],
      ]),
    );
  });

  test('the draft says how far into its scene it was made', () => {
    const two = film.placed[1];
    const T = (two?.start ?? 0) + 0.4;
    const draft = draftOf(film.placed, film.fps, {
      T,
      box: Option.none(),
      ink: [],
      text: 'later in two',
    });
    expect(Option.map(draft, (d) => [d.scene, d.T])).toEqual(Option.some(['two', T]));
    expect(Option.getOrThrow(draft).local).toBeCloseTo(0.4, 9);
  });

  test('a draft at a scene start reached by frame steps is a draft the server takes', () => {
    const T = (film.placed[1]?.start ?? 0) - 1e-14;
    const draft = Option.getOrThrow(
      draftOf(film.placed, film.fps, { T, box: Option.none(), ink: [], text: 'at the cut' }),
    );
    expect(Schema.is(NoteDraft)(draft)).toBe(true);
  });

  test('an empty note is no draft', () => {
    expect(
      draftOf(film.placed, film.fps, { T: 1, box: Option.none(), ink: [], text: '   ' }),
    ).toEqual(Option.none());
  });
});

describe('the scope', () => {
  const composed = { T: 1.5, box: Option.none(), ink: [], text: 'too slow' };
  const scope: Scope = {
    cue: Option.some({ scene: 'one', name: 'fall' }),
    range: Option.some({ from: 1.2, to: 6 }),
  };

  test('its chip names the scene, the cue selected and the range in timecode', () => {
    expect(scopeText(film.placed, scope, film.fps, 1.5)).toEqual(
      Option.some('one · fall · 00:00:01:06–00:00:04:21'),
    );
    expect(scopeText(film.placed, { ...scope, range: Option.none() }, film.fps, 1.5)).toEqual(
      Option.some('one · fall'),
    );
    expect(scopeText(film.placed, NO_SCOPE, film.fps, 1.5)).toEqual(Option.none());
  });

  test('a cue or a range of another scene is no scope of a note in this one', () => {
    const elsewhere: Scope = {
      cue: Option.some({ scene: 'two', name: 'fall' }),
      range: Option.some({ from: 9, to: 10 }),
    };
    expect(scopeText(film.placed, elsewhere, film.fps, 1.5)).toEqual(Option.none());
  });

  test('the draft carries the selected cue’s nearer edge and the range cut to its scene', () => {
    const draft = Option.getOrThrow(draftOf(film.placed, film.fps, composed, scope));
    expect(draft.cue).toEqual({ name: 'fall', edge: 'start' });
    expect(draft.range?.from).toBeCloseTo(1.2, 9);
    expect(draft.range?.to).toBeCloseTo(4.715, 9);
    expect(Schema.is(NoteDraft)(draft)).toBe(true);
  });

  test('cleared, the draft names the nearest cue edge and no range, as before', () => {
    const draft = Option.getOrThrow(draftOf(film.placed, film.fps, composed, NO_SCOPE));
    expect(draft.cue).toEqual({ name: 'rise', edge: 'start' });
    expect('range' in draft).toBe(false);
  });
});

describe('pixels', () => {
  test("a pointer's place on the frame, in film pixels", () => {
    const frame = { left: 100, top: 50, width: 320, height: 180 };
    expect(filmPixel(frame, { width: 640, height: 360 }, 260, 140)).toEqual([320, 180]);
  });

  test('a box from where a drag began to where it is, either way', () => {
    expect(boxOf([300, 200], [100, 120])).toEqual({ x: 100, y: 120, w: 200, h: 80 });
    expect(boxOf([10, 10], [10, 10])).toEqual({ x: 10, y: 10, w: 0, h: 0 });
  });
});
