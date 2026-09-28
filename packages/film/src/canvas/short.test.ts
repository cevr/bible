// A short's page is a film the player and the export serve unchanged: 9:16 at
// the film's density, as long as its spans, each scene on the short's clock
// with its own clock intact. Spans the film cannot resolve fail at load.
// Making the page needs no DOM, so bun can make one.

import { describe, expect, test } from 'bun:test';
import { Effect } from 'effect';
import { type FilmSpec, createFilm } from './film.ts';
import { bandOf, createShort, shortPages } from './short.ts';

const draw = () => {};
const spec: FilmSpec = {
  title: 'probe',
  paper: { base: '#fff', tone: '#000', seed: 1 },
  shade: '#000',
  scenes: [
    { id: 'a', say: 'One two {three}three four {five}five six.', draw },
    { id: 'b', say: 'Seven {eight}eight nine ten.', draw },
  ],
};
const film = createFilm(spec);

describe('createShort', () => {
  test('is 9:16 at the film density, as long as its spans, on the film fps', () => {
    const short = createShort(film, {
      id: 'cut',
      title: 'A cut',
      spans: [
        { scene: 'b', from: { mark: 'eight' }, to: { scene: 'speechEnd' } },
        { scene: 'a', from: { mark: 'three' }, to: { mark: 'five' } },
      ],
    });
    expect([short.width, short.height, short.fps]).toEqual([1920, 3414, film.fps]);
    expect(short.title).toBe('A cut');
    expect(short.audio).toBeUndefined();
    const [b, a] = short.placed;
    const [fb, fa] = [film.placed[1], film.placed[0]];
    // Each scene's own clock reads the same: short time minus its start is scene time.
    const eight = (fb?.speechStart ?? NaN) + (fb?.voice.marks.get('eight') ?? NaN);
    expect(b?.start).toBeCloseTo(
      -Math.round(((fb?.start ?? NaN) + eight) * 30) / 30 + (fb?.start ?? NaN),
      9,
    );
    expect(short.sceneAt(0).spec.id).toBe('b');
    expect(short.sceneAt(short.duration - 1e-6).spec.id).toBe('a');
    expect(a?.index).toBe(1);
    expect(fa?.spec.id).toBe('a');
    expect(short.duration).toBeGreaterThan(0);
  });

  test('a span the film cannot resolve fails at load, naming it', () => {
    expect(() =>
      createShort(film, {
        id: 'cut',
        title: 'A cut',
        spans: [{ scene: 'a', from: { mark: 'nope' }, to: { scene: 'end' } }],
      }),
    ).toThrow('has no mark {nope}');
  });

  test('the band is the film frame, centred on whole pixel rows', () => {
    expect(bandOf(film, 3414)).toEqual({ top: 1167, width: 1920, height: 1080 });
  });

  test('each short is a page under <film>/shorts/<id>', () => {
    const pages = shortPages('probe', () => Effect.runPromise(Effect.succeed(film)), [
      {
        id: 'one',
        title: 'One',
        spans: [{ scene: 'a', from: { scene: 'start' }, to: { scene: 'end' } }],
      },
    ]);
    expect(Object.keys(pages)).toEqual(['probe/shorts/one']);
    return expect(pages['probe/shorts/one']?.()).resolves.toMatchObject({ title: 'One' });
  });
});
