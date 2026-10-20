/**
 * The web's position bar: the browser's own range input, in the accent.
 *
 * The pointer bounds a press: it opens at `pointerdown` (the main button)
 * and ends at the first of `pointerup` (the drag is sent, if it moved the
 * value), `pointercancel` and `lostpointercapture` (the drag is dropped).
 * The browser's `change` ends nothing: Chrome sends none for a drag that
 * comes back to where it began. A move with no press open (a key, a screen
 * reader) seeks at once. With no press open, the bar draws playback.
 *
 * The bar writes whole seconds: a range input fits its value to its step, so
 * a fractional place would leave the input holding another value than the
 * one written.
 */

import { useAccent } from '~/color';

import { type ScrubberProps, useScrub } from './scrub';

export function Scrubber(props: ScrubberProps) {
  const accent = useAccent();
  const scrub = useScrub(props);
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
      onPointerDown={(event) => {
        if (event.button === 0) scrub.press();
      }}
      // React's `onChange` is the DOM's `input` and its `change`; only an
      // `input` is the reader's move.
      onChange={(event) => {
        if (event.nativeEvent.type === 'input') scrub.move(Number(event.currentTarget.value));
      }}
      onPointerUp={scrub.release}
      onPointerCancel={scrub.cancel}
      onLostPointerCapture={scrub.cancel}
      style={{ width: '100%', margin: 0, accentColor: String(accent) }}
    />
  );
}
