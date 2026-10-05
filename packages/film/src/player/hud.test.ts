// The Play page's HUD: shown at rest; while the film plays, faded once no
// input has come for `HUD_IDLE_MS`; any input shows it and waits again; a
// tap on the picture while it plays toggles it; the film standing shows it.

import { describe, expect, test } from 'bun:test';
import { fakeTimers } from './fixtures/timers.ts';
import { HUD_IDLE_MS, makeHud } from './hud.ts';

/** A HUD on a clock the test moves, every change it said, and whether the keyboard's focus is on a control. */
const hudOn = () => {
  const clock = fakeTimers();
  const said: Array<boolean> = [];
  const focus = { held: false };
  const hud = makeHud(
    (shown) => said.push(shown),
    clock.timers,
    () => focus.held,
  );
  return { hud, clock, said, focus };
};

describe('makeHud', () => {
  test('at rest the controls show, however long nothing comes', () => {
    const { hud, clock, said } = hudOn();
    clock.advance(HUD_IDLE_MS * 10);
    expect(hud.shown()).toBe(true);
    expect(said).toEqual([]);
  });

  test('while the film plays they fade once nothing has come for the wait, not before', () => {
    const { hud, clock, said } = hudOn();
    hud.playing(true);
    clock.advance(HUD_IDLE_MS - 1);
    expect(hud.shown()).toBe(true);
    clock.advance(1);
    expect(hud.shown()).toBe(false);
    expect(said).toEqual([false]);
  });

  test('an input shows them and waits again from then', () => {
    const { hud, clock, said } = hudOn();
    hud.playing(true);
    clock.advance(HUD_IDLE_MS - 500);
    hud.wake();
    clock.advance(HUD_IDLE_MS - 1);
    expect(hud.shown()).toBe(true);
    clock.advance(1);
    expect(hud.shown()).toBe(false);
    hud.wake();
    expect(said).toEqual([false, true]);
  });

  test('a tap while it plays hides shown controls at once, and shows hidden ones', () => {
    const { hud, clock } = hudOn();
    hud.playing(true);
    hud.toggle();
    expect(hud.shown()).toBe(false);
    expect(clock.pending()).toBe(0);
    hud.toggle();
    expect(hud.shown()).toBe(true);
    clock.advance(HUD_IDLE_MS);
    expect(hud.shown()).toBe(false);
  });

  test("a control holding the keyboard's focus keeps them shown; the focus leaving waits again", () => {
    const { hud, clock, focus } = hudOn();
    hud.playing(true);
    clock.advance(HUD_IDLE_MS);
    expect(hud.shown()).toBe(false);
    // Tab lands on a control: the focus moving wakes them, and they stay while it is held.
    focus.held = true;
    hud.wake();
    clock.advance(HUD_IDLE_MS * 10);
    expect(hud.shown()).toBe(true);
    hud.toggle();
    expect(hud.shown()).toBe(true);
    // The focus leaves the controls: they fade a wait later.
    focus.held = false;
    hud.wake();
    clock.advance(HUD_IDLE_MS);
    expect(hud.shown()).toBe(false);
  });

  test('the film standing shows them and stops the wait; playing again, the same frames say nothing', () => {
    const { hud, clock, said } = hudOn();
    hud.playing(true);
    clock.advance(HUD_IDLE_MS);
    hud.playing(false);
    expect(hud.shown()).toBe(true);
    expect(clock.pending()).toBe(0);
    hud.playing(false);
    hud.playing(true);
    hud.playing(true);
    expect(clock.pending()).toBe(1);
    expect(said).toEqual([false, true]);
  });
});
