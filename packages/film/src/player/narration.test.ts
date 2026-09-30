// The preview's narration, with a stand-in audio element (bun has none): a
// film with no master has nothing to play; a master that will not load is
// missing, said once, and never asked to play again; one that loads plays;
// a play the browser refuses until a click is blocked, and the next play
// (a click) tries again; a play asked while it loads starts once it can,
// from where the clock is then; a play a pause cut short is no failure.

import { describe, expect, test } from 'bun:test';
import { type NarrationAudio, narration } from './narration.ts';

/** An audio element that records what it was asked, and rejects each play with `refuse` when set. */
const fakeAudio = (refuse?: string) => {
  const asked: Array<string> = [];
  const events = new EventTarget();
  const el: NarrationAudio & { paused: boolean; fire: (type: string) => void } = {
    currentTime: 0,
    paused: true,
    play: () => {
      asked.push('play');
      if (refuse === undefined) {
        el.paused = false;
        return Promise.resolve();
      }
      return Promise.reject(new DOMException('refused', refuse));
    },
    pause: () => {
      asked.push('pause');
      el.paused = true;
    },
    addEventListener: (type, listener) => events.addEventListener(type, listener),
    fire: (type) => events.dispatchEvent(new Event(type)),
  };
  return { el, asked };
};

const settle = () => new Promise((r) => setTimeout(r, 0));

describe('the narration', () => {
  test('a film with no master has nothing to play', () => {
    const n = narration(undefined, () => fakeAudio().el);
    expect(n.state()._tag).toBe('None');
    n.play(() => 0);
    expect(n.ready()).toBe(false);
  });

  test('a master that will not load is missing, and is never asked to play', () => {
    const { el, asked } = fakeAudio();
    const n = narration('/films/f/narration/full.wav', () => el);
    el.fire('error');
    expect(n.state()).toEqual({
      _tag: 'Missing',
      reason: 'no narration at /films/f/narration/full.wav',
    });
    n.play(() => 0);
    n.play(() => 0);
    expect(asked).toEqual([]);
  });

  test('a master the element cannot play goes missing on its first play, once', async () => {
    const { el, asked } = fakeAudio('NotSupportedError');
    const n = narration('/a.wav', () => el);
    el.fire('canplay');
    expect(n.ready()).toBe(true);
    n.play(() => 0);
    await settle();
    expect(n.state()._tag).toBe('Missing');
    n.play(() => 0);
    expect(asked).toEqual(['play']);
  });

  test('a play refused until a click is blocked, and the next play tries again', async () => {
    const { el, asked } = fakeAudio('NotAllowedError');
    const n = narration('/a.wav', () => el);
    el.fire('canplay');
    n.play(() => 0);
    await settle();
    expect(n.state()._tag).toBe('Blocked');
    expect(n.ready()).toBe(false);
    n.play(() => 0);
    expect(asked).toEqual(['play', 'play']);
  });

  test('a play pressed while it loads starts once it can, from where the clock is then', () => {
    const { el, asked } = fakeAudio();
    const n = narration('/a.wav', () => el);
    let T = 1;
    n.play(() => T);
    expect(asked).toEqual([]);
    // The picture ran on its own clock while the master loaded.
    T = 2.5;
    el.fire('canplay');
    expect(asked).toEqual(['play']);
    expect(el.currentTime).toBe(2.5);
    expect(n.playingAt()).toBe(2.5);
  });

  test('a pause while it loads takes the wanted play back', () => {
    const { el, asked } = fakeAudio();
    const n = narration('/a.wav', () => el);
    n.play(() => 1);
    n.pause();
    el.fire('canplay');
    expect(asked).toEqual(['pause']);
  });

  test('a play cut short by a pause is no failure', async () => {
    const { el } = fakeAudio('AbortError');
    const n = narration('/a.wav', () => el);
    el.fire('canplay');
    n.play(() => 0);
    await settle();
    expect(n.state()._tag).toBe('Ready');
  });
});
