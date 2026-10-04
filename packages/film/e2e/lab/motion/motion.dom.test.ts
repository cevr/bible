// The Motion section in a browser, over the probe film: the rate chip sets
// the clock and says the narration is muted, a reload keeps it, and K plays
// at 1× again; the in point (I, or the loop chip) then a later out point (O)
// loops that range and plays it; an out point before any in point says to
// set one; Loop the selected cue (⇧L, or the cue's menu) is offered once a
// cue is selected; Stop looping stops; the onion ghosts the frames around a
// paused one on its layer.

import { Effect } from 'effect';
import { describe, expect, it } from 'effect-bun-test';
import type { Tab } from '../../../src/lab/fixtures/tab.ts';
import { URL_T, labAt, openLab } from '../../../src/lab/fixtures/harness.ts';
import { MENU_ITEMS, rightClick } from '../../../src/lab/fixtures/gestures.ts';
import { attributeIs, countIs, evaluates, textIs } from '../../../src/lab/fixtures/settled.ts';

const motionSays = (page: Tab, part: string) => textIs(page, '.lab-motion-status', part);

const click = (page: Tab, selector: string) => page.click(selector);

/** Open the Motion chip `act` and run its command `id`, waiting for the menu to close. */
const fromChip = (page: Tab, act: string, id: string) =>
  Effect.gen(function* () {
    yield* click(page, `.lab-motion [data-act="${act}"]`);
    yield* page.clock.runFor(300);
    yield* click(page, `[data-role="chip-menu"] [data-command="${id}"]`);
    yield* page.clock.runFor(300);
    yield* countIs(page, '[data-role="chip-menu"]', 0);
  });

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
  it.live(
    'the rate chip slows the clock, says the narration is muted, a reload keeps it, K undoes it',
    () =>
      Effect.gen(function* () {
        const { page, errors } = yield* openLab([], { href: labAt(1) });
        yield* page.waitFor('.lab-motion [data-act="rate"] [data-rate="1"]');
        // The chip offers every rate but the one it plays at.
        yield* click(page, '.lab-motion [data-act="rate"]');
        yield* page.waitFor('[data-role="chip-menu"] [data-command="play.rate-0.5"]');
        yield* countIs(page, '[data-role="chip-menu"] [data-command="play.rate-1"]', 0);
        yield* click(page, '[data-role="chip-menu"] [data-command="play.rate-0.5"]');
        yield* motionSays(page, '0.5×: narration muted');
        yield* page.reload;
        yield* page.waitFor('.lab-motion [data-act="rate"] [data-rate="0.5"]');
        yield* motionSays(page, '0.5×: narration muted');
        yield* page.press('j');
        yield* page.waitFor('.lab-motion [data-act="rate"] [data-rate="0.25"]');
        yield* page.press('k');
        yield* page.waitFor('.lab-motion [data-act="rate"] [data-rate="1"]');
        yield* motionSays(page, '');
        expect(errors).toEqual([]);
      }).pipe(Effect.scoped),
  );
});

describe('loops', () => {
  it.live(
    'an in point then a later out point loops the range and plays it; Stop looping stops',
    () =>
      Effect.gen(function* () {
        const { page } = yield* openLab([], { href: labAt(1) });
        yield* page.waitFor('.lab-motion [data-act="loop"]');
        yield* fromChip(page, 'loop', 'motion.in');
        yield* motionSays(page, 'in 1.00');
        yield* holdClock(page);
        // Three coarse steps of ten frames: a second on, at 30 fps.
        yield* page.press('Shift+ArrowRight');
        yield* page.press('Shift+ArrowRight');
        yield* page.press('Shift+ArrowRight');
        yield* page.press('o');
        yield* motionSays(page, 'looping in 1.00 – out 2.00');
        yield* textIs(page, '[data-act="play"]', '❚❚');
        // Played on past the out point by the page's clock: the loop has come round again inside the range.
        // Then a few frames more, past the quarter second `#t=` is written at most once in.
        yield* page.clock.fastForward(2500);
        yield* page.clock.runFor(300);
        yield* evaluates(page, `${T} > 1 && ${T} <= 2`, true);
        yield* fromChip(page, 'loop', 'motion.loop-off');
        yield* motionSays(page, '');
      }).pipe(Effect.scoped),
  );

  it.live('an out point with no in point says to set one first', () =>
    Effect.gen(function* () {
      const { page } = yield* openLab([], { href: labAt(2) });
      yield* page.waitFor('.lab-motion [data-act="loop"]');
      yield* page.press('o');
      yield* motionSays(page, 'out 2.00: set the in point before it');
    }).pipe(Effect.scoped),
  );

  it.live('Loop the selected cue waits for a cue, then loops it from the cue’s menu or ⇧L', () =>
    Effect.gen(function* () {
      // One browser: with no cue selected the chip does not offer it, then the
      // same tab opens with a cue selected.
      const { page } = yield* openLab([], { href: labAt(1) });
      yield* click(page, '.lab-motion [data-act="loop"]');
      yield* page.waitFor('[data-role="chip-menu"] [data-command="motion.loop-scene"]');
      yield* countIs(page, '[data-role="chip-menu"] [data-command="motion.loop-cue"]', 0);
      yield* page.goto(labAt(1, { selection: { _tag: 'Cue', scene: 'one', name: 'rise' } }));
      const rise = '.lab-cue[data-cue="rise"]';
      yield* page.waitFor(rise);
      yield* rightClick(page, rise);
      yield* page.waitFor('[data-role="context-menu"] [data-command="motion.loop-cue"]');
      yield* evaluates(page, `${MENU_ITEMS}.includes('motion.loop-cue')`, true);
      yield* click(page, '[data-role="context-menu"] [data-command="motion.loop-cue"]');
      yield* motionSays(page, 'looping rise');
      yield* fromChip(page, 'loop', 'motion.loop-off');
      yield* motionSays(page, '');
      yield* page.press('Shift+L');
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
