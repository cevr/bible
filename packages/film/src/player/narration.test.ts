// The preview's narration, with a stand-in audio element (bun has none): a
// film with no master has nothing to play; a master that will not load is
// missing, said once, and never asked to play again; one that loads plays;
// a play the browser refuses until a click is blocked, and the next play
// (a click) tries again; a play a pause cut short is no failure.

import { describe, expect, test } from 'bun:test';
import { type NarrationAudio, narration } from './narration.ts';

/**
 * An audio element that records what it was asked, and rejects each play
 * with `refuse` when set. `answered` settles once the narration has heard
 * every play's answer: its reactions run after the narration's own.
 */
const fakeAudio = (refuse?: string) => {
  const asked: Array<string> = [];
  const plays: Array<Promise<void>> = [];
  const events = new EventTarget();
  const el: NarrationAudio & { paused: boolean; fire: (type: string) => void } = {
    currentTime: 0,
    paused: true,
    play: () => {
      asked.push('play');
      if (refuse === undefined) el.paused = false;
      const play =
        refuse === undefined
          ? Promise.resolve()
          : Promise.reject(new DOMException('refused', refuse));
      plays.push(play);
      return play;
    },
    pause: () => {
      asked.push('pause');
      el.paused = true;
    },
    addEventListener: (type, listener) => events.addEventListener(type, listener),
    fire: (type) => events.dispatchEvent(new Event(type)),
  };
  const answered = () => Promise.allSettled(plays);
  return { el, asked, answered };
};

describe('the narration', () => {
  test('a film with no master has nothing to play', () => {
    const n = narration(undefined, () => fakeAudio().el);
    expect(n.state()._tag).toBe('None');
    n.play();
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
    n.play();
    n.play();
    expect(asked).toEqual([]);
  });

  test('a master the element cannot play goes missing on its first play, once', async () => {
    const { el, asked, answered } = fakeAudio('NotSupportedError');
    const n = narration('/a.wav', () => el);
    el.fire('canplay');
    expect(n.ready()).toBe(true);
    n.play();
    await answered();
    expect(n.state()._tag).toBe('Missing');
    n.play();
    expect(asked).toEqual(['play']);
  });

  test('a play refused until a click is blocked, and the next play tries again', async () => {
    const { el, asked, answered } = fakeAudio('NotAllowedError');
    const n = narration('/a.wav', () => el);
    el.fire('canplay');
    n.play();
    await answered();
    expect(n.state()._tag).toBe('Blocked');
    expect(n.ready()).toBe(false);
    n.play();
    expect(asked).toEqual(['play', 'play']);
  });

  test('a play cut short by a pause is no failure', async () => {
    const { el, answered } = fakeAudio('AbortError');
    const n = narration('/a.wav', () => el);
    el.fire('canplay');
    n.play();
    await answered();
    expect(n.state()._tag).toBe('Ready');
  });
});
