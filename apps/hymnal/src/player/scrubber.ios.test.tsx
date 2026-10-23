/**
 * iOS's position bar (`Scrubber.ios.tsx`) takes its touch as a gesture
 * handler's pan, a UIKit gesture that begins at the touch, so the sheet's
 * pan cannot take the drag while the finger holds the bar. The touch is
 * played through the pan's own callbacks, as iOS's recognizer reports it
 * (`src/test/gesture.tsx`); the drive on the simulator proves the sheet
 * holds still.
 */

import { describe, expect, it } from 'bun:test';
import { Option } from 'effect';
import { act } from 'react';
import { createRoot } from 'react-dom/client';

import { gestures } from '../test/gesture';
import { Scrubber } from './Scrubber.ios';

/** The bar over a recording `length` seconds long at 0:30, mounted; each seek it sends is kept. */
const mount = (length: Option.Option<number>) => {
  gestures.splice(0);
  const sought: Array<number> = [];
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  act(() =>
    root.render(<Scrubber at={30} length={length} onSeek={(seconds) => sought.push(seconds)} />),
  );
  return {
    sought,
    /** The pan the bar was last drawn with. */
    pan: () => Option.getOrThrow(Option.fromNullishOr(gestures.at(-1))),
    [Symbol.dispose]: () => {
      act(() => root.unmount());
      host.remove();
    },
  };
};

describe('iOS’s position bar', () => {
  it('takes its touch as a pan, which begins at the touch', () => {
    using bar = mount(Option.some(120));
    expect(gestures.length).toBeGreaterThan(0);
    expect(bar.pan().enabled).toBe(true);
  });

  it('sends one seek, to the place under the finger, once the finger lifts', () => {
    using bar = mount(Option.some(120));
    // happy-dom lays the bar out 0 points wide: every place is the start.
    act(() => bar.pan().onBegin?.({ x: 0 }));
    act(() => bar.pan().onUpdate?.({ x: 0 }));
    expect(bar.sought).toEqual([]);
    act(() => bar.pan().onFinalize?.({ x: 0, canceled: false }));
    expect(bar.sought).toEqual([0]);
  });

  it('sends nothing when the touch is taken from it', () => {
    using bar = mount(Option.some(120));
    act(() => bar.pan().onBegin?.({ x: 0 }));
    act(() => bar.pan().onFinalize?.({ x: 0, canceled: true }));
    expect(bar.sought).toEqual([]);
  });

  it('takes no touch while the length is not known', () => {
    using bar = mount(Option.none());
    expect(bar.pan().enabled).toBe(false);
  });
});
