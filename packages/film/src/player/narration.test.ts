// The preview's narration, its audio a stand-in element (bun has none) seen
// through the live adapter and the host's `Media`: a film with no master has
// nothing to play; a master that will not load is missing, said once, and
// never asked to play again; one that loads plays; a play the browser
// refuses until a click is blocked, and the next play (a click) tries again;
// a play asked while it loads starts once it can, from where the clock is
// then; a play a pause cut short is no failure.

import { describe, expect, test } from 'bun:test';
import { Effect } from 'effect';
import { fakeMedia, mediaHost } from '../browser/fixtures/media.ts';
import { narration } from './narration.ts';

/** A narration over a stand-in audio that refuses each play with `refuse`, when set. */
const narrated = (src: string | undefined, refuse?: string) => {
  const audio = fakeMedia(refuse);
  return {
    ...audio,
    n: narration(
      src,
      mediaHost(() => audio.media),
    ),
  };
};

describe('the narration', () => {
  test('a film with no master has nothing to play', () => {
    const { n, asked } = narrated(undefined);
    expect(n.state()._tag).toBe('None');
    n.play(() => 0);
    expect(n.ready()).toBe(false);
    expect(asked).toEqual([]);
  });

  test('a master that will not load is missing, and is never asked to play', () => {
    const { el, n, asked } = narrated('/films/f/narration/full.wav');
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
    const { el, n, asked, answered } = narrated('/a.wav', 'NotSupportedError');
    el.finishLoading(3);
    expect(n.ready()).toBe(true);
    n.play(() => 0);
    await Effect.runPromise(answered);
    expect(n.state()._tag).toBe('Missing');
    n.play(() => 0);
    expect(asked).toEqual(['seek 0', 'play']);
  });

  test('a play refused until a click is blocked, and the next play tries again', async () => {
    const { el, n, asked, answered } = narrated('/a.wav', 'NotAllowedError');
    el.finishLoading(3);
    n.play(() => 0);
    await Effect.runPromise(answered);
    expect(n.state()._tag).toBe('Blocked');
    expect(n.ready()).toBe(false);
    n.play(() => 0);
    expect(asked).toEqual(['seek 0', 'play', 'seek 0', 'play']);
  });

  test('a play pressed while it loads starts once it can, from where the clock is then', () => {
    const { el, n, asked } = narrated('/a.wav');
    let T = 1;
    n.play(() => T);
    expect(asked).toEqual([]);
    // The picture ran on its own clock while the master loaded.
    T = 2.5;
    el.finishLoading(3);
    expect(asked).toEqual(['seek 2.5', 'play']);
    expect(n.playingAt()).toBe(2.5);
  });

  test('a pause while it loads takes the wanted play back', () => {
    const { el, n, asked } = narrated('/a.wav');
    n.play(() => 1);
    n.pause();
    el.finishLoading(3);
    expect(asked).toEqual(['pause']);
  });

  test('a play cut short by a pause is no failure', async () => {
    const { el, n, answered } = narrated('/a.wav', 'AbortError');
    el.finishLoading(3);
    n.play(() => 0);
    await Effect.runPromise(answered);
    expect(n.state()._tag).toBe('Ready');
  });
});
