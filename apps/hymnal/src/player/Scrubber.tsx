/**
 * The web's position bar: the browser's own range input, its played part in
 * the accent and the rest in the line role.
 *
 * Each value change says where it came from. A key that steps the bar
 * (`stepOf`) is the bar's own: its `keydown` takes the browser's default
 * and sends the step at once, inside a press or not, so no `input` follows
 * it and nothing outlives the key (a key held at an end moves nothing, and
 * a `keyup` may never come). A press belongs to the pointer that opened it with the main
 * button: it opens at that pointer's `pointerdown` and ends at the first of
 * its `pointerup` (the drag is sent, if it moved the value),
 * `pointercancel` and `lostpointercapture` (the drag is dropped); another
 * pointer's events end nothing. The browser's `change` ends nothing: Chrome
 * sends none for a drag that comes back to where it began. A value change
 * with no press open (a screen reader's) seeks at once. With no press open,
 * the bar draws playback; while the length is unknown the bar is disabled,
 * and draws its thumb and played part in the muted role.
 *
 * The bar writes whole seconds: a range input fits its value to its step
 * (Chrome holds 69.6 as 70), so a fractional place would leave the input on
 * another second than the bar means, and a key's step would start from it.
 */

import { Match, Option } from 'effect';

import { color, useAccent } from '~/color';

import { type ScrubberProps, useScrub } from './scrub';

/**
 * Where a key steps a range input of step 1 from `from`, of `max`, as the
 * browser would (Chromium's `range_input_type.cc`): an arrow a step, a page
 * key a tenth of the range (a step at least), Home and End its ends, fitted
 * to a whole step inside the range. None for a key that steps nothing.
 */
const stepOf = (key: string, from: number, max: number): Option.Option<number> => {
  const page = Math.max(1, max / 10);
  return Match.value(key).pipe(
    Match.when('ArrowRight', () => Option.some(from + 1)),
    Match.when('ArrowUp', () => Option.some(from + 1)),
    Match.when('ArrowLeft', () => Option.some(from - 1)),
    Match.when('ArrowDown', () => Option.some(from - 1)),
    Match.when('PageUp', () => Option.some(from + page)),
    Match.when('PageDown', () => Option.some(from - page)),
    Match.when('Home', () => Option.some(0)),
    Match.when('End', () => Option.some(max)),
    Match.orElse(() => Option.none<number>()),
    // A whole step inside the range: a step rounded past the top falls back one.
    Option.map((to) => Math.min(Math.round(Math.min(Math.max(to, 0), max)), Math.floor(max))),
  );
};

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
input.position:disabled::-webkit-slider-thumb { background: var(--muted); }
input.position:disabled::-moz-range-thumb { background: var(--muted); }
`;

export function Scrubber(props: ScrubberProps) {
  const accent = useAccent();
  const scrub = useScrub(props);
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
          const bar = event.currentTarget;
          for (const to of Option.toArray(
            stepOf(event.key, Number(bar.value), Number(bar.max) || 0),
          )) {
            event.preventDefault();
            scrub.step(to);
          }
        }}
        onPointerDown={(event) => {
          if (event.button === 0) scrub.press(event.pointerId);
        }}
        // React calls `onChange` only for a value it did not write: the reader's.
        onChange={(event) => scrub.move(Number(event.currentTarget.value))}
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
