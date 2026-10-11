// A look drawn in 3D asks for a WebGL 2 canvas (`glCanvas`); where none can
// be made, as in the stand-in `check --draw` and the framework's tests draw
// into, it is told so instead of driving a 2D recorder as a GL context, and a
// film whose scene draws in 3D still draws every frame without throwing.

import { expect, test } from 'bun:test';
import { createFilm, drawing } from './film.ts';
import { recorder, withDom } from './fixtures/stand-in.ts';
import { glCanvas } from './gl.ts';

test('a 3D canvas is none where the context cannot make WebGL 2, and the 2D context stays', () => {
  withDom(
    () => {
      expect(glCanvas('probe', 320, 240)).toBeUndefined();
      const c = document.createElement('canvas');
      expect(c.getContext('webgl2')).toBeNull();
      expect(c.getContext('2d')).not.toBeNull();
    },
    { record: false },
  );
});

test('a scene drawn in 3D falls back in the stand-in, every frame drawn', () => {
  const fell: number[] = [];
  const scene = drawing({
    timeline: {},
    draw: (f) => {
      const gl = glCanvas('scene', 320, 180);
      if (gl === undefined) fell.push(f.t);
      else f.ctx.drawImage(gl.canvas, 0, 0, f.w, f.h);
    },
  });
  const film = createFilm({
    title: 'gl',
    paper: { base: '#fff', tone: '#000', seed: 1 },
    shade: '#000',
    scenes: [{ id: 'a', say: 'A line in three dimensions.', ...scene }],
  });
  withDom(
    () => {
      for (const T of [0, 0.5, 1, 1.5]) film.render(recorder().ctx, T);
    },
    { record: false },
  );
  expect(fell.length).toBeGreaterThanOrEqual(4);
});
