/**
 * The web's position bar: the browser's own range input, in the accent.
 *
 * Each value change says where it came from. A key that steps the bar
 * (`stepKeys`) marks the `input` it causes as a step, sent at once, inside a
 * press or not. A press belongs to the pointer that opened it with the main
 * button: it opens at that pointer's `pointerdown` and ends at the first of
 * its `pointerup` (the drag is sent, if it moved the value),
 * `pointercancel` and `lostpointercapture` (the drag is dropped); another
 * pointer's events end nothing. The browser's `change` ends nothing: Chrome
 * sends none for a drag that comes back to where it began. A change with no
 * key and no press open (a screen reader) seeks at once. With no press open,
 * the bar draws playback.
 *
 * The bar writes whole seconds: a range input fits its value to its step
 * (Chrome holds 69.6 as 70), so a fractional place would leave the input on
 * another second than the bar means, and a key's step would start from it.
 */

import { useRef } from 'react';

import { useAccent } from '~/color';

import { type ScrubberProps, useScrub } from './scrub';

/** The keys a browser steps a range input with. */
const stepKeys: ReadonlySet<string> = new Set([
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'ArrowDown',
  'PageUp',
  'PageDown',
  'Home',
  'End',
]);

export function Scrubber(props: ScrubberProps) {
  const accent = useAccent();
  const scrub = useScrub(props);
  // A key went down that steps the bar: the next value change is its step.
  const stepping = useRef(false);
  return (
    <input
      type="range"
      aria-label="Position"
      aria-valuetext={scrub.said}
      min={0}
      max={scrub.max}
      step={1}
      value={Math.floor(scrub.value)}
      disabled={scrub.still}
      onKeyDown={(event) => {
        if (stepKeys.has(event.key)) stepping.current = true;
      }}
      onKeyUp={() => {
        stepping.current = false;
      }}
      onPointerDown={(event) => {
        if (event.button === 0) scrub.press(event.pointerId);
      }}
      // React calls `onChange` only for a value it did not write: the reader's.
      onChange={(event) => {
        const to = Number(event.currentTarget.value);
        if (stepping.current) {
          stepping.current = false;
          scrub.step(to);
        } else scrub.move(to);
      }}
      onPointerUp={(event) => scrub.lift(event.pointerId)}
      onPointerCancel={(event) => scrub.drop(event.pointerId)}
      onLostPointerCapture={(event) => scrub.drop(event.pointerId)}
      style={{ width: '100%', margin: 0, accentColor: String(accent) }}
    />
  );
}
