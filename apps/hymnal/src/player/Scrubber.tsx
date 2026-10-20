/**
 * The web's position bar: the browser's own range input, in the accent. A
 * drag shows as it goes (`input`) and seeks when the browser says the value
 * is set (`change`: the pointer let go, a key's step, a screen reader's
 * move). A `change` with no drag before it sends nothing, and a gesture the
 * page takes away (`pointercancel`, a scroll) drops the drag unsent.
 *
 * The bar writes whole seconds: a range input fits its value to its step, so
 * a fractional place would leave the input holding another value than the
 * one written, and React would read that difference as the reader's move.
 */

import { useCallback, useRef } from 'react';

import { useAccent } from '~/color';

import { type ScrubberProps, useScrub } from './scrub';

export function Scrubber(props: ScrubberProps) {
  const accent = useAccent();
  const scrub = useScrub(props);
  const latest = useRef(scrub);
  latest.current = scrub;
  // React's `onChange` is the DOM's `input`; the DOM's own `change` is the drag's end.
  const listen = useCallback((bar: HTMLInputElement) => {
    const commit = () => latest.current.commit();
    bar.addEventListener('change', commit);
    return () => bar.removeEventListener('change', commit);
  }, []);
  return (
    <input
      ref={listen}
      type="range"
      aria-label="Position"
      aria-valuetext={scrub.said}
      min={0}
      max={scrub.max}
      step={1}
      value={Math.floor(scrub.value)}
      disabled={scrub.still}
      onChange={(event) => scrub.change(Number(event.currentTarget.value))}
      onPointerCancel={scrub.cancel}
      style={{ width: '100%', margin: 0, accentColor: String(accent) }}
    />
  );
}
