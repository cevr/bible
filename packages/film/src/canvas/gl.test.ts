// A look drawn in 3D asks for a WebGL 2 canvas (`glCanvas`); where none can
// be made, as in the stand-in `check --draw` and the framework's tests draw
// into, it is told so instead of driving a 2D recorder as a GL context, and a
// film whose scene draws in 3D still draws every frame without throwing. Where
// one can be made, a lost context is made anew, a failure is asked again, and
// only a few canvases stay live: the page's, a rig's held among the keys'.

import { expect, test } from 'bun:test';
import { Effect, Schema } from 'effect';
import { createFilm, drawing } from './film.ts';
import { recorder, withDom } from './fixtures/stand-in.ts';
import { dropGl, glCanvas, holdGl } from './gl.ts';

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
  const times = [0, 0.5, 1, 1.5];
  withDom(
    () => {
      for (const T of times) film.render(recorder().ctx, T);
    },
    { record: false },
  );
  // A frame may draw twice (`sheet`'s second guess): each time fell back at least once.
  expect([...new Set(fell)].toSorted((x, y) => x - y)).toEqual(times);
});

/** A WebGL 2 context's stand-in: lost when told, or when let go. */
interface FakeGl {
  readonly id: number;
  lost: boolean;
  readonly createVertexArray: () => void;
  readonly isContextLost: () => boolean;
  readonly getExtension: (name: string) => { readonly loseContext: () => void } | null;
}

/** A document whose canvases make WebGL 2 contexts while `can.make` holds, and the contexts made. */
const glDom = () => {
  const can = { make: true };
  const contexts: FakeGl[] = [];
  const document = {
    createElement: () => {
      const canvas = {
        width: 0,
        height: 0,
        getContext: (kind: string) => {
          if (kind !== 'webgl2' || !can.make) return null;
          const gl: FakeGl = {
            id: contexts.length,
            lost: false,
            createVertexArray: () => undefined,
            isContextLost: () => gl.lost,
            getExtension: (name) =>
              name === 'WEBGL_lose_context' ? { loseContext: () => void (gl.lost = true) } : null,
          };
          contexts.push(gl);
          return gl;
        },
      };
      return canvas;
    },
  };
  return { can, contexts, document };
};

/** Run `draw` with `dom` as the document, put back after. */
const withGl = <A>(dom: ReturnType<typeof glDom>, draw: () => A): A =>
  Effect.runSync(
    Effect.acquireUseRelease(
      Effect.sync(() => {
        const before: unknown = Reflect.get(globalThis, 'document');
        Reflect.set(globalThis, 'document', dom.document);
        return before;
      }),
      () => Effect.sync(draw),
      (before) => Effect.sync(() => void Reflect.set(globalThis, 'document', before)),
    ),
  );

/** The id of the fake context a canvas holds. */
const idOf = (one: ReturnType<typeof glCanvas>) => Reflect.get(Object(one?.gl), 'id');

test('a 3D canvas is kept per key, and made anew when its context is lost or its size changes', () => {
  const dom = glDom();
  withGl(dom, () => {
    const first = glCanvas('t1/kept', 64, 32);
    expect(glCanvas('t1/kept', 64, 32)).toBe(first);
    // The browser drops the context: the next ask is a new canvas, not the dead one.
    const one = dom.contexts[0];
    if (one !== undefined) one.lost = true;
    const second = glCanvas('t1/kept', 64, 32);
    expect(idOf(second)).toBe(1);
    expect(glCanvas('t1/kept', 64, 32)).toBe(second);
    // Another size: the old canvas let go (its context released), one made at the new size.
    const wider = glCanvas('t1/kept', 128, 32);
    expect(idOf(wider)).toBe(2);
    expect(dom.contexts[1]?.lost).toBe(true);
    expect(wider?.canvas.width).toBe(128);
  });
});

test('a 3D canvas that could not be made is asked for again, not kept as none', () => {
  const dom = glDom();
  withGl(dom, () => {
    dom.can.make = false;
    expect(glCanvas('t2/retry', 64, 32)).toBeUndefined();
    dom.can.make = true;
    expect(idOf(glCanvas('t2/retry', 64, 32))).toBe(0);
  });
});

test('only a few 3D canvases stay live: the longest unused is let go', () => {
  const dom = glDom();
  withGl(dom, () => {
    const keys = Array.from({ length: 8 }, (_, i) => `t3/${i}`);
    const firsts = keys.map((k) => glCanvas(k, 16, 16));
    // Eight live (any older keys of other tests let go first): the first still kept.
    expect(glCanvas('t3/0', 16, 16)).toBe(firsts[0]);
    // A ninth: the longest unused (`t3/1`, as `t3/0` was just used) is let go and released.
    glCanvas('t3/8', 16, 16);
    expect(dom.contexts[1]?.lost).toBe(true);
    expect(dom.contexts[0]?.lost).toBe(false);
    expect(idOf(glCanvas('t3/1', 16, 16))).toBe(9);
  });
});

test('a canvas a rig draws on is held in the same budget: the ninth live context of either lets the longest unused go', () => {
  const dom = glDom();
  withGl(dom, () => {
    // A rig's canvas and its context (`canvas/rive.ts`), held first, then seven keys and another rig's.
    const rig = dom.document.createElement();
    const rigGl = rig.getContext('webgl2');
    // The fakes as the DOM types `holdGl` takes.
    const asDom = Schema.decodeSync(Schema.Any);
    holdGl(asDom(rig), asDom(rigGl));
    const keys = Array.from({ length: 7 }, (_, i) => glCanvas(`t4/${i}`, 16, 16));
    expect(keys.every((k) => k !== undefined)).toBe(true);
    expect(rigGl?.lost).toBe(false);
    // An eighth key: nine live, so the rig's (the longest unused) is let go and found lost.
    glCanvas('t4/7', 16, 16);
    expect(rigGl?.lost).toBe(true);
    // A key's canvas let go by a rig's hold is made anew when next asked.
    const other = dom.document.createElement();
    const otherGl = other.getContext('webgl2');
    holdGl(asDom(other), asDom(otherGl));
    expect(dom.contexts.find((c) => c.id === 1)?.lost).toBe(true);
    expect(idOf(glCanvas('t4/0', 16, 16))).not.toBe(1);
    // A rig let go releases its context at once.
    dropGl(asDom(other));
    expect(otherGl?.lost).toBe(true);
  });
});
