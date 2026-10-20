/**
 * The web's position bar: the browser's own range input, its played part in
 * the accent and the rest in the line role.
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

import { Option } from 'effect';
import { useRef } from 'react';

import { color, useAccent } from '~/color';

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

/**
 * The track: a range input drawn by the page (the browser's own draws the
 * part not played in its grey), its thumb a disc in the accent.
 */
const css = `
input.position { appearance: none; -webkit-appearance: none; height: 20px; background-color: transparent; background-repeat: no-repeat; background-position: center; background-size: 100% 4px; cursor: pointer; }
input.position:disabled { cursor: default; }
input.position::-webkit-slider-thumb { -webkit-appearance: none; width: 16px; height: 16px; border-radius: 50%; background: var(--accent); border: none; }
input.position::-moz-range-thumb { width: 16px; height: 16px; border-radius: 50%; background: var(--accent); border: none; }
input.position::-moz-range-track { background: transparent; }
`;

export function Scrubber(props: ScrubberProps) {
  const accent = useAccent();
  const scrub = useScrub(props);
  // A key went down that steps the bar: the next value change is its step.
  const stepping = useRef(false);
  const share = Option.liftPredicate(scrub.max, (max) => max > 0).pipe(
    Option.map((max) => Math.min(scrub.value / max, 1)),
    Option.getOrElse(() => 0),
  );
  const played = `${share * 100}%`;
  return (
    <>
      <style href="hymnal-position" precedence="default">
        {css}
      </style>
      <input
        type="range"
        className="position"
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
        style={{
          width: '100%',
          margin: 0,
          backgroundImage: `linear-gradient(to right, ${String(accent)} ${played}, ${String(color.line)} ${played})`,
        }}
      />
    </>
  );
}
