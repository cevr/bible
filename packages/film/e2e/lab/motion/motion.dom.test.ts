// The Motion section in a browser, over the probe film: speed sets the clock
// and says the narration is muted, and a reload keeps it; A then a later B
// loops that range and plays it; B before A says to set A; the cue button
// loops the selected cue, and waits for one; off stops; the onion ghosts the
// frames around a paused one on its layer.

import { Effect } from 'effect';
import { describe, expect, it } from 'effect-bun-test';
import type { Tab } from '../../../src/lab/fixtures/tab.ts';
import { URL_T, labAt, openLab } from '../../../src/lab/fixtures/harness.ts';
import { attributeIs, evaluates, textIs } from '../../../src/lab/fixtures/settled.ts';

const motionSays = (page: Tab, part: string) => textIs(page, '.lab-motion-status', part);

const click = (page: Tab, selector: string) => page.click(selector);

/**
 * How far ahead of the page's clock it is paused: the test's own time limit
 * (`bun test --timeout 20000`). The clock runs on in real time between the
 * read and the pause, and `pauseAt` refuses a time already past ("Cannot
 * fast-forward to the past", which a lead of 10 ms met under load); no
 * test lives long enough to pass this one. The jump fires each timer due in
 * it once; the player is paused, so the film stays where it stands.
 */
const PAUSE_LEAD_MS = 20_000;

/**
 * Stop the page's clock: from here the page moves only as the test runs it
 * on (`page.clock.runFor`), so what a loop has played never depends on how
 * long a loaded machine took between two clicks.
 */
const holdClock = (page: Tab) =>
  Effect.flatMap(
    // The page's own (installed) clock, read in the page: not this process's.
    page.evaluate<number>('Date.now()'),
    (now) => page.clock.pauseAt(now + PAUSE_LEAD_MS),
  );

/** The film seconds the player shows, as the URL has them. */
const T = URL_T;

describe('speed', () => {
  it.live('slows the clock, says the narration is muted, and a reload keeps it', () =>
    Effect.gen(function* () {
      const { page, errors } = yield* openLab([], { href: labAt(1) });
      yield* page.waitFor('.lab-motion [data-rate="0.5"]');
      yield* click(page, '.lab-motion [data-rate="0.5"]');
      yield* motionSays(page, '0.5×: narration muted');
      yield* page.reload;
      yield* page.waitFor('.lab-motion [data-rate="0.5"].on');
      yield* motionSays(page, '0.5×: narration muted');
      expect(errors).toEqual([]);
    }).pipe(Effect.scoped),
  );
});

describe('loops', () => {
  it.live('A then a later B loops the range and plays it; off stops', () =>
    Effect.gen(function* () {
      const { page } = yield* openLab([], { href: labAt(1) });
      yield* page.waitFor('.lab-motion [data-act="a"]');
      yield* holdClock(page);
      yield* click(page, '.lab-motion [data-act="a"]');
      yield* motionSays(page, 'A 1.00');
      yield* page.press('Shift+ArrowRight');
      yield* click(page, '.lab-motion [data-act="b"]');
      yield* motionSays(page, 'looping A 1.00 – B 2.00');
      yield* textIs(page, '[data-act="play"]', '❚❚');
      // Played on past B by the page's clock: the loop has come round again inside the range.
      // Then a few frames more, past the quarter second `#t=` is written at most once in.
      yield* page.clock.fastForward(2500);
      yield* page.clock.runFor(300);
      yield* evaluates(page, `${T} > 1 && ${T} <= 2`, true);
      yield* click(page, '.lab-motion [data-act="loop-off"]');
      yield* motionSays(page, '');
    }).pipe(Effect.scoped),
  );

  it.live('B with no A says to set A first', () =>
    Effect.gen(function* () {
      const { page } = yield* openLab([], { href: labAt(2) });
      yield* page.waitFor('.lab-motion [data-act="b"]');
      yield* click(page, '.lab-motion [data-act="b"]');
      yield* motionSays(page, 'B 2.00: set A before it');
    }).pipe(Effect.scoped),
  );

  it.live('the cue button waits for a cue, and loops the selected one', () =>
    Effect.gen(function* () {
      // One browser: with no cue selected the button waits, then the same tab
      // opens with a cue selected.
      const { page } = yield* openLab([], { href: labAt(1) });
      yield* page.waitFor('.lab-motion [data-act="loop-cue"][disabled]');
      yield* page.goto(labAt(1, { selection: { kind: 'cue', scene: 'one', name: 'rise' } }));
      yield* page.waitFor('.lab-motion [data-act="loop-cue"]:not([disabled])');
      yield* holdClock(page);
      yield* click(page, '.lab-motion [data-act="loop-cue"]');
      yield* motionSays(page, 'looping rise');
    }).pipe(Effect.scoped),
  );
});

describe('the onion', () => {
  it.live('ghosts the frames around a paused one on its layer', () =>
    Effect.gen(function* () {
      const { page } = yield* openLab([], { href: labAt(1.2) });
      yield* page.waitFor('.lab-motion [data-act="onion"]');
      yield* click(page, '.lab-motion [data-act="onion"]');
      yield* page.waitFor('canvas.lab-onion:not([hidden])');
      yield* page.until(`(() => {
        const c = document.querySelector('canvas.lab-onion');
        const d = c?.getContext('2d')?.getImageData(0, 0, c.width, c.height).data ?? [];
        let n = 0;
        for (let i = 3; i < d.length; i += 4) if ((d[i] ?? 0) > 0) n++;
        return n > 50;
      })()`);
      yield* attributeIs(page, '.lab-motion [data-act="onion"]', 'class', /\bon\b/);
    }).pipe(Effect.scoped),
  );
});
