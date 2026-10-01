// The knobs in a browser, over the probe film with the lab API faked: the
// inspected scene's knob rows write a knob's value; a point knob's handle on
// the frame dragged writes it once, on release; a knob computed in the source
// says so and writes nothing. Under a camera pushed in 2× on its target
// (scene three), a knob read before the camera sits where the camera draws
// it, the target sits at the frame's centre as a reticle, and dragging the
// reticle right moves the picture right: the target moves left.

import { Effect, Option } from 'effect';
import { describe, expect, it } from 'effect-bun-test';
import type { Tab } from '../fixtures/tab.ts';
import { type Asked, json, openLab, route, sourceOne } from '../fixtures/harness.ts';
import { attributeIs, evaluates, textHas, valueIs } from '../fixtures/settled.ts';

const posted = (asked: ReadonlyArray<Asked>) =>
  asked.filter((a) => a.method === 'POST').map((a) => ({ path: a.path, body: a.body }));

const statusSays = (page: Tab, part: string) => textHas(page, '.lab-edit-status', part);

const boxOf = (page: Tab, selector: string) => page.box(selector);

/** The overlay's screen box and how many screen pixels a film pixel is (the film is 640 × 360). */
const frameOf = (page: Tab) =>
  Effect.map(boxOf(page, '.lab-overlay'), (b) => ({ ...b, per: b.width / 640 }));

/** The centre of handle `name`, in film pixels. */
const handleAt = (page: Tab, name: string) =>
  Effect.gen(function* () {
    const frame = yield* frameOf(page);
    const h = yield* boxOf(page, `.lab-handle[data-knob="${name}"]`);
    return [
      (h.x + h.width / 2 - frame.x) / frame.per,
      (h.y + h.height / 2 - frame.y) / frame.per,
    ] as const;
  });

/** Drag handle `name` by `dx`, `dy` film pixels. */
const dragHandle = (page: Tab, name: string, dx: number, dy: number) =>
  Effect.gen(function* () {
    const frame = yield* frameOf(page);
    const h = yield* boxOf(page, `.lab-handle[data-knob="${name}"]`);
    const x = h.x + h.width / 2;
    const y = h.y + h.height / 2;
    yield* page.mouse.move(x, y);
    yield* page.mouse.down;
    yield* page.mouse.move(x + dx * frame.per, y + dy * frame.per, 4);
    yield* page.mouse.up;
  });

describe('the knob rows', () => {
  it.live("a number knob's field writes its value", () =>
    Effect.gen(function* () {
      const { page, asked, errors } = yield* openLab([], {
        query: '&sel=knob:one:size',
        hash: '#1',
      });
      const field = '.lab-knob[data-knob="size"] input';
      yield* page.waitFor(`${field}:not([disabled])`);
      yield* page.fill(field, '30');
      yield* page.pressIn(field, 'Enter');
      yield* statusSays(page, 'wrote');
      expect(posted(asked)).toEqual([
        { path: '/knobs/one/size', body: Option.some({ value: 30 }) },
      ]);
      yield* attributeIs(page, '.lab-knob[data-knob="size"]', 'class', /\bselected\b/);
      expect(errors).toEqual([]);
    }).pipe(Effect.scoped),
  );

  it.live('a knob whose value is 0 has its row, and its field writes', () =>
    Effect.gen(function* () {
      const { page, asked } = yield* openLab([], { query: '&sel=knob:one:tilt', hash: '#1' });
      const field = '.lab-knob[data-knob="tilt"] input';
      yield* page.waitFor(`${field}:not([disabled])`);
      yield* valueIs(page, field, '0');
      yield* page.fill(field, '0.2');
      yield* page.pressIn(field, 'Enter');
      yield* statusSays(page, 'wrote');
      expect(posted(asked)).toEqual([
        { path: '/knobs/one/tilt', body: Option.some({ value: 0.2 }) },
      ]);
    }).pipe(Effect.scoped),
  );
});

describe('the handles on the frame', () => {
  it.live("a point knob's handle dragged writes it once, on release, and selects it", () =>
    Effect.gen(function* () {
      const { page, asked } = yield* openLab([], { hash: '#1' });
      yield* page.waitFor('.lab-handle[data-knob="spot"]');
      yield* dragHandle(page, 'spot', 40, 0);
      yield* statusSays(page, 'wrote');
      const writes = posted(asked);
      expect(writes).toHaveLength(1);
      expect(writes[0]?.path).toBe('/knobs/one/spot');
      expect(writes[0]?.body).toEqual(Option.some({ value: [360, 200] }));
      yield* evaluates(page, "location.search.includes('sel=knob%3Aone%3Aspot')", true);
    }).pipe(Effect.scoped),
  );

  it.live('a knob computed in the source says so, and writes nothing', () =>
    Effect.gen(function* () {
      const computed = {
        ...sourceOne,
        knobs: sourceOne.knobs.map((k) => ({ ...k, state: 'computed' })),
      };
      const { page, asked } = yield* openLab(
        [route('GET', /^\/scenes\/one\/source$/, () => json(computed))],
        { hash: '#1' },
      );
      yield* page.waitFor('.lab-handle[data-knob="spot"]');
      yield* textHas(page, '.lab-strip-head', 'scenes/one.ts');
      yield* dragHandle(page, 'spot', 40, 0);
      yield* statusSays(page, 'cannot move spot: it is computed in the source');
      expect(posted(asked)).toEqual([]);
    }).pipe(Effect.scoped),
  );
});

describe('a camera pushed in on its target', () => {
  it.live('a knob read before the camera sits where the camera draws it', () =>
    Effect.gen(function* () {
      const { page, errors } = yield* openLab([], { hash: '#10' });
      yield* page.waitFor('.lab-handle[data-knob="pole"]');
      const [x, y] = yield* handleAt(page, 'pole');
      expect(x).toBeCloseTo(120, 0);
      expect(y).toBeCloseTo(280, 0);
      expect(errors).toEqual([]);
    }).pipe(Effect.scoped),
  );

  it.live('its target is a reticle at the centre; dragged right, the target moves left', () =>
    Effect.gen(function* () {
      const { page, asked } = yield* openLab([], { hash: '#10' });
      yield* page.waitFor('.lab-handle.reticle[data-knob="face"]');
      const [x, y] = yield* handleAt(page, 'face');
      expect(x).toBeCloseTo(320, 0);
      expect(y).toBeCloseTo(180, 0);
      yield* textHas(page, '.lab-strip-head', 'scenes/three.ts');
      yield* dragHandle(page, 'face', 40, 0);
      yield* statusSays(page, 'wrote');
      expect(posted(asked)).toEqual([
        { path: '/knobs/three/face', body: Option.some({ value: [380, 200] }) },
      ]);
    }).pipe(Effect.scoped),
  );
});
