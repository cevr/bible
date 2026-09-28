// The knobs in a browser, over the probe film with the lab API faked: the
// inspected scene's knob rows write a knob's value; a point knob's handle on
// the frame dragged writes it once, on release; a knob computed in the source
// says so and writes nothing. Under a camera pushed in 2× on its target
// (scene three), a knob read before the camera sits where the camera draws
// it, the target sits at the frame's centre as a reticle, and dragging the
// reticle right moves the picture right: the target moves left.

import { Effect, Option } from 'effect';
import { describe, expect, it } from 'effect-bun-test';
import type { Page } from 'playwright-core';
import { type Asked, json, openLab, route, sourceOne } from '../fixtures/harness.ts';

const posted = (asked: ReadonlyArray<Asked>) =>
  asked.filter((a) => a.method === 'POST').map((a) => ({ path: a.path, body: a.body }));

const statusSays = (page: Page, part: string) =>
  Effect.promise(() =>
    page.waitForFunction(
      (want) => (document.querySelector('.lab-edit-status')?.textContent ?? '').includes(want),
      part,
    ),
  );

const boxOf = (page: Page, selector: string) =>
  Effect.promise(() => page.locator(selector).boundingBox()).pipe(
    Effect.flatMap(Effect.fromNullishOr),
    Effect.orDie,
  );

/** The overlay's screen box and how many screen pixels a film pixel is (the film is 640 × 360). */
const frameOf = (page: Page) =>
  Effect.map(boxOf(page, '.lab-overlay'), (b) => ({ ...b, per: b.width / 640 }));

/** The centre of handle `name`, in film pixels. */
const handleAt = (page: Page, name: string) =>
  Effect.gen(function* () {
    const frame = yield* frameOf(page);
    const h = yield* boxOf(page, `.lab-handle[data-knob="${name}"]`);
    return [
      (h.x + h.width / 2 - frame.x) / frame.per,
      (h.y + h.height / 2 - frame.y) / frame.per,
    ] as const;
  });

/** Drag handle `name` by `dx`, `dy` film pixels. */
const dragHandle = (page: Page, name: string, dx: number, dy: number) =>
  Effect.gen(function* () {
    const frame = yield* frameOf(page);
    const h = yield* boxOf(page, `.lab-handle[data-knob="${name}"]`);
    const x = h.x + h.width / 2;
    const y = h.y + h.height / 2;
    yield* Effect.promise(() => page.mouse.move(x, y));
    yield* Effect.promise(() => page.mouse.down());
    yield* Effect.promise(() =>
      page.mouse.move(x + dx * frame.per, y + dy * frame.per, { steps: 4 }),
    );
    yield* Effect.promise(() => page.mouse.up());
  });

describe('the knob rows', () => {
  it.live("a number knob's field writes its value", () =>
    Effect.gen(function* () {
      const { page, asked, errors } = yield* openLab([], {
        query: '&sel=knob:one:size',
        hash: '#1',
      });
      const field = '.lab-knob[data-knob="size"] input';
      yield* Effect.promise(() => page.waitForSelector(`${field}:not([disabled])`));
      yield* Effect.promise(() => page.fill(field, '30'));
      yield* Effect.promise(() => page.press(field, 'Enter'));
      yield* statusSays(page, 'wrote');
      expect(posted(asked)).toEqual([
        { path: '/knobs/one/size', body: Option.some({ value: 30 }) },
      ]);
      const selected = yield* Effect.promise(() =>
        page.getAttribute('.lab-knob[data-knob="size"]', 'class'),
      );
      expect(selected).toContain('selected');
      expect(errors).toEqual([]);
    }).pipe(Effect.scoped),
  );
});

describe('the handles on the frame', () => {
  it.live("a point knob's handle dragged writes it once, on release, and selects it", () =>
    Effect.gen(function* () {
      const { page, asked } = yield* openLab([], { hash: '#1' });
      yield* Effect.promise(() => page.waitForSelector('.lab-handle[data-knob="spot"]'));
      yield* dragHandle(page, 'spot', 40, 0);
      yield* statusSays(page, 'wrote');
      const writes = posted(asked);
      expect(writes).toHaveLength(1);
      expect(writes[0]?.path).toBe('/knobs/one/spot');
      expect(writes[0]?.body).toEqual(Option.some({ value: [360, 200] }));
      const search = yield* Effect.promise(() => page.evaluate(() => location.search));
      expect(search).toContain('sel=knob%3Aone%3Aspot');
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
      yield* Effect.promise(() => page.waitForSelector('.lab-handle[data-knob="spot"]'));
      yield* Effect.promise(() =>
        page.waitForFunction(() =>
          document.querySelector('.lab-strip-head')?.textContent?.includes('scenes/one.ts'),
        ),
      );
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
      yield* Effect.promise(() => page.waitForSelector('.lab-handle[data-knob="pole"]'));
      const [x, y] = yield* handleAt(page, 'pole');
      expect(x).toBeCloseTo(120, 0);
      expect(y).toBeCloseTo(280, 0);
      expect(errors).toEqual([]);
    }).pipe(Effect.scoped),
  );

  it.live('its target is a reticle at the centre; dragged right, the target moves left', () =>
    Effect.gen(function* () {
      const { page, asked } = yield* openLab([], { hash: '#10' });
      yield* Effect.promise(() => page.waitForSelector('.lab-handle.reticle[data-knob="face"]'));
      const [x, y] = yield* handleAt(page, 'face');
      expect(x).toBeCloseTo(320, 0);
      expect(y).toBeCloseTo(180, 0);
      yield* Effect.promise(() =>
        page.waitForFunction(() =>
          document.querySelector('.lab-strip-head')?.textContent?.includes('scenes/three.ts'),
        ),
      );
      yield* dragHandle(page, 'face', 40, 0);
      yield* statusSays(page, 'wrote');
      expect(posted(asked)).toEqual([
        { path: '/knobs/three/face', body: Option.some({ value: [380, 200] }) },
      ]);
    }).pipe(Effect.scoped),
  );
});
