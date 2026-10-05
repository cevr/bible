// The Motion section in a browser, over the probe film: the rate chip sets
// the clock and says the narration is muted, a reload keeps it, and K plays
// at 1× again; the in point (I, or the loop chip) then a later out point (O)
// loops that range and plays it; an out point before any in point says to
// set one; Loop the selected cue (⇧L, or the cue's menu) is offered once a
// cue is selected; Stop looping stops, its chip row pressed while the film
// loops as it runs from a click; the onion ghosts the frames around a
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

/** The film seconds the player shows, as the URL has them. */
const T = URL_T;

describe('speed', () => {
  it.live(
    'the rate chip slows the clock, says the narration is muted, a reload keeps it, K undoes it',
    () =>
      Effect.gen(function* () {
        const { page, errors } = yield* openLab([], { href: labAt(1), mode: 'motion' });
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
        const { page } = yield* openLab([], { href: labAt(1), mode: 'motion' });
        yield* page.waitFor('.lab-motion [data-act="loop"]');
        yield* fromChip(page, 'loop', 'motion.in');
        yield* motionSays(page, 'in 00:00:01:00');
        // The player is paused, so the hold's jump leaves the film where it stands.
        yield* page.clock.hold;
        // Three coarse steps of ten frames: a second on, at 30 fps.
        yield* page.press('Shift+ArrowRight');
        yield* page.press('Shift+ArrowRight');
        yield* page.press('Shift+ArrowRight');
        yield* page.press('o');
        yield* motionSays(page, 'looping in 00:00:01:00 – out 00:00:02:00');
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

  it.live(
    'a pasted link with #loop= opens on its A–B loop; a range marked or stopped is a step Back walks',
    () =>
      Effect.gen(function* () {
        const { page } = yield* openLab([], {
          href: labAt(1, { loop: { from: 1, to: 2 } }),
          mode: 'motion',
        });
        yield* page.waitFor('.lab-motion [data-act="loop"]');
        yield* motionSays(page, 'looping in 00:00:01:00 – out 00:00:02:00');
        // Stopped: the link loses its loop, and Back brings it again.
        yield* fromChip(page, 'loop', 'motion.loop-off');
        yield* motionSays(page, '');
        yield* evaluates(page, `location.hash.includes('loop=')`, false);
        yield* page.back;
        yield* motionSays(page, 'looping in 00:00:01:00 – out 00:00:02:00');
        yield* evaluates(page, `location.hash.includes('&loop=1,2')`, true);
        // A new out point: the range it makes is in the link, and Back returns to the one before.
        yield* page.clock.hold;
        for (let step = 0; step < 6; step++) yield* page.press('Shift+ArrowRight');
        yield* page.press('o');
        yield* motionSays(page, 'looping in 00:00:01:00 – out 00:00:03:00');
        yield* evaluates(page, `location.hash.endsWith('&loop=1,3')`, true);
        yield* page.back;
        yield* motionSays(page, 'looping in 00:00:01:00 – out 00:00:02:00');
        yield* evaluates(page, `location.hash.endsWith('&loop=1,2')`, true);
      }).pipe(Effect.scoped),
  );

  it.live('an out point with no in point says to set one first', () =>
    Effect.gen(function* () {
      const { page } = yield* openLab([], { href: labAt(2), mode: 'motion' });
      yield* page.waitFor('.lab-motion [data-act="loop"]');
      yield* page.press('o');
      yield* motionSays(page, 'out 00:00:02:00: set the in point before it');
    }).pipe(Effect.scoped),
  );

  it.live('Loop the selected cue waits for a cue, then loops it from the cue’s menu or ⇧L', () =>
    Effect.gen(function* () {
      // One browser: with no cue selected the chip does not offer it, then the
      // same tab opens with a cue selected.
      const { page } = yield* openLab([], { href: labAt(1), mode: 'motion' });
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

  it.live('a chip’s row pressed while the film loops is the row released on, and runs', () =>
    Effect.gen(function* () {
      const { page } = yield* openLab([], {
        href: labAt(1, { selection: { _tag: 'Cue', scene: 'one', name: 'rise' } }),
        mode: 'motion',
      });
      yield* page.waitFor('.lab-cue[data-cue="rise"]');
      yield* page.press('Shift+L');
      yield* motionSays(page, 'looping rise');
      yield* click(page, '.lab-motion [data-act="loop"]');
      const off = '[data-role="chip-menu"] [data-command="motion.loop-off"]';
      const at = yield* page.box(off);
      yield* page.mouse.move(at.x + at.width / 2, at.y + at.height / 2);
      // Frames play between the press and the release, as a hand's click takes them.
      yield* page.mouse.down;
      yield* page.clock.runFor(200);
      yield* page.mouse.up;
      yield* countIs(page, '[data-role="chip-menu"]', 0);
      yield* motionSays(page, '');
    }).pipe(Effect.scoped),
  );
});

describe('the onion', () => {
  it.live('ghosts the frames around a paused one on its layer', () =>
    Effect.gen(function* () {
      const { page } = yield* openLab([], { href: labAt(1.2), mode: 'motion' });
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
