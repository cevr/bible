// The Compare section in a browser, over the probe film with the lab API
// faked: a wipe shows HEAD's frame left of a divider the pointer drags, and
// says which file it read; a blink flips HEAD's frame in and out; a scene
// HEAD cannot give says the server's reason, and HEAD's timeline that does
// not resolve on today's narration says why; a reload keeps the mode.

import { Effect } from 'effect';
import { describe, expect, it } from 'effect-bun-test';
import type { Page } from 'playwright-core';
import { HeadUnavailable } from '../../core/refusals.ts';
import { json, openLab, refused, route } from '../fixtures/harness.ts';
import { textHas } from '../fixtures/settled.ts';

const compareSays = (page: Page, part: string) => textHas(page, '.lab-compare-status', part);

const click = (page: Page, selector: string) => Effect.promise(() => page.click(selector));

/** Wait until HEAD's layer is clipped to `want`: the layer is painted on the next animation frame. */
const clipIs = (page: Page, want: string) =>
  Effect.promise(() =>
    page.waitForFunction(
      (clip) =>
        document.querySelector<HTMLCanvasElement>('canvas.lab-compare')?.style.clipPath === clip,
      want,
    ),
  );

describe('compare with HEAD', () => {
  it.live('a wipe shows HEAD left of a divider the pointer drags', () =>
    Effect.gen(function* () {
      const { page, asked, errors } = yield* openLab([], { hash: '#1' });
      yield* Effect.promise(() => page.waitForSelector('.lab-compare-tools [data-mode="wipe"]'));
      yield* click(page, '.lab-compare-tools [data-mode="wipe"]');
      yield* compareSays(page, 'scenes/one.ts at HEAD');
      yield* Effect.promise(() => page.waitForSelector('canvas.lab-compare:not([hidden])'));
      yield* clipIs(page, 'inset(0px 50% 0px 0px)');
      const grip = yield* Effect.promise(() =>
        page.locator('.lab-divider circle').boundingBox(),
      ).pipe(Effect.flatMap(Effect.fromNullishOr), Effect.orDie);
      const frame = yield* Effect.promise(() => page.locator('.lab-overlay').boundingBox()).pipe(
        Effect.flatMap(Effect.fromNullishOr),
        Effect.orDie,
      );
      const x = grip.x + grip.width / 2;
      const y = grip.y + grip.height / 2;
      yield* Effect.promise(() => page.mouse.move(x, y));
      yield* Effect.promise(() => page.mouse.down());
      yield* Effect.promise(() => page.mouse.move(frame.x + frame.width * 0.25, y, { steps: 4 }));
      yield* Effect.promise(() => page.mouse.up());
      yield* clipIs(page, 'inset(0px 75% 0px 0px)');
      expect(asked.filter((a) => a.path === '/scenes/one/head')).toHaveLength(1);
      expect(asked.filter((a) => a.path === '/notes' && a.method === 'POST')).toEqual([]);
      expect(errors).toEqual([]);
    }).pipe(Effect.scoped),
  );

  it.live("a blink flips HEAD's frame in and out", () =>
    Effect.gen(function* () {
      const { page } = yield* openLab([], { hash: '#1' });
      yield* Effect.promise(() => page.waitForSelector('.lab-compare-tools [data-mode="blink"]'));
      yield* click(page, '.lab-compare-tools [data-mode="blink"]');
      yield* Effect.promise(() => page.waitForSelector('canvas.lab-compare:not([hidden])'));
      yield* Effect.promise(() =>
        page.waitForSelector('canvas.lab-compare[hidden]', { state: 'attached' }),
      );
      yield* Effect.promise(() => page.waitForSelector('canvas.lab-compare:not([hidden])'));
    }).pipe(Effect.scoped),
  );

  it.live("a scene HEAD cannot give says the server's reason", () =>
    Effect.gen(function* () {
      const { page } = yield* openLab(
        [
          route('GET', /^\/scenes\/one\/head$/, () =>
            refused(HeadUnavailable.make({ file: 'scenes/one.ts', reason: 'not in git' })),
          ),
        ],
        { hash: '#1' },
      );
      yield* Effect.promise(() => page.waitForSelector('.lab-compare-tools [data-mode="wipe"]'));
      yield* click(page, '.lab-compare-tools [data-mode="wipe"]');
      yield* compareSays(page, 'one: scenes/one.ts: no HEAD version to compare with: not in git');
      const hidden = yield* Effect.promise(() =>
        page.evaluate(
          () => document.querySelector<HTMLCanvasElement>('canvas.lab-compare')?.hidden,
        ),
      );
      expect(hidden).toBe(true);
    }).pipe(Effect.scoped),
  );

  it.live("HEAD's timeline that does not resolve now says why and draws no layer", () =>
    Effect.gen(function* () {
      const { page, errors } = yield* openLab(
        [
          // HEAD cued a mark today's narration no longer has.
          route('GET', /^\/scenes\/one\/head$/, () =>
            json({
              scene: 'one',
              file: 'scenes/one.ts',
              timeline: { rise: { mark: 'soar', dur: 0.6 } },
              knobs: {},
              codeChanged: false,
              sameData: false,
            }),
          ),
        ],
        { hash: '#1' },
      );
      yield* Effect.promise(() => page.waitForSelector('.lab-compare-tools [data-mode="wipe"]'));
      yield* click(page, '.lab-compare-tools [data-mode="wipe"]');
      yield* compareSays(page, "one: HEAD's timeline does not resolve now: ");
      yield* compareSays(page, '{soar}');
      const hidden = yield* Effect.promise(() =>
        page.evaluate(
          () => document.querySelector<HTMLCanvasElement>('canvas.lab-compare')?.hidden,
        ),
      );
      expect(hidden).toBe(true);
      expect(errors).toEqual([]);
    }).pipe(Effect.scoped),
  );

  it.live('a reload keeps the mode', () =>
    Effect.gen(function* () {
      const { page } = yield* openLab([], { hash: '#1' });
      yield* Effect.promise(() => page.waitForSelector('.lab-compare-tools [data-mode="wipe"]'));
      yield* click(page, '.lab-compare-tools [data-mode="wipe"]');
      yield* compareSays(page, 'at HEAD');
      yield* Effect.promise(() => page.reload());
      yield* Effect.promise(() => page.waitForSelector('.lab-compare-tools [data-mode="wipe"].on'));
      yield* compareSays(page, 'at HEAD');
    }).pipe(Effect.scoped),
  );
});
