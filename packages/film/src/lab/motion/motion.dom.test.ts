// The Motion section in a browser, over the probe film: speed sets the clock
// and says the narration is muted, and a reload keeps it; A then a later B
// loops that range and plays it; B before A says to set A; the cue button
// loops the selected cue, and waits for one; off stops; the onion ghosts the
// frames around a paused one on its layer.

import { Effect } from 'effect';
import { describe, expect, it } from 'effect-bun-test';
import type { Page } from 'playwright-core';
import { openLab } from '../fixtures/harness.ts';

const motionSays = (page: Page, part: string) =>
  Effect.promise(() =>
    page.waitForFunction(
      (want) => (document.querySelector('.lab-motion-status')?.textContent ?? '') === want,
      part,
    ),
  );

const click = (page: Page, selector: string) => Effect.promise(() => page.click(selector));

/** The film seconds the player shows, as its readout has them. */
const shownT = (page: Page) =>
  Effect.promise(() =>
    page.evaluate(() => Number.parseFloat(location.hash.replace(/^#/, '').split('&')[0] ?? '')),
  );

describe('speed', () => {
  it.live('slows the clock, says the narration is muted, and a reload keeps it', () =>
    Effect.gen(function* () {
      const { page, errors } = yield* openLab([], { hash: '#1' });
      yield* Effect.promise(() => page.waitForSelector('.lab-motion [data-rate="0.5"]'));
      yield* click(page, '.lab-motion [data-rate="0.5"]');
      yield* motionSays(page, '0.5×: narration muted');
      yield* Effect.promise(() => page.reload());
      yield* Effect.promise(() => page.waitForSelector('.lab-motion [data-rate="0.5"].on'));
      yield* motionSays(page, '0.5×: narration muted');
      expect(errors).toEqual([]);
    }).pipe(Effect.scoped),
  );
});

describe('loops', () => {
  it.live('A then a later B loops the range and plays it; off stops', () =>
    Effect.gen(function* () {
      const { page } = yield* openLab([], { hash: '#1' });
      yield* Effect.promise(() => page.waitForSelector('.lab-motion [data-act="a"]'));
      yield* click(page, '.lab-motion [data-act="a"]');
      yield* motionSays(page, 'A 1.00');
      yield* Effect.promise(() => page.keyboard.press('Shift+ArrowRight'));
      yield* click(page, '.lab-motion [data-act="b"]');
      yield* motionSays(page, 'looping A 1.00 – B 2.00');
      const playing = yield* Effect.promise(() => page.textContent('[data-act="play"]'));
      expect(playing).toBe('❚❚');
      yield* Effect.sleep('1500 millis');
      const T = yield* shownT(page);
      expect(T).toBeGreaterThanOrEqual(1);
      expect(T).toBeLessThanOrEqual(2);
      yield* click(page, '.lab-motion [data-act="loop-off"]');
      yield* motionSays(page, '');
    }).pipe(Effect.scoped),
  );

  it.live('B with no A says to set A first', () =>
    Effect.gen(function* () {
      const { page } = yield* openLab([], { hash: '#2' });
      yield* Effect.promise(() => page.waitForSelector('.lab-motion [data-act="b"]'));
      yield* click(page, '.lab-motion [data-act="b"]');
      yield* motionSays(page, 'B 2.00: set A before it');
    }).pipe(Effect.scoped),
  );

  it.live('the cue button waits for a cue, and loops the selected one', () =>
    Effect.gen(function* () {
      const bare = yield* openLab([], { hash: '#1' });
      yield* Effect.promise(() =>
        bare.page.waitForSelector('.lab-motion [data-act="loop-cue"][disabled]'),
      );
      const { page } = yield* openLab([], { query: '&sel=cue:one:rise', hash: '#1' });
      yield* Effect.promise(() =>
        page.waitForSelector('.lab-motion [data-act="loop-cue"]:not([disabled])'),
      );
      yield* click(page, '.lab-motion [data-act="loop-cue"]');
      yield* motionSays(page, 'looping rise');
    }).pipe(Effect.scoped),
  );
});

describe('the onion', () => {
  it.live('ghosts the frames around a paused one on its layer', () =>
    Effect.gen(function* () {
      const { page } = yield* openLab([], { hash: '#1.2' });
      yield* Effect.promise(() => page.waitForSelector('.lab-motion [data-act="onion"]'));
      yield* click(page, '.lab-motion [data-act="onion"]');
      yield* Effect.promise(() => page.waitForSelector('canvas.lab-onion:not([hidden])'));
      const inked = yield* Effect.promise(() =>
        page.waitForFunction(() => {
          const c = document.querySelector<HTMLCanvasElement>('canvas.lab-onion');
          const d = c?.getContext('2d')?.getImageData(0, 0, c.width, c.height).data ?? [];
          let n = 0;
          for (let i = 3; i < d.length; i += 4) if ((d[i] ?? 0) > 0) n++;
          return n > 50;
        }),
      );
      expect(inked).toBeTruthy();
      const on = yield* Effect.promise(() =>
        page.getAttribute('.lab-motion [data-act="onion"]', 'class'),
      );
      expect(on).toContain('on');
    }).pipe(Effect.scoped),
  );
});
