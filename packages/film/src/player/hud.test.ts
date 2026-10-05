// The Play page's HUD: shown at rest; while the film plays, faded once no
// input has come for `HUD_IDLE_MS`; any input shows it and waits again; a
// tap on the picture while it plays toggles it; the film standing shows it.

import { describe, expect, test } from 'bun:test';
import { fakeTimers } from './fixtures/timers.ts';
import { HUD_IDLE_MS, makeHud } from './hud.ts';

/** A HUD on a clock the test moves, and every change it said. */
const hudOn = () => {
  const clock = fakeTimers();
  const said: Array<boolean> = [];
  const hud = makeHud((shown) => said.push(shown), clock.timers);
  return { hud, clock, said };
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
